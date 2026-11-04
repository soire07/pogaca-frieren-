import { randomUUID } from 'node:crypto';

const DISCORD_ID = /^\d{17,20}$/;
const SESSION_ID = /^[0-9a-f-]{36}$/i;
export const GUILD_GAME_DURATION_MS = 60_000;
export const GUILD_GAME_POINTS = 10;

export const GUILD_GAME_TYPES = Object.freeze([
  {
    key: 'bilgi', label: 'Frieren Bilgi Yarışı', description: 'Frieren evreni hakkında dört seçenekli bilgi soruları.',
    questions: [
      { prompt: 'Frieren hangi ırka mensuptur?', options: ['Elf', 'İnsan', 'Cüce', 'Demon'], answer: 'Elf', explanation: 'Frieren uzun ömürlü bir elf büyücüsüdür.' },
      { prompt: 'Frieren’ın yol arkadaşı olan genç büyücü kimdir?', options: ['Übel', 'Fern', 'Serie', 'Flamme'], answer: 'Fern', explanation: 'Fern, Frieren’ın öğrencisi ve yol arkadaşıdır.' },
      { prompt: 'Kahraman grubunun lideri kimdi?', options: ['Eisen', 'Heiter', 'Stark', 'Himmel'], answer: 'Himmel', explanation: 'Himmel, iblis kralını yenen kahraman grubunun lideriydi.' }
    ]
  },
  {
    key: 'kelime', label: 'Büyülü Kelime', description: 'Karışık harflerden doğru büyü veya terimi seç.',
    questions: [
      { prompt: 'Karışık harfler: **A A M N** — doğru kelime hangisi?', options: ['Mana', 'Mena', 'Nema', 'Mina'], answer: 'Mana', explanation: 'Mana, büyü gücünün temel kaynağıdır.' },
      { prompt: 'Karışık harfler: **İ K S İ R** — doğru kelime hangisi?', options: ['Kiriş', 'İksir', 'Sikir', 'İris'], answer: 'İksir', explanation: 'İksirler maceracının yolculuğunda kullanılan karışımlardır.' },
      { prompt: 'Karışık harfler: **B Ü Y Ü** — doğru kelime hangisi?', options: ['Büyü', 'Böyü', 'Buyu', 'Büyücü'], answer: 'Büyü', explanation: 'Büyü, Frieren dünyasının temel disiplinidir.' }
    ]
  },
  {
    key: 'hafiza', label: 'Hafıza Mührü', description: 'Gösterilen dizideki doğru devamı bul.',
    questions: [
      { prompt: 'Mühür dizisi: **Ay → Yıldız → Güneş → ?**', options: ['Ay', 'Bulut', 'Yıldız', 'Deniz'], answer: 'Ay', explanation: 'Dizi başa dönen dört aşamalı bir döngüdür.' },
      { prompt: 'Büyü sırası: **Ateş → Su → Rüzgâr → ?**', options: ['Toprak', 'Işık', 'Mana', 'Buz'], answer: 'Toprak', explanation: 'Dört temel unsur sıralamasında sıradaki Toprak.' },
      { prompt: 'Hafıza mührü: **1 → 2 → 4 → 8 → ?**', options: ['10', '12', '16', '18'], answer: '16', explanation: 'Her adımda sayı ikiyle çarpılır.' }
    ]
  },
  {
    key: 'tahmin', label: 'Bilmece Sandığı', description: 'İpuçlarından doğru cevabı tahmin et.',
    questions: [
      { prompt: 'Yüzyılları aşarım, büyüleri toplarım ve zaman benim için farklı akar. Ben kimim?', options: ['Frieren', 'Stark', 'Himmel', 'Heiter'], answer: 'Frieren', explanation: 'Uzun ömürlü elf büyücü Frieren.' },
      { prompt: 'Kılıç taşırım, korkularımla yüzleşirim ve Eisen’in öğrencisiyim. Ben kimim?', options: ['Fern', 'Stark', 'Übel', 'Denken'], answer: 'Stark', explanation: 'Stark, Eisen tarafından eğitilmiş savaşçıdır.' },
      { prompt: 'Biriktirilen büyüleri ve eski bilgileri saklarım; sayfalarımda sırlar bulunur. Ben neyim?', options: ['Kalkan', 'Grimoire', 'Zırh', 'Pusula'], answer: 'Grimoire', explanation: 'Grimoire büyü ve büyülü bilgileri içeren kitaptır.' }
    ]
  }
]);

export function normalizeGuildGameAnswer(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\\s+/g, ' ');
}

export function createGuildGameQuestion(gameType, random = Math.random) {
  const game = GUILD_GAME_TYPES.find(item => item.key === String(gameType || ''));
  if (!game) throw new Error('GUILD_GAME_TYPE_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('GUILD_GAME_RANDOM_INVALID');
  const source = game.questions[Math.floor(value * game.questions.length)];
  const answerIndex = source.options.findIndex(option => normalizeGuildGameAnswer(option) === normalizeGuildGameAnswer(source.answer));
  if (answerIndex < 0 || source.options.length !== 4) throw new Error('GUILD_GAME_CATALOG_INVALID');
  return Object.freeze({
    gameType: game.key,
    gameLabel: game.label,
    prompt: source.prompt,
    options: [...source.options],
    answer: source.answer,
    answerIndex,
    explanation: source.explanation
  });
}

function validateIds(guildId, userId) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(userId || ''))) {
    throw new Error('GUILD_GAME_PLAYER_INVALID');
  }
}

export async function ensureGuildGameTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_game_sessions (
      session_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      game_type VARCHAR(16) NOT NULL CHECK (game_type IN ('bilgi','kelime','hafiza','tahmin')),
      game_label VARCHAR(80) NOT NULL,
      team_mode BOOLEAN NOT NULL DEFAULT FALSE,
      prompt TEXT NOT NULL,
      options JSONB NOT NULL,
      answer_index SMALLINT NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
      explanation VARCHAR(300) NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE guild_game_sessions ADD COLUMN IF NOT EXISTS team_mode BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS guild_game_sessions_guild_idx
      ON guild_game_sessions(guild_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS guild_game_sessions_expiry_idx
      ON guild_game_sessions(expires_at) WHERE status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS guild_game_one_active_session_per_channel
      ON guild_game_sessions(guild_id,channel_id) WHERE status='active';
    CREATE TABLE IF NOT EXISTS guild_game_answers (
      session_id UUID NOT NULL REFERENCES guild_game_sessions(session_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      answer_index SMALLINT NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
      correct BOOLEAN NOT NULL,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS guild_game_participants (
      session_id UUID NOT NULL REFERENCES guild_game_sessions(session_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      team CHAR(1) NOT NULL CHECK (team IN ('A','B')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS guild_game_participants_team_idx
      ON guild_game_participants(session_id,team,user_id);
    CREATE TABLE IF NOT EXISTS guild_game_team_scores (
      session_id UUID NOT NULL REFERENCES guild_game_sessions(session_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      team CHAR(1) NOT NULL CHECK (team IN ('A','B')),
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id,team)
    );
    CREATE TABLE IF NOT EXISTS guild_game_scores (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
      played_games INTEGER NOT NULL DEFAULT 0 CHECK (played_games >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS guild_game_scores_leaderboard_idx
      ON guild_game_scores(guild_id,points DESC,correct_answers DESC,user_id);
  `);
}

export async function startGuildMiniGame(db, { guildId, channelId, userId, gameType, teamMode = false, random = Math.random, now = new Date() }) {
  validateIds(guildId, userId);
  if (!/^\d{17,20}$/.test(String(channelId || ''))) throw new Error('GUILD_GAME_CHANNEL_INVALID');
  const question = createGuildGameQuestion(gameType, random);
  const sessionId = randomUUID();
  const expiresAt = new Date(new Date(now).getTime() + GUILD_GAME_DURATION_MS);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['frieren-guild-game:' + guildId + ':' + channelId]);
    await client.query("UPDATE guild_game_sessions SET status='expired' WHERE guild_id=$1 AND channel_id=$2 AND status='active' AND expires_at <= $3", [String(guildId),String(channelId),new Date(now).toISOString()]);
    await client.query("DELETE FROM guild_game_sessions WHERE created_at < NOW() - INTERVAL '30 days'");
    const active = await client.query("SELECT session_id,expires_at FROM guild_game_sessions WHERE guild_id=$1 AND channel_id=$2 AND status='active' LIMIT 1", [String(guildId),String(channelId)]);
    if (active.rowCount) {
      await client.query('COMMIT');
      return { status:'channel_active', sessionId:active.rows[0].session_id, expiresAt:active.rows[0].expires_at };
    }
    const result = await client.query(
      `INSERT INTO guild_game_sessions
        (session_id,guild_id,channel_id,created_by,game_type,game_label,team_mode,prompt,options,answer_index,explanation,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
       RETURNING session_id,guild_id,channel_id,game_type,game_label,team_mode,prompt,options,expires_at`,
      [sessionId,String(guildId),String(channelId),String(userId),question.gameType,question.gameLabel,Boolean(teamMode),question.prompt,
        JSON.stringify(question.options),question.answerIndex,question.explanation,expiresAt.toISOString()]
    );
    const row = result.rows?.[0];
    if (!row) throw new Error('GUILD_GAME_SESSION_NOT_CREATED');
    await client.query('COMMIT');
    return { ...row, options: Array.isArray(row.options) ? row.options : question.options, answerIndex: question.answerIndex };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function answerGuildMiniGame(db, { guildId, channelId, sessionId, userId, answerIndex, now = new Date() }) {
  validateIds(guildId, userId);
  if (!/^\d{17,20}$/.test(String(channelId || ''))) throw new Error('GUILD_GAME_CHANNEL_INVALID');
  if (!SESSION_ID.test(String(sessionId || ''))) throw new Error('GUILD_GAME_SESSION_INVALID');
  const index = Number(answerIndex);
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('GUILD_GAME_ANSWER_INVALID');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const sessionResult = await client.query(
      'SELECT session_id,guild_id,channel_id,answer_index,explanation,status,expires_at,team_mode FROM guild_game_sessions WHERE session_id=$1 AND guild_id=$2 AND channel_id=$3 FOR UPDATE',
      [String(sessionId),String(guildId),String(channelId)]
    );
    const session = sessionResult.rows?.[0];
    if (!session) {
      await client.query('COMMIT');
      return { status: 'not_found' };
    }
    if (session.status !== 'active' || new Date(session.expires_at).getTime() <= new Date(now).getTime()) {
      await client.query("UPDATE guild_game_sessions SET status='expired' WHERE session_id=$1 AND status='active'", [String(sessionId)]);
      await client.query('COMMIT');
      return { status: 'expired' };
    }
    let team = null;
    if (session.team_mode) {
      const participant = await client.query(
        'SELECT team FROM guild_game_participants WHERE session_id=$1 AND guild_id=$2 AND user_id=$3',
        [String(sessionId),String(guildId),String(userId)]
      );
      if (!participant.rowCount) {
        await client.query('COMMIT');
        return { status:'join_team_first' };
      }
      team = participant.rows[0].team;
    }
    const correct = index === Number(session.answer_index);
    const inserted = await client.query(
      'INSERT INTO guild_game_answers(session_id,guild_id,user_id,answer_index,correct) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,user_id) DO NOTHING RETURNING correct',
      [String(sessionId),String(guildId),String(userId),index,correct]
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { status: 'already_answered' };
    }
    let score = null;
    if (correct) {
      const updated = await client.query(
        `INSERT INTO guild_game_scores(guild_id,user_id,points,correct_answers,played_games)
         VALUES($1,$2,$3,1,1)
         ON CONFLICT(guild_id,user_id) DO UPDATE SET
           points=guild_game_scores.points+EXCLUDED.points,
           correct_answers=guild_game_scores.correct_answers+1,
           played_games=guild_game_scores.played_games+1,
           updated_at=NOW()
         RETURNING points,correct_answers,played_games`,
        [String(guildId),String(userId),GUILD_GAME_POINTS]
      );
      score = updated.rows?.[0] || null;
    } else {
      await client.query(
        `INSERT INTO guild_game_scores(guild_id,user_id,points,correct_answers,played_games)
         VALUES($1,$2,0,0,1)
         ON CONFLICT(guild_id,user_id) DO UPDATE SET
           played_games=guild_game_scores.played_games+1,updated_at=NOW()`,
        [String(guildId),String(userId)]
      );
    }
    let teamScore = null;
    if (correct && team) {
      const teamResult = await client.query(
        `INSERT INTO guild_game_team_scores(session_id,guild_id,team,points,correct_answers)
         VALUES($1,$2,$3,$4,1)
         ON CONFLICT(session_id,team) DO UPDATE SET
           points=guild_game_team_scores.points+EXCLUDED.points,
           correct_answers=guild_game_team_scores.correct_answers+1,
           updated_at=NOW()
         RETURNING points,correct_answers`,
        [String(sessionId),String(guildId),team,GUILD_GAME_POINTS]
      );
      teamScore = teamResult.rows?.[0] ? { points:Number(teamResult.rows[0].points),correctAnswers:Number(teamResult.rows[0].correct_answers) } : null;
    }
    await client.query('COMMIT');
    return { status: correct ? 'correct' : 'incorrect', pointsAwarded: correct ? GUILD_GAME_POINTS : 0,
      explanation: session.explanation, team, teamScore,
      score: score ? { points:Number(score.points),correctAnswers:Number(score.correct_answers),playedGames:Number(score.played_games) } : null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function joinGuildMiniGameTeam(db, { guildId, channelId, sessionId, userId, team, now = new Date() }) {
  validateIds(guildId,userId);
  if (!/^\\d{17,20}$/.test(String(channelId || ''))) throw new Error('GUILD_GAME_CHANNEL_INVALID');
  if (!SESSION_ID.test(String(sessionId || '')) || !['A','B'].includes(team)) throw new Error('GUILD_GAME_TEAM_INPUT_INVALID');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT session_id,team_mode,status,expires_at FROM guild_game_sessions WHERE session_id=$1 AND guild_id=$2 AND channel_id=$3 FOR UPDATE',
      [String(sessionId),String(guildId),String(channelId)]
    );
    const session = result.rows?.[0];
    if (!session) { await client.query('COMMIT'); return {status:'not_found'}; }
    if (session.status!=='active' || new Date(session.expires_at).getTime()<=new Date(now).getTime()) {
      await client.query("UPDATE guild_game_sessions SET status='expired' WHERE session_id=$1 AND status='active'",[String(sessionId)]);
      await client.query('COMMIT'); return {status:'expired'};
    }
    if (!session.team_mode) { await client.query('COMMIT'); return {status:'not_team_mode'}; }
    const existing = await client.query('SELECT team FROM guild_game_participants WHERE session_id=$1 AND user_id=$2',[String(sessionId),String(userId)]);
    if (existing.rowCount) {
      await client.query('COMMIT');
      return {status:existing.rows[0].team===team?'already_joined':'team_locked',team:existing.rows[0].team};
    }
    const count = await client.query('SELECT COUNT(*)::int AS count FROM guild_game_participants WHERE session_id=$1 AND team=$2',[String(sessionId),team]);
    if (Number(count.rows[0]?.count||0)>=5) { await client.query('COMMIT'); return {status:'team_full'}; }
    await client.query('INSERT INTO guild_game_participants(session_id,guild_id,user_id,team) VALUES($1,$2,$3,$4)',[String(sessionId),String(guildId),String(userId),team]);
    await client.query('COMMIT');
    return {status:'joined',team};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

export async function getGuildGameLeaderboard(db, guildId, limit = 10) {
  if (!/^\d{17,20}$/.test(String(guildId || ''))) throw new Error('GUILD_GAME_GUILD_INVALID');
  const size = Math.max(1, Math.min(25, Math.trunc(Number(limit) || 10)));
  const result = await db.query(
    `SELECT user_id,points,correct_answers,played_games
     FROM guild_game_scores WHERE guild_id=$1
     ORDER BY points DESC,correct_answers DESC,played_games ASC,user_id ASC LIMIT $2`,
    [String(guildId),size]
  );
  return result.rows || [];
}
