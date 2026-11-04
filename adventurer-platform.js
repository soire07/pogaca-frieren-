import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool, ensureUser } from './database/db.js';
import { ensurePlayerExperienceSchema } from './player-experience.js';

const DISCORD_ID = /^\d{17,20}$/;
const ACCOUNT_ID = /^site_[0-9a-f-]{36}$/i;
const hash = value => createHash('sha256').update(String(value)).digest('hex');

export async function ensureAdventurerPlatformTables(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS arena_seasons (
      season_id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name VARCHAR(80) NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_at > starts_at)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS arena_one_active_season_per_guild
      ON arena_seasons(guild_id) WHERE status='active';
    CREATE TABLE IF NOT EXISTS arena_ratings (
      season_id BIGINT NOT NULL REFERENCES arena_seasons(season_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating BETWEEN 0 AND 5000),
      wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
      losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
      matches INTEGER NOT NULL DEFAULT 0 CHECK (matches >= 0),
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (season_id,guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS arena_ratings_leaderboard_idx
      ON arena_ratings(season_id,guild_id,rating DESC,wins DESC,user_id);
    CREATE TABLE IF NOT EXISTS arena_match_results (
      match_id TEXT PRIMARY KEY REFERENCES arena_matches(match_id) ON DELETE CASCADE,
      season_id BIGINT NOT NULL REFERENCES arena_seasons(season_id),
      guild_id TEXT NOT NULL,
      winner TEXT NOT NULL CHECK (winner IN ('A','B','draw')),
      participants JSONB NOT NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guild_events (
      event_id UUID PRIMARY KEY,
      guild_id TEXT NOT NULL,
      title VARCHAR(100) NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      event_type VARCHAR(30) NOT NULL DEFAULT 'community',
      channel_id TEXT,
      reminder_claimed_at TIMESTAMPTZ,
      reminder_sent_at TIMESTAMPTZ,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
      max_participants INTEGER CHECK (max_participants IS NULL OR max_participants BETWEEN 1 AND 500),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_at > starts_at)
    );
    ALTER TABLE guild_events ADD COLUMN IF NOT EXISTS channel_id TEXT;
    ALTER TABLE guild_events ADD COLUMN IF NOT EXISTS reminder_claimed_at TIMESTAMPTZ;
    ALTER TABLE guild_events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS guild_events_calendar_idx
      ON guild_events(guild_id,starts_at) WHERE status='scheduled';
    CREATE INDEX IF NOT EXISTS guild_events_due_reminders_idx
      ON guild_events(starts_at,reminder_claimed_at) WHERE status='scheduled' AND reminder_sent_at IS NULL AND channel_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS guild_event_participants (
      event_id UUID NOT NULL REFERENCES guild_events(event_id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE guild_event_participants ADD COLUMN IF NOT EXISTS team_key CHAR(1) CHECK (team_key IS NULL OR team_key IN ('A','B'));
    CREATE INDEX IF NOT EXISTS guild_event_participants_team_idx ON guild_event_participants(event_id,team_key,user_id);
    CREATE TABLE IF NOT EXISTS site_link_tokens (
      token_hash TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS site_link_tokens_expiry_idx ON site_link_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS site_discord_links (
      account_id UUID NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id,guild_id),
      UNIQUE (guild_id,user_id),
      FOREIGN KEY (guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
  `);
  await ensurePlayerExperienceSchema(db);
}

export async function ensureActiveArenaSeason(db = pool, guildId) {
  if (!DISCORD_ID.test(String(guildId || ''))) throw new Error('ARENA_GUILD_ID_INVALID');
  await db.query("UPDATE arena_seasons SET status='completed' WHERE guild_id=$1 AND status='active' AND ends_at<=NOW()", [guildId]);
  const year = new Date().getUTCFullYear();
  await db.query(
    `INSERT INTO arena_seasons(guild_id,name,starts_at,ends_at,status)
     SELECT $1,$2,NOW(),NOW()+INTERVAL '90 days','active'
     WHERE NOT EXISTS (SELECT 1 FROM arena_seasons WHERE guild_id=$1 AND status='active')
     ON CONFLICT DO NOTHING`,
    [guildId, 'Sezon ' + year]
  );
  const result = await db.query("SELECT season_id,name,starts_at,ends_at FROM arena_seasons WHERE guild_id=$1 AND status='active' ORDER BY season_id DESC LIMIT 1", [guildId]);
  if (!result.rowCount) throw new Error('ARENA_ACTIVE_SEASON_UNAVAILABLE');
  return result.rows[0];
}

export function getArenaRankName(rating) {
  const value=Number(rating)||0;
  if(value>=1800)return 'Efsane';
  if(value>=1600)return 'Elmas';
  if(value>=1400)return 'Platin';
  if(value>=1200)return 'Altın';
  if(value>=1000)return 'Gümüş';
  return 'Bronz';
}

export async function getArenaRating(db = pool, guildId, userId) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(userId || ''))) throw new Error('ARENA_RATING_INPUT_INVALID');
  await ensureUser(guildId, userId, db);
  const season = await ensureActiveArenaSeason(db, guildId);
  await db.query('INSERT INTO arena_ratings(season_id,guild_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [season.season_id,guildId,userId]);
  const result = await db.query('SELECT rating,wins,losses,matches,points FROM arena_ratings WHERE season_id=$1 AND guild_id=$2 AND user_id=$3', [season.season_id,guildId,userId]);
  return { season, ...result.rows[0], rank: getArenaRankName(result.rows[0].rating) };
}

export async function settleArenaMatch(client, { guildId, matchId, state }) {
  if (state?.status !== 'finished' || !['A','B','draw'].includes(state.winner)) throw new Error('ARENA_RESULT_INVALID');
  const season = await ensureActiveArenaSeason(client, guildId);
  const participants = state.players.map(player => ({ userId: player.userId, team: player.team, name: player.name }));
  const inserted = await client.query(
    `INSERT INTO arena_match_results(match_id,season_id,guild_id,winner,participants)
     VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(match_id) DO NOTHING RETURNING match_id`,
    [matchId,season.season_id,guildId,state.winner,JSON.stringify(participants)]
  );
  if (!inserted.rowCount) return { settled: false, season };
  for (const player of state.players) {
    await client.query(
      'INSERT INTO arena_ratings(season_id,guild_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [season.season_id,guildId,player.userId]
    );
  }
  const ratingRows = await client.query(
    'SELECT user_id,rating FROM arena_ratings WHERE season_id=$1 AND guild_id=$2 AND user_id=ANY($3::text[]) FOR UPDATE',
    [season.season_id,guildId,participants.map(player => player.userId)]
  );
  const ratings = new Map(ratingRows.rows.map(row => [row.user_id, Number(row.rating)]));
  const average = team => {
    const values = participants.filter(player => player.team === team).map(player => ratings.get(player.userId));
    return values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
  };
  const avgA=average('A'), avgB=average('B');
  const expectedA=1/(1+10**((avgB-avgA)/400));
  const expectedB=1-expectedA;
  for (const player of participants) {
    const won=state.winner===player.team;
    const draw=state.winner==='draw';
    const expected=player.team==='A'?expectedA:expectedB;
    const score=draw?0.5:won?1:0;
    const delta=Math.round(32*(score-expected));
    const rewardCoins=draw?60:won?100:40;
    const rewardXp=draw?30:won?50:20;
    const current=ratings.get(player.userId);
    const nextRating=Math.max(0,Math.min(5000,current+delta));
    await client.query(
      `UPDATE arena_ratings SET rating=$4,wins=wins+$5,losses=losses+$6,matches=matches+1,
       points=points+$7,updated_at=NOW() WHERE season_id=$1 AND guild_id=$2 AND user_id=$3`,
      [season.season_id,guildId,player.userId,nextRating,won?1:0,!won&&!draw?1:0,won?3:draw?1:0]
    );
    await client.query(
      `UPDATE users SET coins=coins+$3,xp=xp+$4,
       level=FLOOR(SQRT((xp+$4)::numeric/100))::int+1,
       stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$4)::numeric/100))::int+1)-level)
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId,player.userId,rewardCoins,rewardXp]
    );
  }
  return { settled: true, season };
}

export async function getArenaLeaderboard(db = pool, guildId, limit = 10) {
  const season = await ensureActiveArenaSeason(db,guildId);
  const result = await db.query(
    `SELECT r.user_id,r.rating,r.wins,r.losses,r.matches,r.points,u.character_name
     FROM arena_ratings r JOIN users u USING(guild_id,user_id)
     WHERE r.season_id=$1 AND r.guild_id=$2
     ORDER BY r.rating DESC,r.wins DESC,r.user_id ASC LIMIT $3`,
    [season.season_id,guildId,Math.max(1,Math.min(25,Number(limit)||10))]
  );
  return { season, players: result.rows.map(player => ({ ...player, rank: getArenaRankName(player.rating) })) };
}

export async function createSiteLinkToken(db = pool, { guildId, userId }) {
  if (!DISCORD_ID.test(String(guildId || '')) || !DISCORD_ID.test(String(userId || ''))) throw new Error('SITE_LINK_INPUT_INVALID');
  await ensureUser(guildId,userId,db);
  const token=randomBytes(24).toString('base64url');
  await db.query('DELETE FROM site_link_tokens WHERE expires_at<=NOW()');
  await db.query('INSERT INTO site_link_tokens(token_hash,guild_id,user_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL \'10 minutes\')',[hash(token),guildId,userId]);
  return { token, expiresInMinutes: 10 };
}

export async function redeemSiteLinkToken(db = pool, accountId, token) {
  const accountUuid=String(accountId||'').replace(/^site_/,'');
  if (!ACCOUNT_ID.test(String(accountId||'')) || !/^[A-Za-z0-9_-]{24,80}$/.test(String(token||''))) throw new Error('SITE_LINK_TOKEN_INVALID');
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const found=await client.query('SELECT guild_id,user_id FROM site_link_tokens WHERE token_hash=$1 AND expires_at>NOW() FOR UPDATE',[hash(token)]);
    if(!found.rowCount) { await client.query('ROLLBACK'); return { status:'invalid_or_expired' }; }
    const {guild_id,user_id}=found.rows[0];
    await client.query('DELETE FROM site_link_tokens WHERE token_hash=$1',[hash(token)]);
    await client.query('DELETE FROM site_discord_links WHERE account_id=$1 AND guild_id=$2 AND user_id<>$3',[accountUuid,guild_id,user_id]);
    await client.query(
      `INSERT INTO site_discord_links(account_id,guild_id,user_id) VALUES($1,$2,$3)
       ON CONFLICT(guild_id,user_id) DO UPDATE SET account_id=EXCLUDED.account_id,linked_at=NOW()`,
      [accountUuid,guild_id,user_id]
    );
    await client.query('COMMIT');
    return { status:'linked', guildId:guild_id, userId:user_id };
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

export async function getAdventurerDashboard(db = pool, accountId) {
  const accountUuid=String(accountId||'').replace(/^site_/,'');
  if(!ACCOUNT_ID.test(String(accountId||''))) throw new Error('SITE_ACCOUNT_INVALID');
  const profiles=await db.query(
    `SELECT l.guild_id,l.user_id,u.character_name,u.class_name,u.level,u.xp,u.coins,u.hp,u.max_hp,u.mana,u.max_mana,
       s.season_id,s.name AS season_name,COALESCE(r.rating,1000) AS rating,
       COALESCE(r.wins,0) AS wins,COALESCE(r.losses,0) AS losses,COALESCE(r.matches,0) AS matches,
       CASE WHEN COALESCE(r.rating,1000)>=1800 THEN 'Efsane' WHEN COALESCE(r.rating,1000)>=1600 THEN 'Elmas' WHEN COALESCE(r.rating,1000)>=1400 THEN 'Platin' WHEN COALESCE(r.rating,1000)>=1200 THEN 'Altın' WHEN COALESCE(r.rating,1000)>=1000 THEN 'Gümüş' ELSE 'Bronz' END AS rank_name
     FROM site_discord_links l JOIN users u USING(guild_id,user_id)
     LEFT JOIN LATERAL (SELECT season_id,name FROM arena_seasons WHERE guild_id=l.guild_id AND status='active' ORDER BY season_id DESC LIMIT 1) s ON TRUE
     LEFT JOIN arena_ratings r ON r.season_id=s.season_id AND r.guild_id=l.guild_id AND r.user_id=l.user_id
     WHERE l.account_id=$1 ORDER BY l.guild_id,l.user_id`,
    [accountUuid]
  );
  const guildIds=profiles.rows.map(row=>row.guild_id);
  const events=guildIds.length?await db.query(
    `SELECT e.event_id,e.guild_id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,e.max_participants,
       COUNT(p.user_id)::int AS participants,
       EXISTS (
         SELECT 1 FROM guild_event_participants mine
         JOIN site_discord_links linked ON linked.guild_id=mine.guild_id AND linked.user_id=mine.user_id
         WHERE mine.event_id=e.event_id AND linked.account_id=$2
       ) AS joined,
       (SELECT mine.team_key FROM guild_event_participants mine JOIN site_discord_links linked ON linked.guild_id=mine.guild_id AND linked.user_id=mine.user_id WHERE mine.event_id=e.event_id AND linked.account_id=$2 LIMIT 1) AS joined_team_key,
       (SELECT mine.team_id FROM guild_event_participants mine JOIN site_discord_links linked ON linked.guild_id=mine.guild_id AND linked.user_id=mine.user_id WHERE mine.event_id=e.event_id AND linked.account_id=$2 LIMIT 1) AS joined_team_id,
       (SELECT t.team_name FROM guild_event_participants mine JOIN site_discord_links linked ON linked.guild_id=mine.guild_id AND linked.user_id=mine.user_id JOIN guild_teams t ON t.guild_id=mine.guild_id AND t.team_id=mine.team_id WHERE mine.event_id=e.event_id AND linked.account_id=$2 LIMIT 1) AS joined_team_name,
       (SELECT COALESCE(json_agg(json_build_object('team_id',t.team_id,'team_name',t.team_name) ORDER BY t.team_name),'[]'::json)
        FROM guild_team_members tm JOIN guild_teams t ON t.guild_id=tm.guild_id AND t.team_id=tm.team_id
        WHERE tm.guild_id=e.guild_id AND tm.user_id IN (SELECT linked_team.user_id FROM site_discord_links linked_team WHERE linked_team.account_id=$2 AND linked_team.guild_id=e.guild_id)) AS available_teams
     FROM guild_events e LEFT JOIN guild_event_participants p ON p.event_id=e.event_id
     WHERE e.guild_id=ANY($1::text[]) AND e.status='scheduled' AND e.ends_at>NOW()
     GROUP BY e.event_id ORDER BY e.starts_at ASC LIMIT 20`,
    [guildIds,accountUuid]
  ): {rows:[]};
  return { profiles:profiles.rows, events:events.rows };
}

export async function getLinkedAdventurer(db = pool, accountId, guildId) {
  const accountUuid=String(accountId||'').replace(/^site_/,'');
  if(!ACCOUNT_ID.test(String(accountId||''))||!DISCORD_ID.test(String(guildId||''))) throw new Error('SITE_ADVENTURER_INPUT_INVALID');
  const result=await db.query(
    `SELECT l.guild_id,l.user_id,u.character_name,u.class_name,u.level,u.xp,u.coins,u.hp,u.max_hp,u.mana,u.max_mana
     FROM site_discord_links l JOIN users u USING(guild_id,user_id)
     WHERE l.account_id=$1 AND l.guild_id=$2 LIMIT 1`,
    [accountUuid,guildId]
  );
  return result.rows[0] || null;
}

export async function getAdventurerInventory(db = pool, accountId, guildId) {
  const profile=await getLinkedAdventurer(db,accountId,guildId);
  if(!profile) return null;
  const result=await db.query(
    `SELECT i.item_key,i.quantity,e.slot
     FROM inventory i
     LEFT JOIN user_equipment e ON e.guild_id=i.guild_id AND e.user_id=i.user_id AND e.item_key=i.item_key
     WHERE i.guild_id=$1 AND i.user_id=$2
     UNION ALL
     SELECT e.item_key,0::int AS quantity,e.slot
     FROM user_equipment e
     WHERE e.guild_id=$1 AND e.user_id=$2
       AND NOT EXISTS (
         SELECT 1 FROM inventory i
         WHERE i.guild_id=e.guild_id AND i.user_id=e.user_id AND i.item_key=e.item_key
       )
     ORDER BY item_key`,
    [profile.guild_id,profile.user_id]
  );
  return { profile, items:result.rows };
}

export async function createGuildEvent(db = pool, { guildId,title,description='',eventType='community',startsAt,endsAt,maxParticipants=null,createdBy,channelId=null }) {
  if(!DISCORD_ID.test(String(guildId||''))||!DISCORD_ID.test(String(createdBy||''))||(channelId!==null&&!DISCORD_ID.test(String(channelId)))) throw new Error('EVENT_INPUT_INVALID');
  const start=new Date(startsAt), end=new Date(endsAt);
  if(!/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(startsAt||''))||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(endsAt||''))) throw new Error('EVENT_INPUT_INVALID');
  const cleanTitle=String(title||'').trim(), cleanDescription=String(description||'').trim();
  if(cleanTitle.length<3||cleanTitle.length>100||cleanDescription.length>1000||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||start<=new Date()) throw new Error('EVENT_INPUT_INVALID');
  const cap=maxParticipants==null?null:Number(maxParticipants);
  if(cap!==null&&(!Number.isInteger(cap)||cap<1||cap>500)) throw new Error('EVENT_CAPACITY_INVALID');
  const allowedEventTypes=new Set(['community','boss_raid','tournament','anime_night']);
  if(!allowedEventTypes.has(String(eventType))) throw new Error('EVENT_TYPE_INVALID');
  const id=randomUUID();
  await db.query('INSERT INTO guild_events(event_id,guild_id,title,description,event_type,starts_at,ends_at,max_participants,created_by,channel_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id,guildId,cleanTitle,cleanDescription,String(eventType).slice(0,30),start.toISOString(),end.toISOString(),cap,createdBy,channelId]);
  return { eventId:id };
}

export async function claimDueGuildEventReminders(db = pool, limit = 20, now = new Date()) {
  const at = new Date(now);
  const batchSize = Math.max(1, Math.min(100, Number(limit) || 20));
  if (!Number.isFinite(at.getTime())) throw new Error('EVENT_REMINDER_TIME_INVALID');
  const result = await db.query(
    `WITH due AS (
       SELECT event_id
       FROM guild_events
       WHERE status='scheduled'
         AND channel_id IS NOT NULL
         AND reminder_sent_at IS NULL
         AND starts_at > $1
         AND starts_at <= $1::timestamptz + INTERVAL '30 minutes'
         AND (reminder_claimed_at IS NULL OR reminder_claimed_at <= $1::timestamptz - INTERVAL '2 minutes')
       ORDER BY starts_at,event_id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE guild_events e
     SET reminder_claimed_at=$1
     FROM due
     WHERE e.event_id=due.event_id
     RETURNING e.event_id,e.guild_id,e.channel_id,e.title,e.description,e.event_type,e.starts_at,e.reminder_claimed_at,
       ARRAY(SELECT p.user_id FROM guild_event_participants p
             WHERE p.event_id=e.event_id ORDER BY p.joined_at,p.user_id LIMIT 100) AS attendee_ids`,
    [at.toISOString(), batchSize]
  );
  return result.rows;
}

export async function markGuildEventReminderSent(db = pool, eventId, claimedAt) {
  const result = await db.query(
    `UPDATE guild_events SET reminder_sent_at=NOW(),reminder_claimed_at=NULL
     WHERE event_id=$1 AND reminder_claimed_at=$2 AND reminder_sent_at IS NULL
     RETURNING event_id`,
    [eventId, claimedAt]
  );
  return result.rowCount === 1;
}

export async function releaseGuildEventReminderClaim(db = pool, eventId, claimedAt) {
  const result = await db.query(
    `UPDATE guild_events SET reminder_claimed_at=NULL
     WHERE event_id=$1 AND reminder_claimed_at=$2 AND reminder_sent_at IS NULL
     RETURNING event_id`,
    [eventId, claimedAt]
  );
  return result.rowCount === 1;
}

export async function listGuildEvents(db = pool,guildId,limit=10) {
  const result=await db.query(
    `SELECT e.event_id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,e.max_participants,
       COUNT(p.user_id)::int AS participants
     FROM guild_events e LEFT JOIN guild_event_participants p ON p.event_id=e.event_id
     WHERE e.guild_id=$1 AND e.status='scheduled' AND e.ends_at>NOW()
     GROUP BY e.event_id ORDER BY e.starts_at ASC LIMIT $2`,
    [guildId,Math.max(1,Math.min(20,Number(limit)||10))]
  );
  return result.rows;
}

export async function joinGuildEvent(db = pool,{guildId,eventId,userId,teamId=null}) {
  if(!DISCORD_ID.test(String(guildId||''))||!DISCORD_ID.test(String(userId||''))) throw new Error('EVENT_INPUT_INVALID');
  await ensureUser(guildId,userId,db);
  const selectedTeamId=teamId===null||teamId===''?null:String(teamId);
  if(selectedTeamId!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedTeamId))throw new Error('EVENT_TEAM_INVALID');
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const event=await client.query("SELECT event_id,event_type,max_participants FROM guild_events WHERE event_id=$1 AND guild_id=$2 AND status='scheduled' AND starts_at>NOW() FOR UPDATE",[eventId,guildId]);
    if(!event.rowCount){await client.query('ROLLBACK');return {status:'unavailable'};}
    if(event.rows[0].event_type==='boss_raid'&&!selectedTeamId){await client.query('ROLLBACK');return {status:'team_required'};}
    if(event.rows[0].event_type!=='boss_raid'&&selectedTeamId){await client.query('ROLLBACK');return {status:'team_not_supported'};}
    const existing=await client.query('SELECT team_key,team_id FROM guild_event_participants WHERE event_id=$1 AND user_id=$2',[eventId,userId]);
    if(existing.rowCount){await client.query('ROLLBACK');return {status:'already_joined',teamKey:existing.rows[0].team_key||null,teamId:existing.rows[0].team_id||null};}
    const count=await client.query('SELECT COUNT(*)::int AS count FROM guild_event_participants WHERE event_id=$1',[eventId]);
    if(event.rows[0].max_participants&&count.rows[0].count>=event.rows[0].max_participants){await client.query('ROLLBACK');return {status:'full'};}
    let selectedTeamName=null;
    if(selectedTeamId){
      const team=await client.query('SELECT t.team_id,t.team_name FROM guild_teams t JOIN guild_team_members m ON m.guild_id=t.guild_id AND m.team_id=t.team_id WHERE t.guild_id=$1 AND t.team_id=$2 AND m.user_id=$3 FOR UPDATE OF t,m',[guildId,selectedTeamId,userId]);
      if(!team.rowCount){await client.query('ROLLBACK');return {status:'not_team_member'};}
      selectedTeamName=team.rows[0].team_name;
      const teamCount=await client.query('SELECT COUNT(*)::int AS count FROM guild_event_participants WHERE event_id=$1 AND team_id=$2',[eventId,selectedTeamId]);
      if(Number(teamCount.rows[0]?.count||0)>=5){await client.query('ROLLBACK');return {status:'team_full'};}
    }
    const inserted=await client.query('INSERT INTO guild_event_participants(event_id,guild_id,user_id,team_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING user_id,team_id',[eventId,guildId,userId,selectedTeamId]);
    if(inserted.rowCount) await client.query("INSERT INTO guild_event_progress(event_id,guild_id,user_id,progress_key,progress) VALUES($1,$2,$3,'participation',1) ON CONFLICT(event_id,user_id,progress_key) DO UPDATE SET progress=GREATEST(guild_event_progress.progress,1),updated_at=NOW()",[eventId,guildId,userId]);
    await client.query('COMMIT');
    return {status:inserted.rowCount?'joined':'already_joined',teamId:inserted.rows[0]?.team_id||null,teamName:selectedTeamName};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}

export async function leaveGuildEvent(db = pool,{guildId,eventId,userId}) {
  const result=await db.query('DELETE FROM guild_event_participants p USING guild_events e WHERE p.event_id=e.event_id AND p.event_id=$1 AND p.guild_id=$2 AND p.user_id=$3 AND e.starts_at>NOW()',[eventId,guildId,userId]);
  return {removed:result.rowCount===1};
}
