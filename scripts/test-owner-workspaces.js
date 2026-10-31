import test from 'node:test';
import assert from 'node:assert/strict';
import { getOwnerDatabaseDiagnostics, renderOwnerWorkspace } from '../owner-workspaces.js';

test('database diagnostics only count validated public table identifiers', async () => {
  const calls = [];
  const db = { query: async (sql) => {
    calls.push(sql);
    if (sql.includes('current_database')) return { rows: [{ database_name: 'frieren', checked_at: '2026-10-31T00:00:00Z' }] };
    if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'users' }, { table_name: 'inventory' }, { table_name: 'unsafe"; DROP TABLE users;--' }] };
    if (sql.includes('COUNT(*)')) return { rows: [{ row_count: '12' }] };
    throw new Error('unexpected query');
  } };
  const result = await getOwnerDatabaseDiagnostics(db);
  assert.equal(result.connected, true);
  assert.deepEqual(result.tables, [{ name: 'users', rows: 12 }, { name: 'inventory', rows: 12 }]);
  assert.equal(calls.filter(sql => sql.includes('COUNT(*)')).length, 2);
  assert.ok(calls.every(sql => !sql.includes('DROP TABLE')));
});

test('AI workspace does not claim readiness when a dependency is missing', () => {
  const html = renderOwnerWorkspace('ai', { aiReadiness: { status: 'ok', discordReady: true, memoryDatabaseReady: false, modelConfigured: true } });
  assert.match(html, /Kontrol gerekli/);
  assert.match(html, /Hafıza veritabanı/);
  assert.match(html, /1564945192803639356/);
});

test('Poğaça workspace clearly labels unfinished RPG controls as read-only', () => {
  const html = renderOwnerWorkspace('pogaca', { rpgMetrics: { players: 3, totalCoins: 45 } });
  assert.match(html, /Oyuncu, eşya, ekonomi/);
  assert.match(html, /salt okunur/);
  assert.match(html, /Komut ve davranışlar/);
});

test('database workspace escapes database names and table names', () => {
  const html = renderOwnerWorkspace('database', { database: { connected: true, databaseName: '<script>', checkedAt: null, tables: [{ name: '<img>', rows: 2 }] } });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img>/);
  assert.match(html, /&lt;script&gt;/);
});

test('AI workspace exposes an authenticated test form and safely renders its report', () => {
  const html = renderOwnerWorkspace('ai', {
    aiReadiness: { status: 'ok', discordReady: true, memoryDatabaseReady: true, modelConfigured: true },
    csrf: 'csrf-token',
    testReport: { summary: { total: 4, pass: 3, fail: 1 }, detail: '<script>alert(1)</script>' }
  });
  assert.match(html, /ai-test-run/);
  assert.match(html, /csrf-token/);
  assert.match(html, /Testleri çalıştır/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
