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

export async function listGuildFeatureSettingsForGuilds(db, guildIds) {
  const ids = [...new Set((Array.isArray(guildIds) ? guildIds : []).map(value => String(value || '')))];
  if (ids.some(id => !SNOWFLAKE.test(id))) throw new Error('INVALID_GUILD_ID');
  const settings = new Map(ids.map(id => [id, []]));
  if (!ids.length) return settings;
  const result = await db.query(
    'SELECT guild_id,feature_key,enabled,updated_by,updated_at FROM guild_feature_settings WHERE guild_id = ANY($1::text[]) ORDER BY guild_id,feature_key',
    [ids]
  );
  for (const row of result.rows || []) {
    const rows = settings.get(String(row.guild_id));
    if (rows) rows.push(row);
  }
  return settings;
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

const RPG_COMMAND_NAMES = new Set([
  'basarimlar', 'cantam', 'dinlen', 'dunya', 'gelisim', 'gunluk', 'gunlukodul',
  'hazineac', 'hazinegecmisi', 'hedefler', 'kesif', 'kesifdefteri', 'kesifliderligi',
  'koleksiyon', 'liderlik', 'macera', 'maceragecmisi', 'maceraistatistik', 'mimic',
  'npc', 'siralama', 'zanaat', 'zanaatustalari'
]);

export function getCommandFeatureKeys(commandName) {
  const name = String(commandName || '').toLocaleLowerCase('tr-TR');
  const keys = [];
  if (/karakter|sinif|class|profil/.test(name) || name === 'parcala') keys.push('character');
  if (/buyu|büyü|spell|yetenek/.test(name)) keys.push('magic');
  if (/ekipman|envanter|esya|eşya|item|setbonus/.test(name) || name === 'cantam' || name.startsWith('zanaat')) keys.push('equipment');
  if (/bakiye|market|magaza|mağaza|ekonomi|takas|trade/.test(name) || name === 'parcala') keys.push('economy');
  if (name === 'takasteklif') keys.push('trading');
  if (/gorev|görev|quest/.test(name) || name === 'hedefler' || name === 'kesifdefteri') keys.push('quests');
  if (/zindan|dungeon/.test(name)) keys.push('dungeons');
  if (/boss/.test(name) || name === 'iblisavasi') keys.push('bosses');
  if (/rpg|savas|savaş|dovus|dövüş|arena/.test(name) || name === 'iblisavasi' || name === 'parcala') keys.push('rpg');
  if (keys.length || RPG_COMMAND_NAMES.has(name)) keys.push('rpg');
  return [...new Set(keys)];
}


export async function isGuildCommandEnabled(db, guildId, commandName) {
  const normalizedName = String(commandName || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!normalizedName) throw new Error('INVALID_GUILD_COMMAND');
  const featureKeys = getCommandFeatureKeys(commandName);
  const keys = ['commands', 'command_' + normalizedName, ...featureKeys];
  const states = await Promise.all(keys.map(key => getGuildFeatureEnabled(db, guildId, key)));
  return states.every(enabled => enabled === true);
}


export function getComponentCommandName(customId) {
  const id = String(customId || '');
  if (id.startsWith('charpanel:')) return 'karakter';
  if (id.startsWith('market_')) return 'market';
  if (id.startsWith('trade_accept:') || id.startsWith('trade_decline:')) return 'takasteklif';
  return null;
}
