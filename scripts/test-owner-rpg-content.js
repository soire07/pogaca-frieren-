import test from 'node:test';
import { chooseRaidBoss } from '../rpg-mechanics.js';
import assert from 'node:assert/strict';
import {
  DEFAULT_DUNGEON_TIERS,
  DEFAULT_SOLO_BOSSES,
  DEFAULT_RAID_BOSSES,
  selectDungeonForLevel
} from '../rpg-content-catalog.js';
import {
  listOwnerRpgContent,
  getGuildRpgContent,
  validateOwnerRpgContentInput,
  saveOwnerRpgContent,
  setOwnerRpgContentActive
} from '../owner-rpg-content.js';

const guildId = '1539562273197260860';
const actorId = '1553794496234262641';

test('RPG content catalog preserves all existing dungeon and boss encounters', () => {
  assert.equal(DEFAULT_DUNGEON_TIERS.length, 4);
  assert.equal(DEFAULT_SOLO_BOSSES.length, 5);
  assert.equal(DEFAULT_RAID_BOSSES.length, 3);
  assert.equal(selectDungeonForLevel(1, DEFAULT_DUNGEON_TIERS).minLevel, 1);
  assert.equal(selectDungeonForLevel(8, DEFAULT_DUNGEON_TIERS).minLevel, 5);
  assert.equal(selectDungeonForLevel(20, DEFAULT_DUNGEON_TIERS).minLevel, 15);
  assert.equal(selectDungeonForLevel(45, DEFAULT_DUNGEON_TIERS).minLevel, 30);
  assert.equal(selectDungeonForLevel(1, DEFAULT_DUNGEON_TIERS.filter(tier => tier.minLevel >= 5)), null);
  assert.equal(chooseRaidBoss(() => 0, [{ id: 'custom-raid-boss' }]).id, 'custom-raid-boss');
});

test('RPG content validation accepts bounded dungeon and boss tuning', () => {
  const dungeon = validateOwnerRpgContentInput({
    guildId, contentType: 'dungeon', contentKey: 'level_1',
    config: { name: 'Merkez Mahzen', hp: 180, damage: 9, xp: 50, coins: 60, lootChance: 0.12, loot: 'Mahzen Anahtarı' },
    reason: 'Denge ayarı', actorId
  });
  assert.equal(dungeon.config.hp, 180);
  assert.equal(dungeon.config.lootChance, 0.12);

  const boss = validateOwnerRpgContentInput({
    guildId, contentType: 'raid_boss', contentKey: 'north-general',
    config: { name: 'Kuzey İblis Generali', hp: 260, damage: 15, xp: 190, coins: 230, loot: 'İblis Mührü', weakness: 'spell', weaknessLabel: 'Büyü' },
    reason: 'Boss dengesi', actorId
  });
  assert.equal(boss.config.hp, 260);
  assert.equal(boss.config.weakness, 'spell');
});

test('RPG content validation rejects unknown keys, unsafe values and invalid weaknesses', () => {
  const base = { guildId, contentType: 'dungeon', contentKey: 'level_1', config: { name: 'Mahzen', hp: 180, damage: 9, xp: 50, coins: 60, lootChance: 0.12, loot: 'Anahtar' }, reason: 'Denge ayarı', actorId };
  assert.throws(() => validateOwnerRpgContentInput({ ...base, contentKey: 'custom_sql' }), /INVALID_RPG_CONTENT/);
  assert.throws(() => validateOwnerRpgContentInput({ ...base, config: { ...base.config, hp: 999999 } }), /INVALID_RPG_CONTENT/);
  assert.throws(() => validateOwnerRpgContentInput({ ...base, contentType: 'raid_boss', contentKey: 'north-general', config: { name: 'Boss', hp: 200, damage: 10, xp: 100, coins: 100, loot: 'Mühür', weakness: 'sql', weaknessLabel: 'Büyü' } }), /INVALID_RPG_CONTENT/);
});

test('RPG content list merges guild overrides without changing other guild defaults', async () => {
  const db = { query: async (_sql, params) => {
    assert.equal(params[0], guildId);
    return { rows: [{ content_type: 'dungeon', content_key: 'level_1', config: { hp: 180, name: 'Özel Mahzen' }, active: true }] };
  } };
  const items = await listOwnerRpgContent(db, { guildId });
  const dungeon = items.find(item => item.content_type === 'dungeon' && item.content_key === 'level_1');
  assert.equal(dungeon.config.hp, 180);
  assert.equal(dungeon.config.name, 'Özel Mahzen');
  assert.equal(dungeon.config.damage, 8);
  const active = await getGuildRpgContent(db, guildId, 'dungeon');
  assert.ok(active.some(item => item.name === 'Özel Mahzen'));
});

test('RPG content save is transactional, guild-scoped and owner-audited', async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO guild_rpg_content_overrides')) return { rows: [{ guild_id: guildId, content_type: 'dungeon', content_key: 'level_1', config: { hp: 180 }, active: true }] };
    if (sql.includes('SELECT content_key,active')) return { rows: [{ content_key: 'level_1', active: true }] };
    return { rows: [] };
  }, release() { calls.push({ sql: 'RELEASE' }); } };
  const saved = await saveOwnerRpgContent({ connect: async () => client }, {
    guildId, contentType: 'dungeon', contentKey: 'level_1',
    config: { name: 'Özel Mahzen', hp: 180, damage: 9, xp: 50, coins: 60, lootChance: 0.12, loot: 'Mahzen Anahtarı' },
    active: true, reason: 'Denge ayarı', actorId
  });
  assert.equal(saved.content_key, 'level_1');
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('RPG content save rolls back if the audit write fails', async () => {
  const calls = [];
  const client = { query: async sql => {
    calls.push(sql);
    if (sql.includes('INSERT INTO owner_audit_logs')) throw new Error('audit unavailable');
    if (sql.includes('INSERT INTO guild_rpg_content_overrides')) return { rows: [{ content_key: 'level_1' }] };
    if (sql.includes('SELECT content_key,active')) return { rows: [{ content_key: 'level_1', active: true }] };
    return { rows: [] };
  }, release() {} };
  await assert.rejects(saveOwnerRpgContent({ connect: async () => client }, {
    guildId, contentType: 'dungeon', contentKey: 'level_1',
    config: { name: 'Özel Mahzen', hp: 180, damage: 9, xp: 50, coins: 60, lootChance: 0.12, loot: 'Mahzen Anahtarı' },
    active: true, reason: 'Denge ayarı', actorId
  }), /audit unavailable/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
});

test('the last active dungeon or boss cannot be disabled', async () => {
  const keys = ['level_1','level_5','level_15','level_30'];
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO guild_rpg_content_overrides')) return { rows: [{ content_key: 'level_1', active: false }], rowCount: 1 };
    if (sql.includes('SELECT content_key,active')) return { rows: keys.map(content_key => ({ content_key, active: false })) };
    return { rows: [] };
  }, release() {} };
  await assert.rejects(setOwnerRpgContentActive({ connect: async () => client }, {
    guildId, contentType: 'dungeon', contentKey: 'level_1',
    active: false, reason: 'Geçici kapatma', actorId
  }), /LAST_ACTIVE_RPG_CONTENT/);
  assert.ok(calls.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some(call => call.sql === 'COMMIT'));
});


test('live dungeon and boss commands consume the guild-scoped content catalog', async () => {
  const { readFile } = await import('node:fs/promises');
  const [dungeon, soloBoss, raidBoss, schema] = await Promise.all([
    readFile(new URL('../zindan.js', import.meta.url), 'utf8'),
    readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8'),
    readFile(new URL('../ortakboss.js', import.meta.url), 'utf8'),
    readFile(new URL('../database/db.js', import.meta.url), 'utf8')
  ]);
  assert.ok(dungeon.includes("getGuildRpgContent(db, interaction.guildId, 'dungeon')"));
  assert.ok(dungeon.includes('selectDungeonForLevel(averageLevel, dungeonTiers)'));
  assert.ok(soloBoss.includes("getGuildRpgContent(pool, interaction.guildId, 'solo_boss')"));
  assert.ok(soloBoss.includes('unlockedBossTiers'));
  assert.ok(raidBoss.includes("getGuildRpgContent(pool, interaction.guildId, 'raid_boss')"));
  assert.ok(raidBoss.includes('chooseRaidBoss(Math.random, raidBosses)'));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS guild_rpg_content_overrides'));
});
