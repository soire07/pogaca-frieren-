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
      last_xp_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
      last_daily_at TIMESTAMPTZ,
      last_adventure_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_adventure_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      PRIMARY KEY (guild_id, user_id, item_key),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
}
