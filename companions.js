import { ensureUser } from './database/db.js';

export const COMPANION_CATALOG = Object.freeze([
  Object.freeze({ key: 'flamme_fox', name: 'Alev Tilkisi', emoji: '🦊', cost: 500, description: 'Mana izlerini takip eden çevik bir yoldaş.' }),
  Object.freeze({ key: 'moon_owl', name: 'Ay Baykuşu', emoji: '🦉', cost: 650, description: 'Gece keşiflerinde sana eşlik eden bilge bir kuş.' }),
  Object.freeze({ key: 'mimicling', name: 'Minik Mimic', emoji: '📦', cost: 800, description: 'Sürprizlerle dolu, huysuz ama sadık bir sandık.' }),
  Object.freeze({ key: 'snow_wolf', name: 'Kuzey Kurdu', emoji: '🐺', cost: 950, description: 'Kuzey Kıtası’nın soğuğuna dayanıklı yol arkadaşı.' })
]);

export function companionLevelForXp(xp) {
  const value = Number(xp);
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.min(50, Math.floor(Math.sqrt(value / 100)) + 1);
}

export function normalizeCompanionAction(action) {
  return ['feed', 'play', 'train'].includes(action) ? action : null;
}

export async function initCompanionSchema(db) {
  await db.query(
    'CREATE TABLE IF NOT EXISTS user_companions (' +
    'guild_id TEXT NOT NULL, user_id TEXT NOT NULL, companion_key TEXT NOT NULL, ' +
    'xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0), level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50), ' +
    'happiness INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100), ' +
    'energy INTEGER NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100), ' +
    'hunger INTEGER NOT NULL DEFAULT 20 CHECK (hunger BETWEEN 0 AND 100), ' +
    'last_fed_at TIMESTAMPTZ, last_played_at TIMESTAMPTZ, last_trained_at TIMESTAMPTZ, ' +
    'adopted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
    'PRIMARY KEY (guild_id,user_id), ' +
    'FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)'
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_companions_level ON user_companions(guild_id,level DESC,xp DESC)');
}

export async function adoptCompanion(dbPool, input) {
  const companion = COMPANION_CATALOG.find(item => item.key === input.companionKey);
  if (!companion || !input.guildId || !input.userId) return { status: 'invalid_companion' };
  await ensureUser(input.guildId, input.userId);
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const existing = await db.query('SELECT companion_key FROM user_companions WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    if (existing.rowCount) { await db.query('ROLLBACK'); return { status: 'already_has_companion' }; }
    const debit = await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins', [input.guildId, input.userId, companion.cost]);
    if (!debit.rowCount) { await db.query('ROLLBACK'); return { status: 'insufficient_funds', cost: companion.cost }; }
    await db.query('INSERT INTO user_companions(guild_id,user_id,companion_key) VALUES($1,$2,$3)', [input.guildId, input.userId, companion.key]);
    await db.query('COMMIT');
    return { status: 'adopted', companion, balance: Number(debit.rows[0].coins) };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    if (error && error.code === '23505') return { status: 'already_has_companion' };
    throw error;
  } finally { db.release(); }
}

export async function careForCompanion(dbPool, input) {
  const action = normalizeCompanionAction(input.action);
  if (!action) return { status: 'invalid_action' };
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(
      'SELECT companion_key,xp,level,happiness,energy,hunger, ' +
      "(last_fed_at > NOW() - INTERVAL '30 minutes') AS fed_recently, " +
      "(last_played_at > NOW() - INTERVAL '20 minutes') AS played_recently, " +
      "(last_trained_at > NOW() - INTERVAL '60 minutes') AS trained_recently " +
      'FROM user_companions WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    const pet = result.rows[0];
    if (!pet) { await db.query('ROLLBACK'); return { status: 'no_companion' }; }
    const cooldown = action === 'feed' ? pet.fed_recently : action === 'play' ? pet.played_recently : pet.trained_recently;
    if (cooldown) { await db.query('ROLLBACK'); return { status: 'cooldown' }; }
    if (action === 'train') {
      const debit = await db.query('UPDATE users SET coins=coins-100 WHERE guild_id=$1 AND user_id=$2 AND coins>=100 RETURNING coins', [input.guildId, input.userId]);
      if (!debit.rowCount) { await db.query('ROLLBACK'); return { status: 'insufficient_funds', cost: 100 }; }
    }
    const delta = action === 'feed' ? { xp: 5, happiness: 5, energy: 0, hunger: -35, stamp: 'last_fed_at' }
      : action === 'play' ? { xp: 10, happiness: 15, energy: -20, hunger: 10, stamp: 'last_played_at' }
      : { xp: 25, happiness: -5, energy: -30, hunger: 15, stamp: 'last_trained_at' };
    const xp = Number(pet.xp) + delta.xp;
    const updated = await db.query(
      'UPDATE user_companions SET xp=$3,level=$4,happiness=LEAST(100,GREATEST(0,happiness+$5)), ' +
      'energy=LEAST(100,GREATEST(0,energy+$6)),hunger=LEAST(100,GREATEST(0,hunger+$7)),' +
      delta.stamp + '=NOW(),updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 ' +
      'RETURNING companion_key,xp,level,happiness,energy,hunger',
      [input.guildId, input.userId, xp, companionLevelForXp(xp), delta.happiness, delta.energy, delta.hunger]);
    await db.query('COMMIT');
    return { status: 'cared', action, companion: updated.rows[0] };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { db.release(); }
}

export async function getCompanion(dbPool, guildId, userId) {
  const result = await dbPool.query('SELECT companion_key,xp,level,happiness,energy,hunger,adopted_at FROM user_companions WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  const pet = result.rows[0];
  if (!pet) return null;
  return { ...pet, catalog: COMPANION_CATALOG.find(item => item.key === pet.companion_key) || null };
}