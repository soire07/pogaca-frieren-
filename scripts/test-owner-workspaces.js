import test from 'node:test';
import assert from 'node:assert/strict';
import { getOwnerDatabaseDiagnostics, getOwnerDatabaseTablePreview, renderOwnerWorkspace } from '../owner-workspaces.js';

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

test('Poğaça workspace exposes scoped player controls while keeping unsupported edits disabled', () => {
  const html = renderOwnerWorkspace('pogaca', { rpgMetrics: { players: 3, totalCoins: 45 }, guildId: '1539562273197260860', guildOptions: [{ id: '1539562273197260860', name: 'Main' }], player: { user_id: '123456789012345678', character_name: 'Frieren', class_name: 'Mage', level: 2, xp: 300, coins: 45, hp: 80, max_hp: 100, mana: 60, max_mana: 100, inventory: [] } });
  assert.match(html, /Oyuncu arama/);
  assert.match(html, /rpg-resource-adjust/);
  assert.match(html, /Oyuncu silme, HP\/Mana/);
  assert.match(html, /rpg-inventory-adjust/);
  assert.match(html, /rpg-equipment-set/);
  assert.match(html, /Kuşanılan ekipman/);
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
    chatSettings: { enabled: true, style: 'warm', responseLength: 'balanced', loreFocus: true },
    csrf: 'csrf-token',
    testReport: { summary: { total: 4, pass: 3, fail: 1 }, detail: '<script>alert(1)</script>' }
  });
  assert.match(html, /ai-test-run/);
  assert.match(html, /csrf-token/);
  assert.match(html, /Testleri çalıştır/);
  assert.match(html, /frieren-chat-settings/);
  assert.match(html, /Poğaça sohbet kişiliği/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});


test('database table preview uses public-table allowlist and hides sensitive columns', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'users' }] };
    if (sql.includes('information_schema.columns')) return { rows: [
      { column_name: 'user_id', data_type: 'text' },
      { column_name: 'coins', data_type: 'integer' },
      { column_name: 'email', data_type: 'text' },
      { column_name: 'password_hash', data_type: 'text' },
      { column_name: 'setting_value', data_type: 'jsonb' },
      { column_name: 'details', data_type: 'jsonb' }
    ] };
    return { rows: [{ user_id: '123', coins: 40 }] };
  } };
  const preview = await getOwnerDatabaseTablePreview(db, { table: 'users', search: '123' });
  assert.deepEqual(preview.columns, ['user_id','coins']);
  assert.deepEqual(preview.rows, [{ user_id: '123', coins: '40' }]);
  assert.match(calls.at(-1).sql, /LIMIT/);
  assert.ok(!calls.at(-1).sql.includes('email'));
  assert.ok(!calls.at(-1).sql.includes('password_hash'));
  assert.ok(!calls.at(-1).sql.includes('setting_value'));
  assert.ok(!calls.at(-1).sql.includes('details'));
  assert.deepEqual(calls.at(-1).params, ['%123%',25]);
});

test('database table preview rejects identifiers that are not plain public table names', async () => {
  let called = false;
  const db = { query: async () => { called = true; return { rows: [] }; } };
  await assert.rejects(getOwnerDatabaseTablePreview(db, { table: 'users; DROP TABLE users' }), /INVALID_DATABASE_TABLE/);
  assert.equal(called, false);
});


test('Poğaça workspace renders guild-scoped quest create, edit and reversible disable controls', () => {
  const html = renderOwnerWorkspace('pogaca', {
    csrf: 'quest-csrf',
    guildId: '1539562273197260860',
    guildOptions: [{ id: '1539562273197260860', name: 'Main' }],
    dailyQuests: [{
      quest_key: 'northern_trial',
      title: 'Kuzey sınavı',
      description: 'Bugün bir keşif tamamla.',
      objective_type: 'explore',
      class_name: null,
      reward_coins: 250,
      active: true,
      is_system: false
    }]
  });
  assert.match(html, /Günlük görev kataloğu/);
  assert.match(html, /rpg-daily-quest-save/);
  assert.match(html, /rpg-daily-quest-disable/);
  assert.match(html, /northern_trial/);
  assert.match(html, /Kuzey sınavı/);
  assert.match(html, /Yeni görev ekle/);
  assert.match(html, /quest-csrf/);
  assert.match(html, /pasife al/);
});

test('Poğaça workspace escapes owner-managed quest content before rendering', () => {
  const html = renderOwnerWorkspace('pogaca', {
    guildId: '1539562273197260860',
    dailyQuests: [{
      quest_key: 'safe_quest',
      title: '<script>alert(1)</script>',
      description: '<img src=x onerror=alert(1)>',
      objective_type: 'explore',
      reward_coins: 50,
      active: true,
      is_system: false
    }]
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});


test('Poğaça workspace renders guild-scoped dungeon and boss tuning forms', () => {
  const html = renderOwnerWorkspace('pogaca', {
    csrf: 'content-csrf',
    guildId: '1539562273197260860',
    guildOptions: [{ id: '1539562273197260860', name: 'Main' }],
    rpgContent: [
      { content_type: 'dungeon', content_key: 'level_1', active: true, config: { name: 'Merkez Mahzen', minLevel: 1, hp: 160, damage: 8, xp: 45, coins: 55, lootChance: 0.1, loot: 'Mahzen Anahtarı' } },
      { content_type: 'solo_boss', content_key: 'level_1', active: true, config: { name: 'Schattenwolf', minLevel: 1, region: 'Merkez', maxHp: 120, minDamage: 7, maxDamage: 12, coinMin: 90, coinMax: 130, xpMin: 55, xpMax: 85, lootChance: 0.2, loot: ['Kurt Dişi'], special: 'Rudelstoß' } },
      { content_type: 'raid_boss', content_key: 'north-general', active: true, config: { name: 'Kuzey Generali', hp: 220, damage: 14, xp: 180, coins: 220, loot: 'İblis Mührü', weakness: 'spell', weaknessLabel: 'Büyü' } }
    ]
  });
  assert.match(html, /Zindan ve boss kataloğu/);
  assert.match(html, /rpg-content-save/);
  assert.match(html, /rpg-content-disable/);
  assert.match(html, /Schattenwolf/);
  assert.match(html, /Kuzey Generali/);
  assert.match(html, /content-csrf/);
  assert.match(html, /Son aktif içerik kapatılamaz/);
});

test('Poğaça workspace escapes owner-managed boss and dungeon labels', () => {
  const html = renderOwnerWorkspace('pogaca', {
    guildId: '1539562273197260860',
    rpgContent: [{
      content_type: 'dungeon', content_key: 'level_1', active: true,
      config: { name: '<script>alert(1)</script>', minLevel: 1, hp: 160, damage: 8, xp: 45, coins: 55, lootChance: 0.1, loot: '<img src=x>' }
    }]
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});
