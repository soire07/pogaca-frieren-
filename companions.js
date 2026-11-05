import { ensureUser } from './database/db.js';

export const COMPANION_CATALOG = Object.freeze([
  Object.freeze({ key: 'flamme_fox', name: 'Alev Tilkisi', emoji: '🦊', cost: 500, description: 'Mana izlerini takip eden çevik bir yoldaş.', evolutions: Object.freeze([{ name: 'Kor Alev Tilkisi', emoji: '🔥', description: 'Alev manasını savaşta daha iyi yönlendirir.' }, { name: 'Güneş Ruhu Tilkisi', emoji: '☀️', description: 'Keşif ve büyü yolculuklarında parlayan kadim form.' }, { name: 'Ebedî Alev Muhafızı', emoji: '🌟', description: 'Yoldaş bağını tamamlamış efsanevi koruyucu.' }]) }),
  Object.freeze({ key: 'moon_owl', name: 'Ay Baykuşu', emoji: '🦉', cost: 650, description: 'Gece keşiflerinde sana eşlik eden bilge bir kuş.', evolutions: Object.freeze([{ name: 'Yıldız Gözlü Baykuş', emoji: '🌙', description: 'Gece keşiflerinde yıldızların izini sürer.' }, { name: 'Kozmik Kehanet Baykuşu', emoji: '🌌', description: 'Gizli yolları ve tehlikeleri önceden sezer.' }, { name: 'Göksel Bilgelik Bekçisi', emoji: '✨', description: 'Kadim bilgeliğiyle ekibine yol gösterir.' }]) }),
  Object.freeze({ key: 'mimicling', name: 'Minik Mimic', emoji: '📦', cost: 800, description: 'Sürprizlerle dolu, huysuz ama sadık bir sandık.', evolutions: Object.freeze([{ name: 'Hazine Mimic', emoji: '💎', description: 'Bulduğu ganimetleri daha iyi korur.' }, { name: 'Kadim Mimic', emoji: '🗝️', description: 'Unutulmuş zindanların sırlarını tanır.' }, { name: 'Efsanevi Kasa Muhafızı', emoji: '👑', description: 'Loncanın en değerli hazinelerinin koruyucusu.' }]) }),
  Object.freeze({ key: 'snow_wolf', name: 'Kuzey Kurdu', emoji: '🐺', cost: 950, description: 'Kuzey Kıtası’nın soğuğuna dayanıklı yol arkadaşı.', evolutions: Object.freeze([{ name: 'Buz Fırtınası Kurdu', emoji: '❄️', description: 'Kuzey fırtınalarında çevikliğini artırır.' }, { name: 'Kutup Muhafızı', emoji: '🌨️', description: 'Takımını soğuk ve tehlikeli rotalarda korur.' }, { name: 'Kuzeyin Efsanevi Ruhu', emoji: '🐺', description: 'Kuzey Kıtası’nın kadim koruyucu ruhuna dönüşür.' }]) })
]);

export const COMPANION_COSMETICS = Object.freeze([
  Object.freeze({ key: 'starlight_ribbon', name: 'Yıldız Kurdele', emoji: '✨', cost: 250 }),
  Object.freeze({ key: 'frost_cloak', name: 'Buz Pelerini', emoji: '❄️', cost: 400 }),
  Object.freeze({ key: 'mana_circlet', name: 'Mana Tacı', emoji: '🔮', cost: 600 })
]);

export const COMPANION_EVOLUTION_STAGES = Object.freeze([
  Object.freeze({ stage: 1, requiredLevel: 10, cost: 1000 }),
  Object.freeze({ stage: 2, requiredLevel: 25, cost: 3500 }),
  Object.freeze({ stage: 3, requiredLevel: 40, cost: 8000 })
]);
export function normalizeCompanionCosmetic(key) {
  return key === 'default' ? 'default' : COMPANION_COSMETICS.some(item => item.key === key) ? key : null;
}

export function getNextCompanionEvolution(companionKey, currentStage) {
  if (!Number.isInteger(currentStage) || currentStage < 0 || currentStage >= COMPANION_EVOLUTION_STAGES.length) return null;
  const companion = COMPANION_CATALOG.find(item => item.key === companionKey);
  const stage = COMPANION_EVOLUTION_STAGES[currentStage];
  const form = companion?.evolutions?.[currentStage];
  if (!companion || !stage || !form) return null;
  return { ...form, stage: stage.stage, requiredLevel: stage.requiredLevel, cost: stage.cost };
}
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
  await db.query("ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS cosmetic_key TEXT NOT NULL DEFAULT 'default'");
  await db.query('CREATE TABLE IF NOT EXISTS user_companion_cosmetics (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,cosmetic_key TEXT NOT NULL,unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,cosmetic_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)');
  await db.query('ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS evolution_stage INTEGER NOT NULL DEFAULT 0 CHECK (evolution_stage BETWEEN 0 AND 3)');
  await db.query('CREATE TABLE IF NOT EXISTS user_companion_evolution_history (guild_id TEXT NOT NULL,user_id TEXT NOT NULL,stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 3),evolution_name TEXT NOT NULL,coin_cost INTEGER NOT NULL CHECK (coin_cost > 0),evolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,stage),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_companions_level ON user_companions(guild_id,level DESC,xp DESC)');
}

export async function adoptCompanion(dbPool, input) {
  const companion = COMPANION_CATALOG.find(item => item.key === input.companionKey);
  if (!companion || !input.guildId || !input.userId) return { status: 'invalid_companion' };
  await ensureUser(input.guildId, input.userId);
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
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
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
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

export async function equipCompanionCosmetic(dbPool, input) {
  const cosmeticKey = normalizeCompanionCosmetic(input?.cosmeticKey);
  if (!cosmeticKey || !input?.guildId || !input?.userId) return { status: 'invalid_cosmetic' };
  const cosmetic = cosmeticKey === 'default' ? null : COMPANION_COSMETICS.find(item => item.key === cosmeticKey);
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    const companion = await db.query('SELECT companion_key,cosmetic_key FROM user_companions WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    if (!companion.rowCount) { await db.query('ROLLBACK'); return { status: 'no_companion' }; }
    if (cosmeticKey === 'default') {
      await db.query("UPDATE user_companions SET cosmetic_key='default',updated_at=NOW() WHERE guild_id=$1 AND user_id=$2", [input.guildId, input.userId]);
      await db.query('COMMIT');
      return { status: 'equipped', cosmetic: null };
    }
    const owned = await db.query('SELECT cosmetic_key FROM user_companion_cosmetics WHERE guild_id=$1 AND user_id=$2 AND cosmetic_key=$3', [input.guildId, input.userId, cosmeticKey]);
    if (!owned.rowCount) {
      const debit = await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins', [input.guildId, input.userId, cosmetic.cost]);
      if (!debit.rowCount) { await db.query('ROLLBACK'); return { status: 'insufficient_funds', cost: cosmetic.cost }; }
      await db.query('INSERT INTO user_companion_cosmetics(guild_id,user_id,cosmetic_key) VALUES($1,$2,$3)', [input.guildId, input.userId, cosmeticKey]);
    }
    await db.query('UPDATE user_companions SET cosmetic_key=$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [input.guildId, input.userId, cosmeticKey]);
    await db.query('COMMIT');
    return { status: 'equipped', cosmetic, alreadyOwned: Boolean(owned.rowCount) };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { db.release(); }
}
export async function evolveCompanion(dbPool, input) {
  if (!input?.guildId || !input?.userId) return { status: 'invalid_input' };
  await ensureUser(input.guildId, input.userId);
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    const result = await db.query('SELECT companion_key,evolution_stage,level FROM user_companions WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', [input.guildId, input.userId]);
    const pet = result.rows[0];
    if (!pet) { await db.query('ROLLBACK'); return { status: 'no_companion' }; }
    const evolution = getNextCompanionEvolution(pet.companion_key, Number(pet.evolution_stage));
    if (!evolution) { await db.query('ROLLBACK'); return { status: 'max_evolution' }; }
    if (Number(pet.level) < evolution.requiredLevel) {
      await db.query('ROLLBACK');
      return { status: 'level_locked', requiredLevel: evolution.requiredLevel, currentLevel: Number(pet.level) };
    }
    const debit = await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins', [input.guildId, input.userId, evolution.cost]);
    if (!debit.rowCount) { await db.query('ROLLBACK'); return { status: 'insufficient_funds', cost: evolution.cost }; }
    await db.query('UPDATE user_companions SET evolution_stage=$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [input.guildId, input.userId, evolution.stage]);
    await db.query('INSERT INTO user_companion_evolution_history(guild_id,user_id,stage,evolution_name,coin_cost) VALUES($1,$2,$3,$4,$5)', [input.guildId, input.userId, evolution.stage, evolution.name, evolution.cost]);
    await db.query('COMMIT');
    return { status: 'evolved', evolution, balance: Number(debit.rows[0].coins) };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); }
}

export async function getCompanionEvolutionHistory(dbPool, { guildId, userId }) {
  if (!guildId || !userId) return [];
  const result = await dbPool.query(
    'SELECT stage,evolution_name,coin_cost,evolved_at FROM user_companion_evolution_history WHERE guild_id=$1 AND user_id=$2 ORDER BY stage DESC',
    [guildId, userId]
  );
  return result.rows;
}

export async function getCompanion(dbPool, guildId, userId) {
  const result = await dbPool.query('SELECT companion_key,cosmetic_key,evolution_stage,xp,level,happiness,energy,hunger,adopted_at FROM user_companions WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  const pet = result.rows[0];
  if (!pet) return null;
  const catalog = COMPANION_CATALOG.find(item => item.key === pet.companion_key) || null;
  const evolution = catalog?.evolutions?.[Number(pet.evolution_stage) - 1] || null;
  return { ...pet, catalog, evolution, displayName: evolution?.name || catalog?.name || 'Yoldaşın', displayEmoji: evolution?.emoji || catalog?.emoji || '🐾', cosmetic: pet.cosmetic_key === 'default' ? null : COMPANION_COSMETICS.find(item => item.key === pet.cosmetic_key) || null };
}