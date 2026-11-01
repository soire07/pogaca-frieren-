import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listOwnerAuditLogs, listOwnerErrorLogs, recordOwnerTestRun, listOwnerTestRuns,
  searchOwnerMemories, updateOwnerMemory
} from '../owner-admin.js';

test('audit history applies validated filters, stable pagination and bounded page size', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 12, actor_id: '1553794496234262641', action: 'memory.delete', target: '42', details: { key: 'preference' }, created_at: '2026-11-01T00:00:00Z' }] };
  } };
  const result = await listOwnerAuditLogs(db, { action: 'memory.delete', target: '42', page: 2, limit: 500 });
  assert.match(call.sql, /action ILIKE/);
  assert.match(call.sql, /COALESCE\\(target/);
  assert.match(call.sql, /ORDER BY id DESC/);
  assert.deepEqual(call.params, ['%memory.delete%', '%42%', 50, 50]);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 50);
  assert.equal(result.rows[0].id, 12);
});

test('audit history rejects invalid filters without querying', async () => {
  let called = false;
  await assert.rejects(listOwnerAuditLogs({ query: async () => { called = true; } }, { page: -1 }), /INVALID_AUDIT_PAGE/);
  assert.equal(called, false);
});

test('test reports are stored with bounded metadata and listed newest first', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO owner_test_runs')) return { rows: [{ id: 7, created_at: '2026-11-01T00:00:00Z' }] };
    return { rows: [{ id: 7, target: 'boss hasarı', status: 'PASS', summary: { total: 5, pass: 5, fail: 0 }, created_at: '2026-11-01T00:00:00Z' }] };
  } };
  const saved = await recordOwnerTestRun(db, {
    actorId: '1553794496234262641',
    target: 'boss hasarı',
    report: { status: 'PASS', summary: { total: 5, pass: 5, fail: 0 }, output: 'x'.repeat(50000) }
  });
  assert.equal(saved.id, 7);
  assert.ok(calls[0].params[3].length <= 24000);
  const history = await listOwnerTestRuns(db, { page: 1, limit: 10 });
  assert.equal(history.rows[0].target, 'boss hasarı');
  assert.match(calls[1].sql, /ORDER BY id DESC/);
});

test('memory search supports optional user, guild and key filters without returning unrelated records', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 4, user_id: '123456789012345678', guild_id: '1564945192803639356', memory_key: 'style', memory_value: 'concise' }] };
  } };
  const result = await searchOwnerMemories(db, { userId: '123456789012345678', guildId: '1564945192803639356', key: 'style', limit: 10 });
  assert.match(call.sql, /user_id=\$1/);
  assert.match(call.sql, /guild_id=\$2/);
  assert.match(call.sql, /memory_key ILIKE \$3/);
  assert.deepEqual(call.params, ['123456789012345678', '1564945192803639356', '%style%', 10]);
  assert.equal(result[0].id, 4);
});

test('memory updates validate input and audit only metadata, never memory content', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 8, user_id: '123456789012345678', guild_id: '1564945192803639356', memory_key: 'style' }] };
  } };
  const result = await updateOwnerMemory(db, { id: 8, value: 'Daha kısa yanıtlar', actorId: '1553794496234262641' });
  assert.equal(result.id, 8);
  assert.match(call.sql, /UPDATE frieren_chat_memories/);
  assert.match(call.sql, /INSERT INTO owner_audit_logs/);
  assert.equal(call.params[1], 'Daha kısa yanıtlar');
  assert.match(call.sql, /jsonb_build_object\('userId',user_id,'guildId',guild_id,'key',memory_key\)/);
  await assert.rejects(updateOwnerMemory(db, { id: 8, value: '   ', actorId: '1553794496234262641' }), /INVALID_MEMORY_VALUE/);
});

test('memory edits reject sensitive values before touching the database', async () => {
  let called = false;
  const db = { query: async () => { called = true; return { rows: [] }; } };
  await assert.rejects(updateOwnerMemory(db, {
    id: 8, value: 'Discord bot token abc123', actorId: '1553794496234262641'
  }), /SENSITIVE_MEMORY_REJECTED/);
  assert.equal(called, false);
});

test('error history supports scope filtering and bounded pagination', async () => {
  let call;
  const db = { query: async (sql, params) => {
    call = { sql, params };
    return { rows: [{ id: 9, scope: 'discord', error_type: 'GatewayError', created_at: '2026-11-01T00:00:00Z', total_count: 1 }] };
  } };
  const result = await listOwnerErrorLogs(db, { scope: 'discord', page: 1, limit: 100 });
  assert.match(call.sql, /scope ILIKE/);
  assert.match(call.sql, /ORDER BY id DESC/);
  assert.deepEqual(call.params, ['%discord%', 50, 0]);
  assert.equal(result.rows[0].error_type, 'GatewayError');
});
