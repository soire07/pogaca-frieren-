import { ensureUser } from './database/db.js';
export const FISHING_COOLDOWN_MS = 1_800_000;
export const FISHING_ZONES = Object.freeze([
  { key: 'kuzey_kiyisi', name: 'Kuzey Kıyısı', minLevel: 1 },
  { key: 'buzul_golu', name: 'Buzul Gölü', minLevel: 10 },
  { key: 'mana_nehri', name: 'Mana Nehri', minLevel: 20 }
]);
export const FISH_CATALOG = Object.freeze([
  { key: 'silver_trout', name: 'Gümüş Alabalık', emoji: '🐟', rarity: 'Yaygın', weight: 55, zones: ['kuzey_kiyisi','buzul_golu'] },
  { key: 'frost_carp', name: 'Buz Sazanı', emoji: '🐠', rarity: 'Yaygın', weight: 35, zones: ['kuzey_kiyisi','buzul_golu'] },
  { key: 'moon_jelly', name: 'Ay Denizanası', emoji: '🪼', rarity: 'Nadir', weight: 9, zones: ['kuzey_kiyisi','mana_nehri'] },
  { key: 'crystal_koi', name: 'Kristal Koi', emoji: '🐡', rarity: 'Destansı', weight: 1, zones: ['buzul_golu','mana_nehri'] },
  { key: 'mana_eel', name: 'Mana Yılanbalığı', emoji: '🐟', rarity: 'Nadir', weight: 18, zones: ['mana_nehri'] },
  { key: 'ancient_sturgeon', name: 'Kadim Mersin Balığı', emoji: '🦈', rarity: 'Efsanevi', weight: 2, zones: ['mana_nehri'] }
]);
export function getFishingZone(key, level = 1) {
  const zone = FISHING_ZONES.find(item => item.key === key);
  if (!zone) return { status: 'invalid_zone' };
  return Number.isInteger(Number(level)) && Number(level) >= zone.minLevel
    ? { status: 'available', zone } : { status: 'locked_zone', zone, requiredLevel: zone.minLevel };
}
export function rollFish(key, random = Math.random) {
  const fish = FISH_CATALOG.filter(item => item.zones.includes(key));
  if (!fish.length) return null;
  const total = fish.reduce((sum, item) => sum + item.weight, 0);
  const point = Math.min(.999999999, Math.max(0, Number(random()) || 0)) * total;
  let cursor = 0;
  for (const item of fish) { cursor += item.weight; if (point < cursor) return item; }
  return fish[fish.length - 1];
}
export async function initFishingSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS user_fishing_state (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, last_fished_at TIMESTAMPTZ,
    total_catches INTEGER NOT NULL DEFAULT 0 CHECK(total_catches >= 0),
    PRIMARY KEY(guild_id,user_id),
    FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
  await db.query(`CREATE TABLE IF NOT EXISTS user_fish_collection (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fish_key TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    first_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,user_id,fish_key),
    FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_fish_collection_count ON user_fish_collection(guild_id,user_id,quantity DESC)');
}
export async function fishAtZone(dbPool, input, { random = Math.random } = {}) {
  if (!input?.guildId || !input?.userId) return { status: 'invalid_input' };
  const zone = FISHING_ZONES.find(item => item.key === input.zoneKey);
  if (!zone) return { status: 'invalid_zone' };
  await ensureUser(input.guildId, input.userId);
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const player = await db.query('SELECT level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId,input.userId]);
    const level = Number(player.rows[0]?.level || 1);
    const access = getFishingZone(zone.key, level);
    if (access.status !== 'available') { await db.query('ROLLBACK'); return { ...access, level }; }
    await db.query('INSERT INTO user_fishing_state(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [input.guildId,input.userId]);
    const state = await db.query("SELECT last_fished_at > NOW() - INTERVAL '30 minutes' AS cooling_down FROM user_fishing_state WHERE guild_id=$1 AND user_id=$2 FOR UPDATE", [input.guildId,input.userId]);
    if (state.rows[0]?.cooling_down) { await db.query('ROLLBACK'); return { status: 'cooldown' }; }
    const caught = rollFish(zone.key, random);
    if (!caught) { await db.query('ROLLBACK'); return { status: 'no_fish' }; }
    await db.query('INSERT INTO user_fish_collection(guild_id,user_id,fish_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,fish_key) DO UPDATE SET quantity=user_fish_collection.quantity+1,last_caught_at=NOW()', [input.guildId,input.userId,caught.key]);
    await db.query('UPDATE user_fishing_state SET last_fished_at=NOW(),total_catches=total_catches+1 WHERE guild_id=$1 AND user_id=$2', [input.guildId,input.userId]);
    await db.query('COMMIT');
    return { status: 'caught', fish: caught, zone, level };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { db.release(); }
}
export async function getFishCollection(db, guildId, userId) {
  const result = await db.query('SELECT fish_key,quantity FROM user_fish_collection WHERE guild_id=$1 AND user_id=$2 AND quantity>0 ORDER BY quantity DESC,fish_key', [guildId,userId]);
  const rows = result.rows || [];
  return { caught: rows.reduce((sum,row) => sum + Number(row.quantity || 0),0), unique: rows.length, totalSpecies: FISH_CATALOG.length,
    entries: rows.map(row => ({ ...row, fish: FISH_CATALOG.find(item => item.key === row.fish_key) || null })) };
}
