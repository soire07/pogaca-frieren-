import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GUILD_FEATURES, getGuildFeatureEnabled, initGuildFeatureSettingsSchema, isValidGuildFeatureKey, listGuildFeatureSettings, resetGuildFeatureSetting, setGuildFeatureEnabled } from '../guild-feature-settings.js';

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
