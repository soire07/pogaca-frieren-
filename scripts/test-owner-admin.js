import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_ID, isOwner, formatDuration, getMaintenanceState, setMaintenanceState,
  createApprovalRequest, reviewApproval, listUserMemories, deleteUserMemory
} from '../owner-admin.js';

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
  assert.rejects(() => reviewApproval(db, 'not-an-id', 'approved', OWNER_ID), { message: 'INVALID_APPROVAL_ID' });
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
