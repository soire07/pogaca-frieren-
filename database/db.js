import pg from 'pg';
import { safeDatabaseHostname } from './connection-diagnostics.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.warn('UYARI: DATABASE_URL ayarlı değil. Bot veritabanı olmadan başlatılamaz.');
}

const productionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
const testContext = new AsyncLocalStorage();
const isolatedTestPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  options: '-c search_path=frieren_test',
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000
});
export const pool = new Proxy(productionPool, {
  get(target, property) {
    if (property === 'query') return (...args) => (testContext.getStore() ? isolatedTestPool : target).query(...args);
    if (property === 'connect') return (...args) => (testContext.getStore() ? isolatedTestPool : target).connect(...args);
    return Reflect.get(target, property, target);
  }
});

// Commands executed by Frieren AI are routed into a dedicated PostgreSQL schema.
// This keeps test rows/tables separate from production tables even on the free DB plan.
let testSchemaQueue = Promise.resolve();
export async function withIsolatedTestSchema(callback) {
  const previous = testSchemaQueue;
  let release;
  testSchemaQueue = new Promise(resolve => { release = resolve; });
  await previous;
  let lockClient;
  let lockAcquired = false;
  try {
    lockClient = await productionPool.connect();
    await lockClient.query('SELECT pg_advisory_lock(20261030, 1)');
    lockAcquired = true;
    await productionPool.query('CREATE SCHEMA IF NOT EXISTS frieren_test');
    return await testContext.run(true, async () => {
      await initDatabase();
      return await callback();
    });
  } finally {
    if (lockClient && lockAcquired) {
      await lockClient.query('SELECT pg_advisory_unlock(20261030, 1)').catch(() => {});
    }
    lockClient?.release();
    release();
  }
}

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
      class_name TEXT NOT NULL DEFAULT 'Gezgin',
      character_name TEXT,
      hp INTEGER NOT NULL DEFAULT 100 CHECK (hp >= 0),
      max_hp INTEGER NOT NULL DEFAULT 100 CHECK (max_hp >= 1),
      mana INTEGER NOT NULL DEFAULT 100 CHECK (mana >= 0),
      max_mana INTEGER NOT NULL DEFAULT 100 CHECK (max_mana >= 1),
      attack INTEGER NOT NULL DEFAULT 10 CHECK (attack >= 0),
      defense INTEGER NOT NULL DEFAULT 5 CHECK (defense >= 0),
      stat_points INTEGER NOT NULL DEFAULT 0 CHECK (stat_points >= 0),
      last_xp_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
      last_daily_at TIMESTAMPTZ,
      last_adventure_at TIMESTAMPTZ,
      last_boss_at TIMESTAMPTZ,
      last_boss_win_at TIMESTAMPTZ,
      last_rest_at TIMESTAMPTZ,
      last_exploration_at TIMESTAMPTZ,
      last_item_used_at TIMESTAMPTZ,
      exploration_count INTEGER NOT NULL DEFAULT 0 CHECK (exploration_count >= 0),
      items_used_count INTEGER NOT NULL DEFAULT 0 CHECK (items_used_count >= 0),
      boss_defeats INTEGER NOT NULL DEFAULT 0 CHECK (boss_defeats >= 0),
      dungeon_wins INTEGER NOT NULL DEFAULT 0 CHECK (dungeon_wins >= 0),
      dungeon_runs INTEGER NOT NULL DEFAULT 0 CHECK (dungeon_runs >= 0),
      pity_count INTEGER NOT NULL DEFAULT 0 CHECK (pity_count >= 0),
      free_character_pity_count INTEGER NOT NULL DEFAULT 0 CHECK (free_character_pity_count >= 0),
      last_free_character_at TIMESTAMPTZ,
      character_draw_count INTEGER NOT NULL DEFAULT 0 CHECK (character_draw_count >= 0),
      last_character_draw_at TIMESTAMPTZ,
      character_draw_cooldown_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_adventure_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_dungeon_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS best_daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_daily_streak >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS hp INTEGER NOT NULL DEFAULT 100 CHECK (hp >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 100 CHECK (max_hp >= 1);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mana INTEGER NOT NULL DEFAULT 100 CHECK (mana >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS max_mana INTEGER NOT NULL DEFAULT 100 CHECK (max_mana >= 1);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS attack INTEGER NOT NULL DEFAULT 10 CHECK (attack >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS defense INTEGER NOT NULL DEFAULT 5 CHECK (defense >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stat_points INTEGER NOT NULL DEFAULT 0 CHECK (stat_points >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active_build TEXT NOT NULL DEFAULT 'dengeli';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS character_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boss_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boss_win_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rest_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_exploration_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_item_used_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS exploration_count INTEGER NOT NULL DEFAULT 0 CHECK (exploration_count >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS items_used_count INTEGER NOT NULL DEFAULT 0 CHECK (items_used_count >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS boss_defeats INTEGER NOT NULL DEFAULT 0 CHECK (boss_defeats >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS dungeon_wins INTEGER NOT NULL DEFAULT 0 CHECK (dungeon_wins >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS dungeon_runs INTEGER NOT NULL DEFAULT 0 CHECK (dungeon_runs >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pity_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS free_character_pity_count INTEGER NOT NULL DEFAULT 0 CHECK (free_character_pity_count >= 0);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_free_character_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS character_draw_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_character_draw_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS character_draw_cooldown_until TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      PRIMARY KEY (guild_id, user_id, item_key),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS active_rpg_encounters (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL,
      encounter_type TEXT NOT NULL CHECK (encounter_type IN ('dungeon','raid')),
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_active_rpg_encounters_expiry ON active_rpg_encounters(expires_at);
    CREATE TABLE IF NOT EXISTS user_equipment (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('weapon','armor','ring1','ring2')),
      item_key TEXT NOT NULL,
      equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,slot),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_equipment_user ON user_equipment(guild_id,user_id);
    CREATE TABLE IF NOT EXISTS learned_spells (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      spell_key TEXT NOT NULL,
      learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id, spell_key),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_learned_spells_user ON learned_spells(guild_id, user_id);
    CREATE TABLE IF NOT EXISTS spell_mastery (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      spell_key TEXT NOT NULL,
      casts INTEGER NOT NULL DEFAULT 0 CHECK (casts >= 0),
      mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 10),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,spell_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trade_offers (
      offer_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','invalid')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      resolved_at TIMESTAMPTZ,
      CHECK (from_user_id <> to_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_trade_offers_pending ON trade_offers(guild_id, to_user_id, expires_at) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_trade_offers_pending_sender ON trade_offers(guild_id, from_user_id, character_name, expires_at) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS moderation_cases (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'Sebep belirtilmedi',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      welcome_channel_id TEXT,
      welcome_message TEXT NOT NULL DEFAULT 'Hoş geldin {user}! 🥐 {server} sunucusuna katıldın.',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT 'Hoş geldin {user}! 🥐 {server} sunucusuna katıldın.';
    CREATE TABLE IF NOT EXISTS achievement_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,achievement_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS story_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      current_chapter INTEGER NOT NULL DEFAULT 0 CHECK (current_chapter >= 0),
      choices JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS side_quest_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      quest_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id, quest_key),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS daily_mission_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      mission_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,mission_date,mission_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS guild_daily_quests (
      guild_id TEXT NOT NULL,
      quest_key VARCHAR(40) NOT NULL CHECK (quest_key ~ '^[a-z][a-z0-9_]{1,39}    CREATE TABLE IF NOT EXISTS adventure_discoveries (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,discovery_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS treasure_openings (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      loot_item TEXT NOT NULL,
      coins INTEGER NOT NULL CHECK (coins >= 0),
      xp INTEGER NOT NULL CHECK (xp >= 0),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_treasure_openings_user_recent
      ON treasure_openings(guild_id,user_id,opened_at DESC);
    CREATE TABLE IF NOT EXISTS daily_crafting_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      crafted_items INTEGER NOT NULL DEFAULT 0 CHECK (crafted_items >= 0),
      claimed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,mission_date),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_crafting_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      successful_crafts INTEGER NOT NULL DEFAULT 0 CHECK (successful_crafts >= 0),
      salvaged_items INTEGER NOT NULL DEFAULT 0 CHECK (salvaged_items >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE user_crafting_progress ADD COLUMN IF NOT EXISTS salvaged_items INTEGER NOT NULL DEFAULT 0 CHECK (salvaged_items >= 0);
    CREATE TABLE IF NOT EXISTS adventure_history (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      outcome_text TEXT NOT NULL,
      coins_awarded INTEGER NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
      xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
      item_found TEXT,
      first_discovery BOOLEAN NOT NULL DEFAULT FALSE,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_adventure_history_user_recent
      ON adventure_history(guild_id,user_id,occurred_at DESC);
    CREATE TABLE IF NOT EXISTS adventure_treasure_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fragments INTEGER NOT NULL DEFAULT 0 CHECK (fragments BETWEEN 0 AND 4),
      treasures_opened INTEGER NOT NULL DEFAULT 0 CHECK (treasures_opened >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_streaks (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
      best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
      last_visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE adventure_streaks ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0);
    CREATE TABLE IF NOT EXISTS exploration_region_mastery (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      region_key TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,region_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_route_mastery (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      route_key TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,route_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_journal_entries (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, collection_key TEXT NOT NULL,
      entry_key TEXT NOT NULL, discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,collection_key,entry_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_adventure_journal_entries_user
      ON adventure_journal_entries(guild_id,user_id,collection_key);
    CREATE TABLE IF NOT EXISTS adventure_journal_collection_claims (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, collection_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,collection_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_journal_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_talents (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      attack_rank INTEGER NOT NULL DEFAULT 0 CHECK (attack_rank BETWEEN 0 AND 3),
      defense_rank INTEGER NOT NULL DEFAULT 0 CHECK (defense_rank BETWEEN 0 AND 3),
      hp_rank INTEGER NOT NULL DEFAULT 0 CHECK (hp_rank BETWEEN 0 AND 3),
      mana_rank INTEGER NOT NULL DEFAULT 0 CHECK (mana_rank BETWEEN 0 AND 3),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS daily_quest_chains (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chain_date DATE NOT NULL DEFAULT CURRENT_DATE,
      current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,chain_date),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS anime_character_collection (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      anime TEXT NOT NULL,
      rarity TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🎭',
      color INTEGER NOT NULL DEFAULT 10194172,
      description TEXT NOT NULL DEFAULT '',
      traits TEXT NOT NULL DEFAULT '',
      image TEXT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id, character_name),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS character_upgrades (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level >= 0 AND upgrade_level <= 10),
      PRIMARY KEY (guild_id,user_id,character_name),
      FOREIGN KEY (guild_id,user_id,character_name) REFERENCES anime_character_collection(guild_id,user_id,character_name) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_moderation_target ON moderation_cases(guild_id, target_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_anime_collection_user ON anime_character_collection(guild_id, user_id);
    CREATE TABLE IF NOT EXISTS frieren_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE frieren_chat_messages ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT 'legacy';
    CREATE INDEX IF NOT EXISTS idx_frieren_chat_history_channel
      ON frieren_chat_messages(guild_id,user_id,channel_id,id DESC);
    CREATE TABLE IF NOT EXISTS frieren_chat_memories (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      memory_key VARCHAR(60) NOT NULL,
      memory_value VARCHAR(300) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id,user_id,memory_key)
    );
    CREATE INDEX IF NOT EXISTS idx_frieren_chat_memories_scope
      ON frieren_chat_memories(guild_id,user_id,updated_at DESC);
  `);
  if (!testContext.getStore()) {
    await pool.query(`DELETE FROM frieren_chat_messages
      WHERE created_at < NOW() - INTERVAL '90 days'`);
  }
  const connectionCheck = await pool.query('SELECT current_database() AS database_name');
  console.log('PostgreSQL bağlantısı doğrulandı; veritabanı:', connectionCheck.rows[0]?.database_name ?? 'bilinmiyor');
  console.log('PostgreSQL endpoint host (safe):', safeDatabaseHostname(process.env.DATABASE_URL) ?? 'unavailable');
  console.log('PostgreSQL tabloları hazır.');
}

export async function ensureUser(guildId, userId) {
  await pool.query(
    'INSERT INTO users (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING',
    [guildId, userId]
  );
  await pool.query(
    'INSERT INTO user_talents (guild_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [guildId, userId]
  );
  // Zoltraak is the starter spell for every adventurer; existing users receive it too.
  await pool.query(
    "INSERT INTO learned_spells (guild_id, user_id, spell_key) VALUES ($1, $2, 'zoltraak') ON CONFLICT DO NOTHING",
    [guildId, userId]
  );
}
),
      title VARCHAR(80) NOT NULL,
      description VARCHAR(240) NOT NULL,
      objective_type TEXT NOT NULL CHECK (objective_type IN ('adventure','daily','draw','explore','item','boss_fight','boss_win','spell')),
      class_name TEXT CHECK (class_name IS NULL OR class_name IN ('Büyücü','Muhafız','Şifacı','Gezgin')),
      reward_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins BETWEEN 0 AND 5000),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,quest_key)
    );
    CREATE INDEX IF NOT EXISTS idx_guild_daily_quests_active
      ON guild_daily_quests(guild_id,active,title);
    CREATE TABLE IF NOT EXISTS adventure_discoveries (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,discovery_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS treasure_openings (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      loot_item TEXT NOT NULL,
      coins INTEGER NOT NULL CHECK (coins >= 0),
      xp INTEGER NOT NULL CHECK (xp >= 0),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_treasure_openings_user_recent
      ON treasure_openings(guild_id,user_id,opened_at DESC);
    CREATE TABLE IF NOT EXISTS daily_crafting_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
      crafted_items INTEGER NOT NULL DEFAULT 0 CHECK (crafted_items >= 0),
      claimed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,mission_date),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_crafting_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      successful_crafts INTEGER NOT NULL DEFAULT 0 CHECK (successful_crafts >= 0),
      salvaged_items INTEGER NOT NULL DEFAULT 0 CHECK (salvaged_items >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE user_crafting_progress ADD COLUMN IF NOT EXISTS salvaged_items INTEGER NOT NULL DEFAULT 0 CHECK (salvaged_items >= 0);
    CREATE TABLE IF NOT EXISTS adventure_history (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      outcome_text TEXT NOT NULL,
      coins_awarded INTEGER NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
      xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
      item_found TEXT,
      first_discovery BOOLEAN NOT NULL DEFAULT FALSE,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_adventure_history_user_recent
      ON adventure_history(guild_id,user_id,occurred_at DESC);
    CREATE TABLE IF NOT EXISTS adventure_treasure_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fragments INTEGER NOT NULL DEFAULT 0 CHECK (fragments BETWEEN 0 AND 4),
      treasures_opened INTEGER NOT NULL DEFAULT 0 CHECK (treasures_opened >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_streaks (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
      best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
      last_visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE adventure_streaks ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0);
    CREATE TABLE IF NOT EXISTS exploration_region_mastery (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      region_key TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,region_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_route_mastery (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      route_key TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,route_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_journal_entries (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, collection_key TEXT NOT NULL,
      entry_key TEXT NOT NULL, discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,collection_key,entry_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_adventure_journal_entries_user
      ON adventure_journal_entries(guild_id,user_id,collection_key);
    CREATE TABLE IF NOT EXISTS adventure_journal_collection_claims (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, collection_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,collection_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_journal_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_talents (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      attack_rank INTEGER NOT NULL DEFAULT 0 CHECK (attack_rank BETWEEN 0 AND 3),
      defense_rank INTEGER NOT NULL DEFAULT 0 CHECK (defense_rank BETWEEN 0 AND 3),
      hp_rank INTEGER NOT NULL DEFAULT 0 CHECK (hp_rank BETWEEN 0 AND 3),
      mana_rank INTEGER NOT NULL DEFAULT 0 CHECK (mana_rank BETWEEN 0 AND 3),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS daily_quest_chains (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chain_date DATE NOT NULL DEFAULT CURRENT_DATE,
      current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,chain_date),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS anime_character_collection (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      anime TEXT NOT NULL,
      rarity TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🎭',
      color INTEGER NOT NULL DEFAULT 10194172,
      description TEXT NOT NULL DEFAULT '',
      traits TEXT NOT NULL DEFAULT '',
      image TEXT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id, character_name),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS character_upgrades (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level >= 0 AND upgrade_level <= 10),
      PRIMARY KEY (guild_id,user_id,character_name),
      FOREIGN KEY (guild_id,user_id,character_name) REFERENCES anime_character_collection(guild_id,user_id,character_name) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_moderation_target ON moderation_cases(guild_id, target_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_anime_collection_user ON anime_character_collection(guild_id, user_id);
    CREATE TABLE IF NOT EXISTS frieren_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE frieren_chat_messages ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT 'legacy';
    CREATE INDEX IF NOT EXISTS idx_frieren_chat_history_channel
      ON frieren_chat_messages(guild_id,user_id,channel_id,id DESC);
    CREATE TABLE IF NOT EXISTS frieren_chat_memories (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      memory_key VARCHAR(60) NOT NULL,
      memory_value VARCHAR(300) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id,user_id,memory_key)
    );
    CREATE INDEX IF NOT EXISTS idx_frieren_chat_memories_scope
      ON frieren_chat_memories(guild_id,user_id,updated_at DESC);
  `);
  if (!testContext.getStore()) {
    await pool.query(`DELETE FROM frieren_chat_messages
      WHERE created_at < NOW() - INTERVAL '90 days'`);
  }
  const connectionCheck = await pool.query('SELECT current_database() AS database_name');
  console.log('PostgreSQL bağlantısı doğrulandı; veritabanı:', connectionCheck.rows[0]?.database_name ?? 'bilinmiyor');
  console.log('PostgreSQL endpoint host (safe):', safeDatabaseHostname(process.env.DATABASE_URL) ?? 'unavailable');
  console.log('PostgreSQL tabloları hazır.');
}

export async function ensureUser(guildId, userId) {
  await pool.query(
    'INSERT INTO users (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING',
    [guildId, userId]
  );
  await pool.query(
    'INSERT INTO user_talents (guild_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [guildId, userId]
  );
  // Zoltraak is the starter spell for every adventurer; existing users receive it too.
  await pool.query(
    "INSERT INTO learned_spells (guild_id, user_id, spell_key) VALUES ($1, $2, 'zoltraak') ON CONFLICT DO NOTHING",
    [guildId, userId]
  );
}
