import pg from 'pg';

const { Pool } = pg;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS frieren_ai_conversation (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content VARCHAR(1500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS frieren_ai_conversation_user_recent_idx ON frieren_ai_conversation (user_id, id DESC);
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

const STOP_WORDS = new Set([
  'acaba', 'ama', 'ancak', 'artik', 'bana', 'bazi', 'ben', 'beni', 'benim',
  'bir', 'biraz', 'biri', 'biz', 'bizim', 'bu', 'buna', 'bunu', 'bunun',
  'cok', 'da', 'daha', 'de', 'degil', 'diye', 'en', 'gibi', 'icin', 'ile',
  'mi', 'mu', 'mı', 'mü', 'ne', 'neden', 'nerede', 'nasil', 'niye', 'o',
  'olan', 'olarak', 'onlar', 'onu', 'onun', 'oyle', 'sen', 'seni', 'senin',
  'siz', 'size', 'su', 'tum', 've', 'veya', 'ya', 'yani', 'the', 'and',
  'for', 'with', 'what', 'about', 'tell', 'me', 'my'
]);

function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWords(value) {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
  );
}

function isMemoryRecallQuestion(value) {
  const normalized = normalizeText(value);
  return /\b(hatirla|hatirliyorsun|hatirladin|hatirladiklarin|aklinda ne var|benim hakkimda ne|bellegimde ne var|bellegimde neler var|bellek kayitlarim|hafizamda ne var|gecmiste ne demistim|ne demistim|neleri biliyorsun|neler biliyorsun|what do you remember|what have i told you)\b/.test(normalized)
    || /\btum (?:kayitli olan )?anilar\w*\b/.test(normalized)
    || /\btum (?:kayitli )?bellek kayitlar\w*\b/.test(normalized)
    || /\bkayitli olan tum anilar\w*\b/.test(normalized);
}


function isSpecificPersonalFactRecallQuestion(value) {
  const normalized = normalizeText(value);
  return /\b(en sevdigim|favorim|favori)\b.{0,80}\b(neydi|ne|hangisi|hangisiydi)\b/.test(normalized)
    || /\b(hangi|ne)\b.{0,40}\b(seviyordum|seviyorum|tercih ediyordum)\b/.test(normalized);
}

// Do not let old turns resurrect facts after the user deletes their saved memory.
export function shouldUseConversationHistory(question, relevantMemories) {
  if (isMemoryRecallQuestion(question)) return false;
  if (isSpecificPersonalFactRecallQuestion(question) && (!Array.isArray(relevantMemories) || relevantMemories.length === 0)) return false;
  return true;
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

    async addConversationTurn(userId, role, content) {
      const normalizedUserId = String(userId ?? '').trim();
      const normalizedRole = String(role ?? '').trim();
      const normalizedContent = String(content ?? '').trim();
      if (!normalizedUserId) throw new TypeError('Conversation user ID is required.');
      if (!['user', 'assistant'].includes(normalizedRole)) throw new TypeError('Conversation role must be user or assistant.');
      if (!normalizedContent) throw new TypeError('Conversation content must not be empty.');
      await ensureSchema();
      await pool.query(
        'INSERT INTO frieren_ai_conversation (user_id, role, content) VALUES ($1, $2, $3)',
        [normalizedUserId, normalizedRole, normalizedContent.slice(0, 1500)]
      );
      await pool.query(
        'DELETE FROM frieren_ai_conversation WHERE user_id = $1 AND id NOT IN (SELECT id FROM frieren_ai_conversation WHERE user_id = $1 ORDER BY id DESC LIMIT 12)',
        [normalizedUserId]
      );
    },

    async getConversationHistory(userId, limit = 8) {
      await ensureSchema();
      const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 12));
      const result = await pool.query(
        'SELECT role, content FROM frieren_ai_conversation WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
        [String(userId), safeLimit]
      );
      return result.rows.reverse();
    },

    async relevant(userId, question) {
      const memories = await this.list(userId);
      if (!memories.length) return [];
      const questionWords = normalizeWords(question);
      const recallIntent = isMemoryRecallQuestion(question);
      const normalizedQuestion = normalizeText(question);
      const personalFactRecall = isSpecificPersonalFactRecallQuestion(question);
      const scored = memories.filter(memory => personalFactRecall || !String(memory.memory_key || '').startsWith('favori_')).map((memory, index) => {
        const keyWords = normalizeWords(memory.memory_key);
        const valueWords = normalizeWords(memory.memory_value);
        let score = 0;
        for (const word of questionWords) {
          if (keyWords.has(word)) score += 3;
          else if (valueWords.has(word)) score += 1;
        }
        const normalizedKey = normalizeText(memory.memory_key);
        const normalizedValue = normalizeText(memory.memory_value);
        if (normalizedKey.length >= 4 && normalizedQuestion.includes(normalizedKey)) score += 4;
        if (normalizedValue.length >= 8 && normalizedQuestion.includes(normalizedValue)) score += 5;
        return { memory, score, index };
      });
      const matched = scored.filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 8)
        .map(item => item.memory);
      // Explicit recall questions ask for an overview, not just the one record that
      // happens to share a keyword with the question. Return recent records, always scoped by user ID.
      if (recallIntent) return memories.slice(0, 8);
      return matched;
    },

    async close() {
      await pool.end();
    },
  };
}

export const memoryStoreInternals = { CREATE_TABLE_SQL, normalizeWords };
