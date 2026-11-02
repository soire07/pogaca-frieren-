import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GUILD_FEATURES, areGuildCommandFeaturesEnabled, getCommandFeatureKeys, getComponentCommandName, getGuildFeatureEnabled, initGuildFeatureSettingsSchema, isValidGuildFeatureKey, listGuildFeatureSettings, listGuildFeatureSettingsForGuilds, resetGuildFeatureSetting, setGuildFeatureEnabled } from '../guild-feature-settings.js';

function fakeDb(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT enabled')) return { rows, rowCount: rows.length };
      if (sql.includes('SELECT guild_id,feature_key')) return { rows, rowCount: rows.length };
      if (sql.includes('RETURNING guild_id,feature_key,enabled')) return { rows: [{ guild_id: params[0], feature_key: params[1], enabled: params[2], updated_at: new Date(0) }], rowCount: 1 };
      if (sql.includes('DELETE FROM')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }
  };
}

test('feature keys are validated and defaults preserve existing behavior', () => {
  assert.equal(isValidGuildFeatureKey('messageXp'), true);
  assert.equal(isValidGuildFeatureKey('bad key'), false);
  assert.equal(DEFAULT_GUILD_FEATURES.rpg, true);
  assert.equal(DEFAULT_GUILD_FEATURES.aiChat, true);
  assert.equal(DEFAULT_GUILD_FEATURES.companions, true);
  assert.equal(DEFAULT_GUILD_FEATURES.fishing, true);
  assert.equal(DEFAULT_GUILD_FEATURES.farming, true);
});

test('feature setting schema is isolated and safe to initialize', async () => {
  const db = fakeDb();
  await initGuildFeatureSettingsSchema(db);
  assert.match(db.calls[0].sql, /CREATE TABLE IF NOT EXISTS guild_feature_settings/);
  assert.match(db.calls[0].sql, /PRIMARY KEY \(guild_id, feature_key\)/);
});

test('unconfigured guild features default to enabled', async () => {
  const db = fakeDb([]);
  assert.equal(await getGuildFeatureEnabled(db, '1539562273197260860', 'rpg'), true);
});

test('explicit guild feature override is read from its own guild-scoped row', async () => {
  const db = fakeDb([{ enabled: false }]);
  assert.equal(await getGuildFeatureEnabled(db, '1539562273197260860', 'rpg'), false);
  assert.deepEqual(db.calls[0].params, ['1539562273197260860', 'rpg']);
});

test('invalid guild IDs and feature keys are rejected before querying', async () => {
  const db = fakeDb();
  await assert.rejects(getGuildFeatureEnabled(db, 'invalid', 'rpg'), /INVALID_GUILD_FEATURE/);
  await assert.rejects(setGuildFeatureEnabled(db, { guildId: '1539562273197260860', featureKey: 'rpg', enabled: 'false', actorId: '1553794496234262641' }), /INVALID_GUILD_FEATURE_SETTING/);
  assert.equal(db.calls.length, 0);
});

test('settings are written with guild-scoped upsert', async () => {
  const db = fakeDb();
  const row = await setGuildFeatureEnabled(db, { guildId: '1539562273197260860', featureKey: 'rpg', enabled: false, actorId: '1553794496234262641' });
  assert.equal(row.enabled, false);
  assert.match(db.calls[0].sql, /ON CONFLICT\(guild_id,feature_key\)/);
  assert.deepEqual(db.calls[0].params, ['1539562273197260860', 'rpg', false, '1553794496234262641']);
});

test('settings can be reset to global defaults', async () => {
  const db = fakeDb();
  assert.equal(await resetGuildFeatureSetting(db, { guildId: '1539562273197260860', featureKey: 'rpg' }), false);
  assert.deepEqual(db.calls[0].params, ['1539562273197260860', 'rpg']);
});

test('listing is restricted to the selected guild', async () => {
  const db = fakeDb([]);
  await listGuildFeatureSettings(db, '1564945192803639356');
  assert.deepEqual(db.calls[0].params, ['1564945192803639356']);
});

test('owner panel loads feature settings for all guilds with one query', async () => {
  const db = fakeDb([
    { guild_id: '1539562273197260860', feature_key: 'rpg', enabled: true },
    { guild_id: '1564945192803639356', feature_key: 'economy', enabled: false }
  ]);
  const result = await listGuildFeatureSettingsForGuilds(db, ['1539562273197260860', '1564945192803639356', '1539562273197260860']);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [['1539562273197260860', '1564945192803639356']]);
  assert.equal(result.get('1539562273197260860')[0].feature_key, 'rpg');
  assert.equal(result.get('1564945192803639356')[0].enabled, false);
});

test('bulk guild feature lookup returns an empty map without querying for no guilds', async () => {
  const db = fakeDb();
  const result = await listGuildFeatureSettingsForGuilds(db, []);
  assert.equal(result.size, 0);
  assert.equal(db.calls.length, 0);
});

test('bulk guild feature lookup validates all guild IDs before querying', async () => {
  const db = fakeDb();
  await assert.rejects(listGuildFeatureSettingsForGuilds(db, ['1539562273197260860', 'invalid']), /INVALID_GUILD_ID/);
  assert.equal(db.calls.length, 0);
});

test('entertainment and progression commands map to their guild dashboard modules', () => {
  assert.deepEqual(getCommandFeatureKeys('animequiz'), ['animeQuiz']);
  assert.deepEqual(getCommandFeatureKeys('yoldas'), ['companions', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('balik'), ['fishing', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('sera'), ['farming', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('koleksiyon'), ['collection', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('basarimlar'), ['achievements', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('gunlukodul'), ['dailyRewards', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('kesifdefteri'), ['collection', 'exploration', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('zanaat'), ['crafting', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('hikaye'), ['story', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('takasteklif'), ['economy', 'trading', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('trade'), ['economy', 'trading', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('siralama'), ['rpg'], 'leaderboards must not be gated by the economy module');
  assert.deepEqual(getCommandFeatureKeys('macera'), ['exploration', 'rpg'], 'the main adventure command must honor the exploration toggle');
});


test('guild command feature gate checks global, command-specific, and mapped modules', async () => {
  const db = fakeDb([]);
  assert.equal(await areGuildCommandFeaturesEnabled(db, '1539562273197260860', 'takasteklif'), true);
  assert.deepEqual(db.calls[0].params, ['1539562273197260860', 'commands']);
  assert.deepEqual(db.calls.map(call => call.params[1]), [
    'commands', 'command_takasteklif', 'economy', 'trading', 'rpg'
  ]);
});

test('guild command feature gate blocks a disabled mapped module', async () => {
  const db = fakeDb([{ enabled: false }]);
  assert.equal(await areGuildCommandFeaturesEnabled(db, '1539562273197260860', 'takasteklif'), false);
});

test('guild command feature gate rejects invalid command or guild identifiers', async () => {
  const db = fakeDb();
  assert.equal(await areGuildCommandFeaturesEnabled(db, 'invalid', 'takasteklif'), false);
  assert.equal(await areGuildCommandFeaturesEnabled(db, '1539562273197260860', 'bad command'), false);
  assert.equal(db.calls.length, 0);
});


test('boss, dungeon, and magic duel commands map to their actual guild feature switches', () => {
  assert.deepEqual(getCommandFeatureKeys('ortakboss'), ['bosses', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('katlizindan'), ['dungeons', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('buyusavasi'), ['magic', 'rpg']);
});


test('legacy RPG commands are assigned to their actual guild dashboard modules', () => {
  assert.deepEqual(getCommandFeatureKeys('cantam'), ['equipment', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('zanaatustalari'), ['equipment', 'crafting', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('hazineac'), ['economy', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('hazinegecmisi'), ['economy', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('mimic'), ['rpg']);
  assert.deepEqual(getCommandFeatureKeys('parcala'), ['character', 'economy', 'collection', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('gunluk'), ['rpg']);
  assert.deepEqual(getCommandFeatureKeys('gunlukgorev'), ['quests', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('npc'), ['quests', 'story', 'rpg']);
  assert.deepEqual(getCommandFeatureKeys('liderlik'), ['rpg']);
});

test('interactive component IDs resolve to the same command feature gate as slash commands', () => {
  assert.equal(getComponentCommandName('charpanel:open:123'), 'karakter');
  assert.equal(getComponentCommandName('market_buy:123'), 'market');
  assert.equal(getComponentCommandName('trade_accept:offer-1:123'), 'takasteklif');
  assert.equal(getComponentCommandName('trade_decline:offer-1:123'), 'takasteklif');
  assert.equal(getComponentCommandName('unrelated-component'), null);
});
