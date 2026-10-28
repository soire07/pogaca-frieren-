import pg from 'pg';

const { Pool } = pg;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS frieren_ai_memories (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    memory_key VARCHAR(60) NOT NULL,
    memory_value VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, memory_key)
  )
`;

function normalizeWords(value) {
  return new Set(
    String(value ?? '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFKD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3)
  );
}

export function createMemoryStore(connectionString, { PoolClass = Pool } = {}) {
  if (!connectionString || typeof connectionString !== 'string') {
    throw new TypeError('A PostgreSQL connection string is required.');
  }

  const pool = new PoolClass({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: false },
  });

  let schemaPromise;
  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(CREATE_TABLE_SQL).catch(error => {
        schemaPromise = undefined;
        throw error;
      });
    }
    await schemaPromise;
  }

  return {
    async save(userId, key, value) {
      const normalizedUserId = String(userId ?? '').trim();
      const normalizedKey = String(key ?? '').trim();
      const normalizedValue = String(value ?? '').trim();

      if (!normalizedUserId) throw new TypeError('Memory user ID is required.');
      if (!normalizedKey) throw new TypeError('Memory key must not be empty.');
      if (normalizedKey.length > 60) throw new RangeError('Memory key must be at most 60 characters.');
      if (!normalizedValue) throw new TypeError('Memory value must not be empty.');
      if (normalizedValue.length > 500) throw new RangeError('Memory value must be at most 500 characters.');

      await ensureSchema();
      const result = await pool.query(
        `INSERT INTO frieren_ai_memories (user_id, memory_key, memory_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, memory_key)
         DO UPDATE SET memory_value = EXCLUDED.memory_value, updated_at = NOW()
         RETURNING memory_key, memory_value, updated_at`,
        [normalizedUserId, normalizedKey, normalizedValue]
      );
      return result.rows[0];
    },

    async list(userId) {
      await ensureSchema();
      const result = await pool.query(
        `SELECT memory_key, memory_value, updated_at
         FROM frieren_ai_memories
         WHERE user_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 30`,
        [String(userId)]
      );
      return result.rows;
    },

    async remove(userId, key) {
      await ensureSchema();
      const result = await pool.query(
        'DELETE FROM frieren_ai_memories WHERE user_id = $1 AND memory_key = $2',
        [String(userId), String(key).trim()]
      );
      return result.rowCount > 0;
    },

    async clear(userId) {
      await ensureSchema();
      const result = await pool.query(
        'DELETE FROM frieren_ai_memories WHERE user_id = $1',
        [String(userId)]
      );
      return result.rowCount ?? 0;
    },

    async relevant(userId, question) {
      const memories = await this.list(userId);
      if (!memories.length) return [];
      const questionWords = normalizeWords(question);
      const scored = memories.map(memory => {
        const memoryWords = normalizeWords(memory.memory_key + ' ' + memory.memory_value);
        let score = 0;
        for (const word of questionWords) if (memoryWords.has(word)) score += 1;
        return { memory, score };
      });
      const matched = scored.filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(item => item.memory);
      return matched;
    },

    async close() {
      await pool.end();
    },
  };
}

export const memoryStoreInternals = { CREATE_TABLE_SQL, normalizeWords };
