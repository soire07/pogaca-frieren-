const SNOWFLAKE = /^\d{17,20}$/;
const KEY_PATTERN = /^[a-z][a-zA-Z0-9_-]{0,79}$/;

export const DEFAULT_GUILD_FEATURES = Object.freeze({
  commands: true,
  rpg: true,
  character: true,
  magic: true,
  equipment: true,
  economy: true,
  quests: true,
  dungeons: true,
  bosses: true,
  trading: true,
  messageXp: true,
  aiChat: true,
});

export function isValidGuildFeatureKey(value) {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

export async function initGuildFeatureSettingsSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_feature_settings (
      guild_id VARCHAR(20) NOT NULL,
      feature_key VARCHAR(80) NOT NULL,
      enabled BOOLEAN NOT NULL,
      updated_by VARCHAR(20) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, feature_key)
    )
  `);
}

export async function getGuildFeatureEnabled(db, guildId, featureKey) {
  const id = String(guildId || '');
  if (!SNOWFLAKE.test(id) || !isValidGuildFeatureKey(featureKey)) {
    throw new Error('INVALID_GUILD_FEATURE');
  }
  const result = await db.query(
    'SELECT enabled FROM guild_feature_settings WHERE guild_id=$1 AND feature_key=$2',
    [id, featureKey]
  );
  if (result.rowCount) return result.rows[0].enabled === true;
  return DEFAULT_GUILD_FEATURES[featureKey] ?? true;
}

export async function listGuildFeatureSettings(db, guildId) {
  const id = String(guildId || '');
  if (!SNOWFLAKE.test(id)) throw new Error('INVALID_GUILD_ID');
  const result = await db.query(
    'SELECT guild_id,feature_key,enabled,updated_by,updated_at FROM guild_feature_settings WHERE guild_id=$1 ORDER BY feature_key',
    [id]
  );
  return result.rows || [];
}

export async function setGuildFeatureEnabled(db, { guildId, featureKey, enabled, actorId }) {
  const id = String(guildId || '');
  const actor = String(actorId || '');
  if (!SNOWFLAKE.test(id) || !SNOWFLAKE.test(actor) || !isValidGuildFeatureKey(featureKey) ||
      typeof enabled !== 'boolean') {
    throw new Error('INVALID_GUILD_FEATURE_SETTING');
  }
  const result = await db.query(
    `INSERT INTO guild_feature_settings(guild_id,feature_key,enabled,updated_by)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(guild_id,feature_key) DO UPDATE
       SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING guild_id,feature_key,enabled,updated_at`,
    [id, featureKey, enabled, actor]
  );
  return result.rows[0];
}

export async function resetGuildFeatureSetting(db, { guildId, featureKey }) {
  const id = String(guildId || '');
  if (!SNOWFLAKE.test(id) || !isValidGuildFeatureKey(featureKey)) {
    throw new Error('INVALID_GUILD_FEATURE_SETTING');
  }
  const result = await db.query(
    'DELETE FROM guild_feature_settings WHERE guild_id=$1 AND feature_key=$2 RETURNING guild_id,feature_key',
    [id, featureKey]
  );
  return Boolean(result.rowCount);
}

export function getCommandFeatureKeys(commandName) {
  const name = String(commandName || '').toLocaleLowerCase('tr-TR');
  const keys = [];
  if (/karakter|sinif|class|profil/.test(name)) keys.push('character');
  if (/buyu|büyü|spell|yetenek/.test(name)) keys.push('magic');
  if (/ekipman|envanter|esya|eşya|item|setbonus/.test(name)) keys.push('equipment');
  if (/bakiye|market|magaza|mağaza|sat|al|ekonomi|takas|trade/.test(name)) keys.push('economy');
  if (/gorev|görev|quest/.test(name)) keys.push('quests');
  if (/zindan|dungeon/.test(name)) keys.push('dungeons');
  if (/boss/.test(name)) keys.push('bosses');
  if (/rpg|savas|savaş|dovus|dövüş|arena/.test(name)) keys.push('rpg');
  return [...new Set(keys)];
}
