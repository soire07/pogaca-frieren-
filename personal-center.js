import { randomUUID } from 'node:crypto';

const ID=/^\d{17,20}$/;
const THEMES=new Set(['midnight','violet','starlight','forest']);
const KINDS=new Set(['task','note','event']);
const REPORT_REASONS=new Set(['harassment','spam','cheating','inappropriate','other']);
const validId=(v)=>ID.test(String(v||''));
function player(g,u){if(!validId(g)||!validId(u))throw new Error('PERSONAL_CENTER_ID_INVALID');}
function pair(g,a,b){player(g,a);player(g,b);if(a===b)throw new Error('PERSONAL_CENTER_SELF_ACTION');}
function cleanText(value,max,code,{optional=false}={}){const s=String(value??'').trim();if((!optional&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw new Error(code);return s;}
async function tx(db,fn){if(typeof db.connect!=='function')return fn(db);const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}

export async function ensurePersonalCenterSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS player_personal_profiles(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,bio VARCHAR(280) NOT NULL DEFAULT '',status_text VARCHAR(80) NOT NULL DEFAULT '',theme TEXT NOT NULL DEFAULT 'midnight' CHECK(theme IN ('midnight','violet','starlight','forest')),
 guestbook_enabled BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id),
 FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query(`CREATE TABLE IF NOT EXISTS player_direct_messages(
 message_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,body VARCHAR(2000) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,CHECK(sender_id<>recipient_id),
 FOREIGN KEY(guild_id,sender_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(guild_id,recipient_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS player_dm_thread_idx ON player_direct_messages(guild_id,sender_id,recipient_id,created_at DESC)');
 await db.query('CREATE INDEX IF NOT EXISTS player_dm_inbox_idx ON player_direct_messages(guild_id,recipient_id,read_at,created_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS player_guestbook_entries(
 entry_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,author_id TEXT NOT NULL,message VARCHAR(500) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(owner_id<>author_id),
 FOREIGN KEY(guild_id,owner_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(guild_id,author_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS player_guestbook_owner_idx ON player_guestbook_entries(guild_id,owner_id,created_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS player_reports(
 report_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,reporter_id TEXT NOT NULL,target_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(reason IN ('harassment','spam','cheating','inappropriate','other')),
 details VARCHAR(1000) NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','resolved','dismissed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(reporter_id<>target_id),
 FOREIGN KEY(guild_id,reporter_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(guild_id,target_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query(`CREATE TABLE IF NOT EXISTS player_planner_entries(
 entry_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('task','note','event')),
 title VARCHAR(100) NOT NULL,body VARCHAR(2000) NOT NULL DEFAULT '',due_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS player_planner_due_idx ON player_planner_entries(guild_id,user_id,due_at) WHERE due_at IS NOT NULL');
 await db.query('CREATE TABLE IF NOT EXISTS player_close_friends(guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,friend_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,owner_id,friend_id),CHECK(owner_id<>friend_id),FOREIGN KEY(guild_id,owner_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE,FOREIGN KEY(guild_id,friend_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)');
 await db.query('CREATE INDEX IF NOT EXISTS player_close_friends_owner_idx ON player_close_friends(guild_id,owner_id,created_at DESC)');
}

export async function updatePersonalProfile(db,{guildId,userId,bio='',statusText='',theme='midnight',guestbookEnabled=true}){
 player(guildId,userId);const b=cleanText(bio,280,'PERSONAL_PROFILE_INVALID',{optional:true});const s=cleanText(statusText,80,'PERSONAL_PROFILE_INVALID',{optional:true});
 if(!THEMES.has(theme)||typeof guestbookEnabled!=='boolean')throw new Error('PERSONAL_PROFILE_INVALID');
 await ensurePersonalCenterSchema(db);
 const r=await db.query(`INSERT INTO player_personal_profiles(guild_id,user_id,bio,status_text,theme,guestbook_enabled)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,user_id) DO UPDATE SET bio=EXCLUDED.bio,status_text=EXCLUDED.status_text,theme=EXCLUDED.theme,guestbook_enabled=EXCLUDED.guestbook_enabled,updated_at=NOW()
 RETURNING bio,status_text,theme,guestbook_enabled`,[guildId,userId,b,s,theme,guestbookEnabled]);return r.rows[0];
}
export async function getPersonalProfile(db,guildId,userId){player(guildId,userId);await ensurePersonalCenterSchema(db);const r=await db.query('SELECT bio,status_text,theme,guestbook_enabled,updated_at FROM player_personal_profiles WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);return r.rows[0]||{bio:'',status_text:'',theme:'midnight',guestbook_enabled:true};}

async function blocked(c,g,a,b){const r=await c.query('SELECT 1 FROM social_blocks WHERE guild_id=$1 AND ((blocker_id=$2 AND blocked_id=$3) OR (blocker_id=$3 AND blocked_id=$2)) LIMIT 1',[g,a,b]);return r.rowCount>0;}
export async function sendDirectMessage(db,{guildId,senderId,recipientId,body}){
 pair(guildId,senderId,recipientId);const message=cleanText(body,2000,'PERSONAL_MESSAGE_INVALID');await ensurePersonalCenterSchema(db);
 return tx(db,async c=>{
  const players=await c.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',[guildId,[senderId,recipientId].sort()]);
  if(players.rowCount!==2)return{status:'player_missing'};
  if(await blocked(c,guildId,senderId,recipientId))return{status:'blocked'};
  const rate=await c.query("SELECT COUNT(*)::int AS count FROM player_direct_messages WHERE guild_id=$1 AND sender_id=$2 AND created_at>NOW()-INTERVAL '10 minutes'",[guildId,senderId]);
  if(Number(rate.rows[0]?.count||0)>=20)return{status:'rate_limited'};
  const id=randomUUID();await c.query('INSERT INTO player_direct_messages(message_id,guild_id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4,$5)',[id,guildId,senderId,recipientId,message]);
  return{status:'sent',messageId:id};
 });
}
export async function listDirectMessages(db,{guildId,userId,otherUserId,limit=50}){
 pair(guildId,userId,otherUserId);const n=Math.max(1,Math.min(100,Math.floor(Number(limit)||50)));await ensurePersonalCenterSchema(db);
 const r=await db.query('SELECT message_id,sender_id,recipient_id,body,created_at,read_at FROM player_direct_messages WHERE guild_id=$1 AND ((sender_id=$2 AND recipient_id=$3) OR (sender_id=$3 AND recipient_id=$2)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=$1 AND ((b.blocker_id=$2 AND b.blocked_id=$3) OR (b.blocker_id=$3 AND b.blocked_id=$2))) ORDER BY created_at DESC,message_id DESC LIMIT $4',[guildId,userId,otherUserId,n]);return r.rows.reverse();
}
export async function markDirectMessagesRead(db,{guildId,userId,otherUserId}){
 pair(guildId,userId,otherUserId);await ensurePersonalCenterSchema(db);const r=await db.query('UPDATE player_direct_messages SET read_at=NOW() WHERE guild_id=$1 AND sender_id=$3 AND recipient_id=$2 AND read_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=$1 AND ((b.blocker_id=$2 AND b.blocked_id=$3) OR (b.blocker_id=$3 AND b.blocked_id=$2)))',[guildId,userId,otherUserId]);return{updated:r.rowCount};
}
export async function listMessageThreads(db,{guildId,userId,limit=30}){
 player(guildId,userId);const n=Math.max(1,Math.min(50,Math.floor(Number(limit)||30)));await ensurePersonalCenterSchema(db);
 const r=await db.query(`SELECT DISTINCT ON (other_id) other_id,body,created_at,unread FROM(
 SELECT CASE WHEN sender_id=$2 THEN recipient_id ELSE sender_id END AS other_id,body,created_at,
 (recipient_id=$2 AND read_at IS NULL) AS unread FROM player_direct_messages
 WHERE guild_id=$1 AND (sender_id=$2 OR recipient_id=$2)
 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=$1 AND ((b.blocker_id=$2 AND b.blocked_id=CASE WHEN sender_id=$2 THEN recipient_id ELSE sender_id END) OR (b.blocked_id=$2 AND b.blocker_id=CASE WHEN sender_id=$2 THEN recipient_id ELSE sender_id END)))
 ) t ORDER BY other_id,created_at DESC LIMIT $3`,[guildId,userId,n]);return r.rows;
}

export async function addGuestbookEntry(db,{guildId,ownerId,authorId,message}){
 pair(guildId,ownerId,authorId);const body=cleanText(message,500,'GUESTBOOK_MESSAGE_INVALID');await ensurePersonalCenterSchema(db);
 return tx(db,async c=>{const p=await c.query('SELECT guestbook_enabled FROM player_personal_profiles WHERE guild_id=$1 AND user_id=$2',[guildId,ownerId]);if(p.rows[0]?.guestbook_enabled===false)return{status:'disabled'};
 if(await blocked(c,guildId,ownerId,authorId))return{status:'blocked'};
 const recent=await c.query("SELECT COUNT(*)::int AS count FROM player_guestbook_entries WHERE guild_id=$1 AND author_id=$2 AND created_at>NOW()-INTERVAL '1 hour'",[guildId,authorId]);if(Number(recent.rows[0]?.count||0)>=5)return{status:'rate_limited'};
 const id=randomUUID();await c.query('INSERT INTO player_guestbook_entries(entry_id,guild_id,owner_id,author_id,message) VALUES($1,$2,$3,$4,$5)',[id,guildId,ownerId,authorId,body]);return{status:'created',entryId:id};});
}
export async function listGuestbookEntries(db,{guildId,ownerId,limit=30}){
 player(guildId,ownerId);const n=Math.max(1,Math.min(100,Math.floor(Number(limit)||30)));await ensurePersonalCenterSchema(db);
 const r=await db.query('SELECT e.entry_id,e.author_id,e.message,e.created_at FROM player_guestbook_entries e WHERE e.guild_id=$1 AND e.owner_id=$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=e.guild_id AND ((b.blocker_id=$2 AND b.blocked_id=e.author_id) OR (b.blocker_id=e.author_id AND b.blocked_id=$2))) ORDER BY e.created_at DESC LIMIT $3',[guildId,ownerId,n]);return r.rows;
}
export async function deleteGuestbookEntry(db,{guildId,ownerId,entryId}){
 player(guildId,ownerId);await ensurePersonalCenterSchema(db);if(!/^[0-9a-f-]{36}$/i.test(String(entryId||'')))throw new Error('GUESTBOOK_ENTRY_INVALID');
 const r=await db.query('DELETE FROM player_guestbook_entries WHERE guild_id=$1 AND owner_id=$2 AND entry_id=$3 RETURNING entry_id',[guildId,ownerId,entryId]);return{status:r.rowCount?'deleted':'not_found'};
}
export async function reportPlayer(db,{guildId,reporterId,targetId,reason,details=''}){
 pair(guildId,reporterId,targetId);if(!REPORT_REASONS.has(reason))throw new Error('PLAYER_REPORT_INVALID');const note=cleanText(details,1000,'PLAYER_REPORT_INVALID',{optional:true});await ensurePersonalCenterSchema(db);
 return tx(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[guildId+':report:'+reporterId]);
  const players=await c.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[reporterId,targetId]]);
  if(players.rowCount!==2)return{status:'player_missing'};
  const recent=await c.query("SELECT COUNT(*)::int AS count FROM player_reports WHERE guild_id=$1 AND reporter_id=$2 AND created_at>NOW()-INTERVAL '24 hours'",[guildId,reporterId]);if(Number(recent.rows[0]?.count||0)>=5)return{status:'rate_limited'};
  const id=randomUUID();await c.query('INSERT INTO player_reports(report_id,guild_id,reporter_id,target_id,reason,details) VALUES($1,$2,$3,$4,$5,$6)',[id,guildId,reporterId,targetId,reason,note]);return{status:'submitted',reportId:id};
 });
}
export async function createPlannerEntry(db,{guildId,userId,kind,title,body='',dueAt=null}){
 player(guildId,userId);if(!KINDS.has(kind))throw new Error('PLANNER_ENTRY_INVALID');const t=cleanText(title,100,'PLANNER_ENTRY_INVALID');const b=cleanText(body,2000,'PLANNER_ENTRY_INVALID',{optional:true});
 let due=null;if(dueAt!==null&&dueAt!==''){const d=new Date(dueAt);if(!Number.isFinite(d.getTime())||d.getTime()<Date.now()-86400000||d.getTime()>Date.now()+366*86400000)throw new Error('PLANNER_ENTRY_INVALID');due=d.toISOString();}
 await ensurePersonalCenterSchema(db);const id=randomUUID();await db.query('INSERT INTO player_planner_entries(entry_id,guild_id,user_id,kind,title,body,due_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,guildId,userId,kind,t,b,due]);return{status:'created',entryId:id};
}
export async function listPlannerEntries(db,{guildId,userId,kind=null,limit=100}){
 player(guildId,userId);if(kind!==null&&!KINDS.has(kind))throw new Error('PLANNER_ENTRY_INVALID');const n=Math.max(1,Math.min(200,Math.floor(Number(limit)||100)));await ensurePersonalCenterSchema(db);
 const r=await db.query('SELECT entry_id,kind,title,body,due_at,completed_at,created_at,updated_at FROM player_planner_entries WHERE guild_id=$1 AND user_id=$2 AND ($3::text IS NULL OR kind=$3) ORDER BY completed_at NULLS FIRST,due_at NULLS LAST,created_at DESC LIMIT $4',[guildId,userId,kind,n]);return r.rows;
}
export async function updatePlannerEntry(db,{guildId,userId,entryId,title,body,dueAt,completed}){
 player(guildId,userId);await ensurePersonalCenterSchema(db);if(!/^[0-9a-f-]{36}$/i.test(String(entryId||''))||typeof completed!=='boolean')throw new Error('PLANNER_ENTRY_INVALID');
 const t=cleanText(title,100,'PLANNER_ENTRY_INVALID');const b=cleanText(body,2000,'PLANNER_ENTRY_INVALID',{optional:true});let due=null;if(dueAt){const d=new Date(dueAt);if(!Number.isFinite(d.getTime()))throw new Error('PLANNER_ENTRY_INVALID');due=d.toISOString();}
 const r=await db.query('UPDATE player_planner_entries SET title=$4,body=$5,due_at=$6,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND entry_id=$3 RETURNING entry_id,completed_at',[guildId,userId,entryId,t,b,due,completed]);return{status:r.rowCount?'updated':'not_found',entry:r.rows[0]||null};
}
export async function deletePlannerEntry(db,{guildId,userId,entryId}){
 player(guildId,userId);await ensurePersonalCenterSchema(db);if(!/^[0-9a-f-]{36}$/i.test(String(entryId||'')))throw new Error('PLANNER_ENTRY_INVALID');
 const r=await db.query('DELETE FROM player_planner_entries WHERE guild_id=$1 AND user_id=$2 AND entry_id=$3 RETURNING entry_id',[guildId,userId,entryId]);return{status:r.rowCount?'deleted':'not_found'};
}
export async function getPersonalProgressReport(db,{guildId,userId,period='week'}){
 player(guildId,userId);await ensurePersonalCenterSchema(db);if(!['week','month'].includes(period))throw new Error('PERSONAL_REPORT_PERIOD_INVALID');
 const interval=period==='week'?'7 days':'30 days';const r=await db.query(`SELECT COUNT(*)::int AS adventures,COALESCE(SUM(xp_awarded),0)::int AS xp,
 COUNT(*) FILTER(WHERE outcome_text ILIKE '%boss%')::int AS boss_events,
 (SELECT COUNT(*)::int FROM achievement_claims a WHERE a.guild_id=$1 AND a.user_id=$2 AND a.claimed_at>=NOW()-INTERVAL '${interval}') AS achievements,
 (SELECT COUNT(*)::int FROM player_planner_entries p WHERE p.guild_id=$1 AND p.user_id=$2 AND p.completed_at>=NOW()-INTERVAL '${interval}') AS completed_tasks
 FROM adventure_history WHERE guild_id=$1 AND user_id=$2 AND occurred_at>=NOW()-INTERVAL '${interval}'`,[guildId,userId]);return{period,...(r.rows[0]||{adventures:0,xp:0,boss_events:0,achievements:0,completed_tasks:0})};
}
export async function discoverPlayers(db,{guildId,userId,limit=20}){
 player(guildId,userId);const n=Math.max(1,Math.min(50,Math.floor(Number(limit)||20)));
 const r=await db.query(`SELECT u.user_id,u.character_name,u.xp,
 COALESCE((SELECT points FROM social_reputation p WHERE p.guild_id=u.guild_id AND p.user_id=u.user_id),0)::int AS reputation
 FROM users u WHERE u.guild_id=$1 AND u.user_id<>$2
 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=$1 AND ((b.blocker_id=$2 AND b.blocked_id=u.user_id) OR (b.blocker_id=u.user_id AND b.blocked_id=$2)))
 AND NOT EXISTS(SELECT 1 FROM social_relationships r WHERE r.guild_id=$1 AND r.user_low_id=LEAST($2,u.user_id) AND r.user_high_id=GREATEST($2,u.user_id))
 ORDER BY u.xp DESC,u.user_id LIMIT $3`,[guildId,userId,n]);return r.rows;
}
export async function recommendPlayers(db,{guildId,userId,limit=10}){
 player(guildId,userId);const n=Math.max(1,Math.min(25,Math.floor(Number(limit)||10)));
 const r=await db.query(`SELECT candidate.user_id,candidate.character_name,COUNT(*)::int AS mutual_friends
 FROM social_relationships mine JOIN social_relationships common ON common.guild_id=mine.guild_id
 AND common.relationship_type='friend' AND (common.user_low_id=CASE WHEN mine.user_low_id=$2 THEN mine.user_high_id ELSE mine.user_low_id END OR common.user_high_id=CASE WHEN mine.user_low_id=$2 THEN mine.user_high_id ELSE mine.user_low_id END)
 JOIN users candidate ON candidate.guild_id=common.guild_id AND candidate.user_id=CASE WHEN common.user_low_id=CASE WHEN mine.user_low_id=$2 THEN mine.user_high_id ELSE mine.user_low_id END THEN common.user_high_id ELSE common.user_low_id END
 WHERE mine.guild_id=$1 AND mine.relationship_type='friend' AND (mine.user_low_id=$2 OR mine.user_high_id=$2)
 AND candidate.user_id<>$2
 AND NOT EXISTS(SELECT 1 FROM social_relationships x WHERE x.guild_id=$1 AND x.user_low_id=LEAST($2,candidate.user_id) AND x.user_high_id=GREATEST($2,candidate.user_id))
 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=$1 AND ((b.blocker_id=$2 AND b.blocked_id=candidate.user_id) OR (b.blocker_id=candidate.user_id AND b.blocked_id=$2)))
 GROUP BY candidate.user_id,candidate.character_name ORDER BY mutual_friends DESC,candidate.user_id LIMIT $3`,[guildId,userId,n]);return r.rows;
}

export async function setCloseFriend(db,{guildId,ownerId,friendId}){
 pair(guildId,ownerId,friendId);await ensurePersonalCenterSchema(db);
 return tx(db,async c=>{
  const friendship=await c.query('SELECT 1 FROM social_relationships WHERE guild_id=$1 AND user_low_id=LEAST($2,$3) AND user_high_id=GREATEST($2,$3) AND relationship_type=\'friend\'',[guildId,ownerId,friendId]);
  if(!friendship.rowCount)return{status:'not_friends'};
  if(await blocked(c,guildId,ownerId,friendId))return{status:'blocked'};
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[guildId+':close-friends:'+ownerId]);
  const count=await c.query('SELECT COUNT(*)::int AS count FROM player_close_friends WHERE guild_id=$1 AND owner_id=$2',[guildId,ownerId]);
  if(Number(count.rows?.[0]?.count||0)>=10)return{status:'limit_reached'};
  const result=await c.query('INSERT INTO player_close_friends(guild_id,owner_id,friend_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING friend_id',[guildId,ownerId,friendId]);
  return{status:result.rowCount?'added':'already_added'};
 });
}
export async function removeCloseFriend(db,{guildId,ownerId,friendId}){
 pair(guildId,ownerId,friendId);await ensurePersonalCenterSchema(db);
 const result=await db.query('DELETE FROM player_close_friends WHERE guild_id=$1 AND owner_id=$2 AND friend_id=$3 RETURNING friend_id',[guildId,ownerId,friendId]);
 return{status:result.rowCount?'removed':'not_found'};
}
export async function listCloseFriends(db,{guildId,ownerId,limit=10}){
 player(guildId,ownerId);const n=Math.max(1,Math.min(10,Math.floor(Number(limit)||10)));await ensurePersonalCenterSchema(db);
 const result=await db.query('SELECT f.friend_id AS user_id,u.character_name,u.xp,f.created_at FROM player_close_friends f JOIN users u ON u.guild_id=f.guild_id AND u.user_id=f.friend_id WHERE f.guild_id=$1 AND f.owner_id=$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE b.guild_id=f.guild_id AND ((b.blocker_id=$2 AND b.blocked_id=f.friend_id) OR (b.blocker_id=f.friend_id AND b.blocked_id=$2))) ORDER BY f.created_at DESC LIMIT $3',[guildId,ownerId,n]);
 return result.rows;
}
