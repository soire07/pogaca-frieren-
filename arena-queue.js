import { randomUUID } from 'node:crypto';
import { pool, ensureUser } from './database/db.js';
import { ARENA_ELEMENTS, createArenaState, resolveArenaTurn } from './arena-engine.js';
import { settleArenaMatch } from './adventurer-platform.js';

const DISCORD_ID = /^\d{17,20}$/;
const MIN_RATING = 0;
const MAX_RATING = 5000;

export async function ensureArenaTables(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS arena_queue (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating BETWEEN 0 AND 5000),
      mode TEXT NOT NULL DEFAULT '3v3' CHECK (mode IN ('1v1','3v3')),
      element TEXT NOT NULL DEFAULT 'neutral' CHECK (element IN ('fire','ice','lightning','light','dark','neutral')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE arena_queue ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT '3v3';
    ALTER TABLE arena_queue ADD COLUMN IF NOT EXISTS element TEXT NOT NULL DEFAULT 'neutral';
    CREATE INDEX IF NOT EXISTS idx_arena_queue_matchmaking
      ON arena_queue(guild_id,mode,rating DESC,joined_at,user_id);
    CREATE TABLE IF NOT EXISTS arena_matches (
      match_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','finished','cancelled')),
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_arena_matches_guild_active
      ON arena_matches(guild_id,created_at DESC) WHERE status='active';
    CREATE TABLE IF NOT EXISTS arena_match_players (
      match_id TEXT NOT NULL REFERENCES arena_matches(match_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('A','B')),
      slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 2),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id,user_id),
      UNIQUE (match_id,team,slot),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_one_active_match_per_player
      ON arena_match_players(guild_id,user_id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS idx_arena_match_players_user
      ON arena_match_players(guild_id,user_id,status);
  `);
}

function validateInput({ guildId, userId, rating, mode = '3v3', element = 'neutral' }) {
  if (!DISCORD_ID.test(String(guildId || ''))) throw new Error('ARENA_GUILD_ID_INVALID');
  if (!DISCORD_ID.test(String(userId || ''))) throw new Error('ARENA_PLAYER_ID_INVALID');
  const normalizedRating = Number(rating ?? 1000);
  if (!Number.isSafeInteger(normalizedRating) || normalizedRating < MIN_RATING || normalizedRating > MAX_RATING) {
    throw new Error('ARENA_RATING_INVALID');
  }
  if (!['1v1','3v3'].includes(mode)) throw new Error('ARENA_MODE_INVALID');
  if (!ARENA_ELEMENTS.includes(element)) throw new Error('ARENA_ELEMENT_INVALID');
  return { rating:normalizedRating,mode,element };
}

async function createMatchFromQueue(client, guildId, mode) {
  const queued = await client.query(
    `SELECT q.user_id,q.rating,q.element,q.joined_at,
            u.hp,u.max_hp,u.mana,u.max_mana,u.attack,u.defense,u.character_name
     FROM arena_queue q
     JOIN users u ON u.guild_id=q.guild_id AND u.user_id=q.user_id
     WHERE q.guild_id=$1 AND q.mode=$2
     ORDER BY q.rating DESC,q.joined_at ASC,q.user_id ASC
     LIMIT $3
     FOR UPDATE OF q`,
    [guildId,mode,mode==='1v1'?2:6]
  );
  const teamSize=mode==='1v1'?1:3;
  if (queued.rowCount < teamSize*2) return null;

  const ranked = queued.rows.map(row => ({
    userId: row.user_id,
    name: row.character_name || 'Maceracı',
    hp: Number(row.hp),
    maxHp: Number(row.max_hp),
    mana: Number(row.mana),
    maxMana: Number(row.max_mana),
    attack: Number(row.attack),
    defense: Number(row.defense),
    rating: Number(row.rating),
    element: row.element || 'neutral'
  }));
  // 1v1 uses the two highest-priority compatible queue entries; 3v3 keeps the snake draft.
  const teamA = mode==='1v1' ? [ranked[0]] : [ranked[0], ranked[3], ranked[4]];
  const teamB = mode==='1v1' ? [ranked[1]] : [ranked[1], ranked[2], ranked[5]];
  const matchId = randomUUID();
  const state = createArenaState({ matchId, teamA, teamB, mode });
  await client.query(
    'INSERT INTO arena_matches(match_id,guild_id,status,state) VALUES($1,$2,\'active\',$3::jsonb)',
    [matchId, guildId, JSON.stringify(state)]
  );
  const participants = [...teamA.map((player, slot) => ({ ...player, team: 'A', slot })),
    ...teamB.map((player, slot) => ({ ...player, team: 'B', slot }))];
  for (const player of participants) {
    await client.query(
      'INSERT INTO arena_match_players(match_id,guild_id,user_id,team,slot,status) VALUES($1,$2,$3,$4,$5,\'active\')',
      [matchId, guildId, player.userId, player.team, player.slot]
    );
  }
  await client.query(
    'DELETE FROM arena_queue WHERE guild_id=$1 AND user_id=ANY($2::text[])',
    [guildId, participants.map(player => player.userId)]
  );
  return { matchId, state, participants };
}

export async function enqueueArenaPlayer(db = pool, input) {
  const { rating,mode,element } = validateInput(input);
  const guildId = String(input.guildId);
  const userId = String(input.userId);
  await ensureUser(guildId, userId);
  const client = await db.connect();
  let match = null;
  let queueStatus = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['frieren-arena:' + guildId]);
    const active = await client.query(
      `SELECT match_id FROM arena_match_players
       WHERE guild_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [guildId, userId]
    );
    if (active.rowCount) {
      const error = new Error('ARENA_PLAYER_ALREADY_IN_MATCH');
      error.code = 'ARENA_PLAYER_ALREADY_IN_MATCH';
      throw error;
    }
    await client.query(
      `INSERT INTO arena_queue(guild_id,user_id,rating,mode,element) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(guild_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,mode=EXCLUDED.mode,element=EXCLUDED.element,
         joined_at=CASE WHEN arena_queue.mode<>EXCLUDED.mode OR arena_queue.element<>EXCLUDED.element THEN NOW() ELSE arena_queue.joined_at END`,
      [guildId, userId, rating,mode,element]
    );
    match = await createMatchFromQueue(client, guildId,mode);
    if (!match) queueStatus = await getArenaQueueStatus(client, guildId, userId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (match) return { status: 'matched', matchId: match.matchId, state: match.state, participants: match.participants };
  return { status: 'queued', queue: queueStatus };
}

export async function submitArenaTurn(db = pool, { guildId, matchId, actorId, action, targetId }) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(actorId || '')) || !matchId) {
    throw new Error('ARENA_TURN_INPUT_INVALID');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT m.state,m.status
       FROM arena_matches m
       JOIN arena_match_players p ON p.match_id=m.match_id
       WHERE m.match_id=$1 AND m.guild_id=$2 AND p.user_id=$3
         AND p.status='active' AND m.status='active'
       FOR UPDATE OF m`,
      [String(matchId), String(guildId), String(actorId)]
    );
    if (!result.rowCount) {
      const error = new Error('ARENA_MATCH_NOT_FOUND_OR_PLAYER_NOT_ACTIVE');
      error.code = 'ARENA_MATCH_NOT_FOUND_OR_PLAYER_NOT_ACTIVE';
      throw error;
    }
    const state = typeof result.rows[0].state === 'string' ? JSON.parse(result.rows[0].state) : result.rows[0].state;
    const resolved = resolveArenaTurn(state, { actorId, action, targetId });
    await client.query(
      'UPDATE arena_matches SET state=$2::jsonb,status=$3,updated_at=NOW() WHERE match_id=$1',
      [String(matchId), JSON.stringify(resolved.state), resolved.state.status]
    );
    let settlement = null;
    if (resolved.state.status === 'finished') {
      await client.query(
        `UPDATE arena_match_players SET status='finished'
         WHERE match_id=$1 AND status='active'`,
        [String(matchId)]
      );
      settlement = await settleArenaMatch(client, { guildId: String(guildId), matchId: String(matchId), state: resolved.state });
    }
    await client.query('COMMIT');
    return { state: resolved.state, event: resolved.event, settlement };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveArenaQueue(db = pool, { guildId, userId }) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(userId || ''))) {
    throw new Error('ARENA_PLAYER_ID_INVALID');
  }
  const result = await db.query('DELETE FROM arena_queue WHERE guild_id=$1 AND user_id=$2 RETURNING user_id', [guildId, userId]);
  return { removed: result.rowCount === 1 };
}

export async function getArenaQueueStatus(db = pool, guildId, userId) {
  const active = await db.query(
    `SELECT m.match_id,m.state,m.created_at
     FROM arena_match_players p JOIN arena_matches m USING(match_id)
     WHERE p.guild_id=$1 AND p.user_id=$2 AND p.status='active' AND m.status='active'
     LIMIT 1`,
    [guildId, userId]
  );
  if (active.rowCount) return { status: 'in_match', matchId: active.rows[0].match_id, state: active.rows[0].state };
  const queued = await db.query(
    `SELECT q.rating,q.joined_at,q.mode,q.element,
            (SELECT COUNT(*)::int FROM arena_queue allq WHERE allq.guild_id=q.guild_id AND allq.mode=q.mode) AS queue_size,
            (SELECT COUNT(*)::int FROM arena_queue ahead
             WHERE ahead.guild_id=q.guild_id AND ahead.mode=q.mode
               AND (ahead.rating > q.rating OR (ahead.rating=q.rating AND (ahead.joined_at,ahead.user_id)<(q.joined_at,q.user_id)))) AS players_ahead
     FROM arena_queue q WHERE q.guild_id=$1 AND q.user_id=$2`,
    [guildId, userId]
  );
  return queued.rowCount
    ? { status: 'queued', rating: queued.rows[0].rating, joinedAt: queued.rows[0].joined_at,
        mode:queued.rows[0].mode,element:queued.rows[0].element,
        requiredPlayers:queued.rows[0].mode==='1v1'?2:6,
        queueSize: queued.rows[0].queue_size, playersAhead: queued.rows[0].players_ahead }
    : { status: 'not_queued' };
}
