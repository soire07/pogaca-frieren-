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
  playerMarket: true,
  messageXp: true,
  aiChat: true,
  animeQuiz: true,
  collection: true,
  characterWishlist: true,
  companions: true,
  fishing: true,
  farming: true,
  creatures: false,
  achievements: true,
  dailyRewards: true,
  exploration: true,
  crafting: true,
  story: true,
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
  'basarimlar', 'cantam', 'dinlen', 'dunya', 'gelisim', 'gunluk', 'gunlukgorev',
  'hazineac', 'hazinegecmisi', 'hedefler', 'kesif', 'kesifdefteri', 'kesifliderligi',
  'koleksiyon', 'liderlik', 'macera', 'maceragecmisi', 'maceraistatistik', 'mimic',
  'npc', 'siralama', 'zanaat', 'zanaatustalari'
]);

export function getCommandFeatureKeys(commandName) {
  const name = String(commandName || '').toLocaleLowerCase('tr-TR');
  const keys = [];
  if (/karakter|sinif|class|profil/.test(name) || name === 'parcala') keys.push('character');
  if (/karakteristek|characterwishlist/.test(name)) keys.push('characterWishlist', 'collection');
  if (/yoldas|yoldaş|companion|pet/.test(name)) keys.push('companions');
  if (/^balik$|balık|fishing/.test(name)) keys.push('fishing');
  if (/^sera$|sera|farming/.test(name)) keys.push('farming');
  if (/yaratik|yaratık|creature/.test(name)) keys.push('creatures');
  if (/buyu|büyü|spell|yetenek/.test(name)) keys.push('magic');
  if (/ekipman|envanter|esya|eşya|item|setbonus/.test(name) || name === 'cantam' || name === 'zanaatustalari') keys.push('equipment');
  if (/bakiye|market|magaza|mağaza|ekonomi|takas|trade/.test(name) || ['hazineac', 'hazinegecmisi', 'parcala'].includes(name)) keys.push('economy');
  if (/takas|trade/.test(name)) keys.push('trading');
  if (/^pazar$|playermarket/.test(name)) keys.push('playerMarket','economy','trading');
  if (/gorev|görev|quest/.test(name) || ['hedefler', 'gunlukgorev', 'npc'].includes(name)) keys.push('quests');
  if (/zindan|dungeon/.test(name)) keys.push('dungeons');
  if (/boss/.test(name) || name === 'iblisavasi') keys.push('bosses');
  if (/animequiz|anime-quiz|quiz/.test(name)) keys.push('animeQuiz');
  if (/koleksiyon|karakterarsivi|karakter-arşivi|kesifdefteri/.test(name) || name === 'parcala') keys.push('collection');
  if (/basarim|başarım|achievement/.test(name)) keys.push('achievements');
  if (/gunlukodul|günlüködül|dailyreward/.test(name)) keys.push('dailyRewards');
  if (/kesif|keşif|explor|macera|maceragecmisi|maceraistatistik/.test(name)) keys.push('exploration');
  if (/zanaat|craft|uret|üret/.test(name)) keys.push('crafting');
  if (/hikaye|hikâye|story/.test(name) || name === 'npc') keys.push('story');
  if (/rpg|savas|savaş|dovus|dövüş|arena|siralama|liderlik/.test(name) || RPG_COMMAND_NAMES.has(name)) keys.push('rpg');
  if (keys.some(key => key !== 'animeQuiz')) keys.push('rpg');
  return [...new Set(keys)];
}

export function getComponentCommandName(customId) {
  const id = String(customId || '');
  if (id.startsWith('charpanel:')) return 'karakter';
  if (id.startsWith('market_')) return 'market';
  if (id.startsWith('creature_catch:')) return 'yaratik';
  if (id.startsWith('trade_accept:') || id.startsWith('trade_decline:')) return 'takasteklif';
  return null;
}

export async function areGuildCommandFeaturesEnabled(db, guildId, commandName) {
  const id = String(guildId || '');
  const name = String(commandName || '').toLowerCase();
  if (!SNOWFLAKE.test(id) || !/^[a-z0-9_-]{1,32}$/.test(name)) return false;
  const commandFeatureKey = 'command_' + name.replace(/[^a-z0-9_-]/g, '_');
  const featureKeys = getCommandFeatureKeys(name);
  const states = await Promise.all([
    getGuildFeatureEnabled(db, id, 'commands'),
    getGuildFeatureEnabled(db, id, commandFeatureKey),
    ...featureKeys.map(key => getGuildFeatureEnabled(db, id, key)),
  ]);
  return states.every(enabled => enabled === true);
}
