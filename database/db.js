import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.warn('UYARI: DATABASE_URL ayarlı değil. Bot veritabanı olmadan başlatılamaz.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
      class_name TEXT NOT NULL DEFAULT 'Gezgin',
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boss_at TIMESTAMPTZ;
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
    CREATE TABLE IF NOT EXISTS adventure_discoveries (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id,discovery_key),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS adventure_streaks (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
      last_visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
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
  `);
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
