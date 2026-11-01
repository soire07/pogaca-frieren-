import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_ID, isOwner, formatDuration, initOwnerAdminSchema, getMaintenanceState, setMaintenanceState, getOwnerOverview, getRecentOwnerActivity,
  createApprovalRequest, reviewApproval, listUserMemories, deleteUserMemory
} from '../owner-admin.js';

test('owner overview loads database health and counters with one query', async () => {
  let calls = 0;
  const client = { isReady: () => true, guilds: { cache: new Map() }, commands: { size: 68 }, ws: { ping: 42 }, uptime: 60000 };
  const db = { query: async sql => {
    calls += 1;
    assert.match(sql, /frieren_chat_memories/);
    assert.match(sql, /owner_approval_requests/);
    assert.match(sql, /owner_settings/);
    return { rows: [{ ok: 1, memory_count: 9, pending_count: 2, maintenance_value: { enabled: true } }] };
  } };
  const result = await getOwnerOverview(client, db);
  assert.equal(calls, 1);
  assert.equal(result.databaseReady, true);
  assert.equal(result.memoryCount, 9);
  assert.equal(result.pendingApprovals, 2);
  assert.equal(result.maintenance, true);
});

test('owner activity dashboard reads all three feeds in one SQL round trip', async () => {
  let calls = 0;
  const expected = { commands: [{ command_name: 'ping' }], errors: [], audit: [{ action: 'login' }] };
  const db = { query: async sql => {
    calls += 1;
    assert.match(sql, /owner_command_metrics/);
    assert.match(sql, /owner_error_logs/);
    assert.match(sql, /owner_audit_logs/);
    return { rows: [expected] };
  } };
  assert.deepEqual(await getRecentOwnerActivity(db), expected);
  assert.equal(calls, 1);
});

test('owner access is restricted to the configured owner ID', () => {
  assert.equal(isOwner(OWNER_ID), true);
  assert.equal(isOwner('1553794496234262642'), false);
  assert.equal(isOwner(undefined), false);
});

test('uptime formatting is stable for day, hour, minute and second values', () => {
  assert.equal(formatDuration(90061), '1g 1sa 1dk 1sn');
  assert.equal(formatDuration(0), '0sn');
});

test('maintenance state is read from the persisted owner setting', async () => {
  const db = { query: async () => ({ rows: [{ setting_value: { enabled: true } }] }) };
  assert.equal(await getMaintenanceState(db), true);
});

test('maintenance state and audit are written in one atomic statement', async () => {
  let call;
  const db = { query: async (sql, params) => { call = { sql, params }; return { rows: [], rowCount: 1 }; } };
  assert.equal(await setMaintenanceState(db, true, OWNER_ID), true);
  assert.match(call.sql, /WITH changed AS/);
  assert.match(call.sql, /INSERT INTO owner_audit_logs/);
  assert.deepEqual(JSON.parse(call.params[0]), { enabled: true });
  assert.deepEqual(JSON.parse(call.params[2]), { enabled: true });
});

test('technical requests are queued without allowing obvious secrets', async () => {
  let inserted;
  const db = { query: async (sql, params) => { inserted = params; return { rows: [{ id: 41 }] }; } };
  const id = await createApprovalRequest(db, {
    requesterId: '123', requesterTag: 'user#0001', requestType: 'kod',
    title: 'Komut ekleme', details: 'Yeni bir eğlence komutu eklenmesini istiyorum.'
  });
  assert.equal(id, 41);
  assert.equal(inserted[2], 'kod');
  await assert.rejects(() => createApprovalRequest(db, {
    requesterId: '123', requesterTag: 'user', requestType: 'kod',
    title: 'Anahtar', details: 'Discord bot token: abc'
  }), { message: 'POSSIBLE_SECRET_IN_REQUEST' });
});

test('approval decision and audit are atomic and only pending requests can change', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rowCount: 1, rows: [{ id: 9, status: 'approved', title: 'Talep' }] };
  } };
  const result = await reviewApproval(db, 9, 'approved', OWNER_ID);
  assert.equal(result.status, 'approved');
  assert.match(call.sql, /status='pending'/);
  assert.match(call.sql, /INSERT INTO owner_audit_logs/);
  assert.equal(call.params[0], 9);
  await assert.rejects(() => reviewApproval(db, 'not-an-id', 'approved', OWNER_ID), { message: 'INVALID_APPROVAL_ID' });
});

test('memory lookup scopes by user and optional guild', async () => {
  let params;
  const db = { query: async (_sql, values) => { params = values; return { rows: [{ id: 3 }] }; } };
  const rows = await listUserMemories(db, '456', '789', 500);
  assert.equal(rows[0].id, 3);
  assert.deepEqual(params, ['456', '789', 50]);
});

test('memory deletion and metadata audit are atomic and never log memory content', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rowCount: 1, rows: [{ id: 7, guild_id: '1', user_id: '2', memory_key: 'hobi' }] };
  } };
  const result = await deleteUserMemory(db, 7, OWNER_ID);
  assert.equal(result.id, 7);
  assert.match(call.sql, /DELETE FROM frieren_chat_memories/);
  assert.match(call.sql, /INSERT INTO owner_audit_logs/);
  assert.doesNotMatch(JSON.stringify(call.params), /memory_value/);
  await assert.rejects(() => deleteUserMemory(db, 'not-an-id', OWNER_ID), { message: 'INVALID_MEMORY_ID' });
});


test('announcement rejects a channel that belongs to a different guild', async () => {
  let sent = false;
  const channel = {
    id: '222222222222222222',
    guildId: '333333333333333333',
    isTextBased: () => true,
    send: async () => { sent = true; return { id: 'message-1' }; }
  };
  const guild = {
    id: '111111111111111111',
    name: 'Guild A',
    channels: { fetch: async () => channel },
    members: { me: { id: 'bot' } }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };
  const db = { query: async () => ({ rows: [], rowCount: 1 }) };
  const { sendOwnerAnnouncement } = await import('../owner-admin.js');
  await assert.rejects(() => sendOwnerAnnouncement(client, db, {
    guildId: guild.id, channelId: channel.id, message: 'Test', actorId: OWNER_ID
  }), { message: 'CHANNEL_GUILD_MISMATCH' });
  assert.equal(sent, false);
});


test('announcement uses the thread-specific send permission for thread channels', async () => {
  let sent = false;
  const channel = {
    id: '222222222222222222',
    guildId: '111111111111111111',
    name: 'duyurular-thread',
    isTextBased: () => true,
    isThread: () => true,
    permissionsFor: () => ({ has: permission => permission === 'SendMessagesInThreads' }),
    send: async () => { sent = true; return { id: 'message-thread' }; }
  };
  const guild = {
    id: '111111111111111111',
    name: 'Guild A',
    channels: { fetch: async () => channel },
    members: { me: { id: 'bot' } }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };
  const db = { query: async () => ({ rows: [], rowCount: 1 }) };
  const { sendOwnerAnnouncement } = await import('../owner-admin.js');
  const result = await sendOwnerAnnouncement(client, db, {
    guildId: guild.id, channelId: channel.id, message: 'Test thread', actorId: OWNER_ID
  });
  assert.equal(sent, true);
  assert.equal(result.messageId, 'message-thread');
});

test('announcement does not accept ordinary channel permission as a substitute for thread permission', async () => {
  const channel = {
    id: '222222222222222222',
    guildId: '111111111111111111',
    isTextBased: () => true,
    isThread: () => true,
    permissionsFor: () => ({ has: permission => permission === 'SendMessages' }),
    send: async () => ({ id: 'message-thread' })
  };
  const guild = {
    id: '111111111111111111',
    name: 'Guild A',
    channels: { fetch: async () => channel },
    members: { me: { id: 'bot' } }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };
  const db = { query: async () => ({ rows: [], rowCount: 1 }) };
  const { sendOwnerAnnouncement } = await import('../owner-admin.js');
  await assert.rejects(() => sendOwnerAnnouncement(client, db, {
    guildId: guild.id, channelId: channel.id, message: 'Test thread', actorId: OWNER_ID
  }), { message: 'MISSING_SEND_PERMISSION' });
});

test('owner schema creates a bounded test-run history table and recent index', async () => {
  let sql = '';
  await initOwnerAdminSchema({ query: async statement => { sql = statement; return { rows: [] }; } });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS owner_test_runs/);
  assert.match(sql, /idx_owner_test_runs_recent/);
  assert.match(sql, /summary JSONB NOT NULL/);
  assert.match(sql, /details JSONB NOT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS owner_guardian_incidents/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS owner_guardian_jobs/);
  assert.match(sql, /idx_owner_guardian_jobs_active/);
  assert.match(sql, /repair_dispatch_status/);
  assert.match(sql, /repair_run_url/);
  assert.match(sql, /repair_pr_url/);
  assert.match(sql, /repair_checks_status/);
  assert.match(sql, /owner_guardian_monitor_state/);
});
