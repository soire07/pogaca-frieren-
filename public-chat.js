import { randomUUID } from 'node:crypto';
import { ensureProfileMediaSchema } from './profile-media.js';
import { ensureSiteAccountSchema } from './site-auth.js';
import { createAccountNotification, ensureAccountProfileSchema } from './account-profile.js';

const publicChatSchemaReady=new WeakMap();
const ACCOUNT_ID=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max,code,{optional=false}={})=>{const text=String(value??'').normalize('NFC').trim();if(!text&&optional)return '';if(!text||Array.from(text).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new Error(code);return text;};
function assertAccount(accountId){if(!ACCOUNT_ID.test(String(accountId||'')))throw new Error('PUBLIC_CHAT_ACCOUNT_INVALID');}
async function transaction(db,fn){if(typeof db.connect!=='function')return fn(db);const client=await db.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}

async function createPublicChatSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_public_chat_messages(
  message_id UUID PRIMARY KEY,account_id TEXT NOT NULL,username VARCHAR(24) NOT NULL,body VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),hidden BOOLEAN NOT NULL DEFAULT FALSE,reply_to_message_id UUID
 )`);
 await db.query('ALTER TABLE frieren_public_chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID');
 await db.query('ALTER TABLE frieren_public_chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ');
 await db.query('ALTER TABLE frieren_public_chat_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ');
 await db.query('ALTER TABLE frieren_public_chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_public_chat_control(control_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(control_id=1),is_paused BOOLEAN NOT NULL DEFAULT FALSE,updated_by TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query(`INSERT INTO frieren_public_chat_control(control_id,is_paused) VALUES(1,FALSE) ON CONFLICT(control_id) DO NOTHING`);
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_public_chat_reads(message_id UUID NOT NULL REFERENCES frieren_public_chat_messages(message_id) ON DELETE CASCADE,reader_account_id TEXT NOT NULL,read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,reader_account_id))`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_reads_reader_idx ON frieren_public_chat_reads(reader_account_id,read_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_public_chat_reports(report_id UUID PRIMARY KEY,message_id UUID NOT NULL REFERENCES frieren_public_chat_messages(message_id) ON DELETE CASCADE,reporter_account_id TEXT NOT NULL,reason VARCHAR(32) NOT NULL CHECK(reason IN ('spam','harassment','inappropriate','other')),details VARCHAR(500) NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(message_id,reporter_account_id))`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_reports_status_idx ON frieren_public_chat_reports(status,created_at DESC)');
 await db.query('CREATE TABLE IF NOT EXISTS frieren_public_chat_presence(account_id TEXT PRIMARY KEY,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),typing_until TIMESTAMPTZ)');
 await db.query('ALTER TABLE frieren_public_chat_presence ADD COLUMN IF NOT EXISTS typing_until TIMESTAMPTZ');
 await db.query('CREATE TABLE IF NOT EXISTS frieren_public_chat_reactions(message_id UUID NOT NULL REFERENCES frieren_public_chat_messages(message_id) ON DELETE CASCADE,account_id TEXT NOT NULL,emoji VARCHAR(16) NOT NULL CHECK(emoji IN (\'❤️\',\'✨\',\'😂\')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,account_id,emoji))');
 await db.query(`DO $$ BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('frieren_public_chat_schema'));
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='frieren_public_chat_reactions'::regclass AND conname='frieren_public_chat_reactions_emoji_check' AND pg_get_constraintdef(oid) LIKE '%😍%') THEN
   ALTER TABLE frieren_public_chat_reactions DROP CONSTRAINT IF EXISTS frieren_public_chat_reactions_emoji_check;
   ALTER TABLE frieren_public_chat_reactions ADD CONSTRAINT frieren_public_chat_reactions_emoji_check CHECK (emoji IN ('❤️','✨','😂','😍','🥰','😭','👀','🎉','🙌','💜','🍪','🌸'));
  END IF;
 END; $$`);
 await db.query('CREATE TABLE IF NOT EXISTS frieren_public_chat_blocks(blocker_account_id TEXT NOT NULL,blocked_account_id TEXT NOT NULL,blocked_username VARCHAR(24) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(blocker_account_id,blocked_account_id),CHECK(blocker_account_id<>blocked_account_id))');
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_recent_idx ON frieren_public_chat_messages(created_at DESC) WHERE hidden=FALSE');
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_account_idx ON frieren_public_chat_messages(account_id,created_at DESC)');
}
export async function ensurePublicChatSchema(db){
 if(!db||typeof db.query!=='function')throw new Error('PUBLIC_CHAT_DATABASE_INVALID');
 let pending=publicChatSchemaReady.get(db);
 if(!pending){pending=createPublicChatSchema(db);publicChatSchemaReady.set(db,pending);}
 try{await pending;}catch(error){publicChatSchemaReady.delete(db);throw error;}
}

export async function listPublicChatMessages(db,{limit=100,viewerAccountId=null,before=null,search='',ownerAccountIds=[]}={}){
 const count=Math.max(1,Math.min(100,Math.floor(Number(limit)||100))),cursor=before&&Number.isFinite(Date.parse(before))?new Date(before).toISOString():null,term=clean(search,80,'PUBLIC_CHAT_SEARCH_INVALID',{optional:true});
 const viewer=viewerAccountId&&ACCOUNT_ID.test(String(viewerAccountId))?String(viewerAccountId):null;
 const owners=Array.isArray(ownerAccountIds)?[...new Set(ownerAccountIds.map(value=>String(value||'')).filter(value=>ACCOUNT_ID.test(value)))]:[];
 await ensurePublicChatSchema(db);
 await ensureSiteAccountSchema(db);
 await ensureAccountProfileSchema(db);
 await ensureProfileMediaSchema(db);
 const result=await db.query(`SELECT m.message_id,m.account_id,COALESCE(NULLIF(ap.display_name,''),m.username) AS username,ap.profile_slug,m.body,m.created_at,m.edited_at,m.pinned_at,m.deleted_at,m.reply_to_message_id,m.account_id=$2 AS is_own,
  (m.account_id=ANY($5::text[]) OR EXISTS(SELECT 1 FROM site_discord_links sdl WHERE sdl.account_id=REPLACE(m.account_id,'site_','')::uuid AND sdl.user_id='1553794496234262641')) AS is_owner,
  CASE WHEN EXISTS(SELECT 1 FROM frieren_profile_media pm WHERE pm.account_id=REPLACE(m.account_id,'site_','')::uuid AND pm.media_kind='avatar') THEN '/profil/media/public?accountId='||m.account_id ELSE NULL END AS avatar_url,
  (SELECT COUNT(*)::int FROM frieren_public_chat_reads rd WHERE rd.message_id=m.message_id AND rd.reader_account_id<>m.account_id) AS read_count,
  EXISTS(SELECT 1 FROM frieren_public_chat_presence pr WHERE pr.account_id=m.account_id AND pr.last_seen_at>NOW()-INTERVAL '90 seconds') AS is_online,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.count,'reacted',r.reacted)) FROM (
   SELECT emoji,COUNT(*)::int AS count,BOOL_OR(account_id=$2) AS reacted FROM frieren_public_chat_reactions WHERE message_id=m.message_id GROUP BY emoji
  ) r),'[]'::jsonb) AS reactions,
  (SELECT jsonb_build_object('username',p.username,'body',CASE WHEN p.deleted_at IS NOT NULL THEN 'Bu mesaj silindi' ELSE LEFT(p.body,120) END) FROM frieren_public_chat_messages p WHERE p.message_id=m.reply_to_message_id) AS reply
  FROM frieren_public_chat_messages m LEFT JOIN frieren_account_profiles ap ON ap.account_id=m.account_id
  WHERE m.hidden=FALSE AND m.created_at>=NOW()-INTERVAL '30 days'
   AND ($2::text IS NULL OR NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE b.blocker_account_id=$2 AND b.blocked_account_id=m.account_id))
   AND ($3::timestamptz IS NULL OR (m.created_at<$3 AND m.pinned_at IS NULL))
   AND ($4::text='' OR m.username ILIKE '%'||$4||'%' OR ap.display_name ILIKE '%'||$4||'%' OR m.body ILIKE '%'||$4||'%')
  ORDER BY (m.pinned_at IS NOT NULL) DESC,m.created_at DESC,m.message_id DESC LIMIT $1`,[count,viewer,cursor,term,owners]);
 return result.rows.reverse().sort((a,b)=>Number(Boolean(b.pinned_at))-Number(Boolean(a.pinned_at)));
}

export async function sendPublicChatMessage(db,{accountId,username,body,replyToMessageId=null}){
 assertAccount(accountId);
 const author=clean(username,24,'PUBLIC_CHAT_USERNAME_INVALID');
 const message=clean(body,500,'PUBLIC_CHAT_MESSAGE_INVALID');
 if(replyToMessageId&&!/^[0-9a-f-]{36}$/i.test(String(replyToMessageId)))throw new Error('PUBLIC_CHAT_REPLY_INVALID');
 await ensurePublicChatSchema(db);
 await ensureAccountProfileSchema(db);
 return transaction(db,async client=>{
  const control=await client.query('SELECT is_paused FROM frieren_public_chat_control WHERE control_id=1');if(control.rows[0]?.is_paused)return{status:'chat_paused'};
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId]);
  const recent=await client.query("SELECT COUNT(*)::int AS count FROM frieren_public_chat_messages WHERE account_id=$1 AND created_at>NOW()-INTERVAL '60 seconds'",[accountId]);
  if(Number(recent.rows?.[0]?.count||0)>=5)return{status:'rate_limited'};
  let parentAuthor=null;if(replyToMessageId){const parent=await client.query('SELECT message_id,account_id FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE AND deleted_at IS NULL',[replyToMessageId]);if(!parent.rowCount)return{status:'reply_not_found'};parentAuthor=parent.rows[0].account_id;}
  const id=randomUUID();
  const result=await client.query('INSERT INTO frieren_public_chat_messages(message_id,account_id,username,body,reply_to_message_id) VALUES($1,$2,$3,$4,$5) RETURNING message_id,username,body,created_at,reply_to_message_id',[id,accountId,author,message,replyToMessageId]);
  if(parentAuthor&&parentAuthor!==accountId)await createAccountNotification(client,{accountId:parentAuthor,type:'chat_reply',title:'Sohbet mesajına yanıt',body:author+' mesajına yanıt verdi.',href:'/kesfet#topluluk-sohbeti',schemaReady:true});
  return{status:'sent',message:result.rows[0]};
 });
}

export async function togglePublicChatReaction(db,{accountId,messageId,emoji}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||''))||!['❤️','✨','😂','😍','🥰','😭','👀','🎉','🙌','💜','🍪','🌸'].includes(String(emoji||'')))throw new Error('PUBLIC_CHAT_REACTION_INVALID');
 await ensurePublicChatSchema(db);
 await ensureAccountProfileSchema(db);
 return transaction(db,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId+':'+messageId]);
  const message=await client.query('SELECT message_id,account_id,username FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE AND deleted_at IS NULL',[messageId]);
  if(!message.rowCount)return{status:'not_found'};
  const existing=await client.query('SELECT 1 FROM frieren_public_chat_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3',[messageId,accountId,emoji]);
  if(existing.rowCount){await client.query('DELETE FROM frieren_public_chat_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3',[messageId,accountId,emoji]);return{status:'removed'};}
  await client.query('INSERT INTO frieren_public_chat_reactions(message_id,account_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[messageId,accountId,emoji]);
  if(message.rows[0].account_id!==accountId)await createAccountNotification(client,{accountId:message.rows[0].account_id,type:'chat_reaction',title:'Mesajına tepki geldi',body:emoji+' tepkisi bırakıldı.',href:'/kesfet#topluluk-sohbeti',schemaReady:true});
  return{status:'added'};
 });
}

export async function blockPublicChatUser(db,{accountId,messageId}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_BLOCK_INVALID');
 await ensurePublicChatSchema(db);
 return transaction(db,async client=>{
  const target=await client.query('SELECT account_id,username FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE AND deleted_at IS NULL',[messageId]);
  if(!target.rowCount)return{status:'not_found'};
  if(target.rows[0].account_id===accountId)return{status:'self_block'};
  const result=await client.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING blocked_account_id',[accountId,target.rows[0].account_id,target.rows[0].username]);
  return{status:result.rowCount?'blocked':'already_blocked'};
 });
}

export async function unblockPublicChatUser(db,{accountId,targetAccountId}){
 assertAccount(accountId);assertAccount(targetAccountId);
 if(accountId===targetAccountId)throw new Error('PUBLIC_CHAT_BLOCK_INVALID');
 await ensurePublicChatSchema(db);
 const result=await db.query('DELETE FROM frieren_public_chat_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2 RETURNING blocked_account_id',[accountId,targetAccountId]);
 return{status:result.rowCount?'unblocked':'not_found'};
}

export async function listPublicChatBlocks(db,{accountId}){
 assertAccount(accountId);await ensurePublicChatSchema(db);
 const result=await db.query('SELECT blocked_account_id,blocked_username,created_at FROM frieren_public_chat_blocks WHERE blocker_account_id=$1 ORDER BY created_at DESC LIMIT 50',[accountId]);
 return result.rows;
}

export async function deletePublicChatMessage(db,{accountId,messageId,isOwner=false}){
 assertAccount(accountId);if(isOwner!==true)throw new Error('PUBLIC_CHAT_OWNER_REQUIRED');
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');
 await ensurePublicChatSchema(db);
 const result=await db.query('DELETE FROM frieren_public_chat_messages WHERE message_id=$1 RETURNING message_id',[messageId]);
 return{status:result.rowCount?'deleted':'not_found'};
}


export async function deleteOwnPublicChatMessage(db,{accountId,messageId}){
 assertAccount(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');await ensurePublicChatSchema(db);
 const r=await db.query("UPDATE frieren_public_chat_messages SET body='Bu mesaj silindi',deleted_at=NOW(),edited_at=NULL WHERE message_id=$1 AND account_id=$2 AND hidden=FALSE AND deleted_at IS NULL AND created_at>NOW()-INTERVAL '15 minutes' RETURNING message_id",[messageId,accountId]);
 return{status:r.rowCount?'deleted':'not_found'};
}

export async function updatePublicChatMessage(db,{accountId,messageId,body}){
 assertAccount(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');
 const message=clean(body,500,'PUBLIC_CHAT_MESSAGE_INVALID');await ensurePublicChatSchema(db);
 const r=await db.query("UPDATE frieren_public_chat_messages SET body=$3,edited_at=NOW() WHERE message_id=$1 AND account_id=$2 AND hidden=FALSE AND deleted_at IS NULL AND created_at>NOW()-INTERVAL '15 minutes' RETURNING message_id",[messageId,accountId,message]);
 return{status:r.rowCount?'updated':'not_found'};
}
export async function togglePublicChatPin(db,{accountId,messageId,isOwner=false}){
 assertAccount(accountId);if(isOwner!==true)throw new Error('PUBLIC_CHAT_OWNER_REQUIRED');if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');await ensurePublicChatSchema(db);
 const r=await db.query("UPDATE frieren_public_chat_messages SET pinned_at=CASE WHEN pinned_at IS NULL THEN NOW() ELSE NULL END WHERE message_id=$1 AND hidden=FALSE AND deleted_at IS NULL RETURNING pinned_at",[messageId]);
 return{status:r.rowCount?(r.rows[0].pinned_at?'pinned':'unpinned'):'not_found'};
}
export async function touchPublicChatPresence(db,{accountId}){
 assertAccount(accountId);await ensurePublicChatSchema(db);
 await db.query('INSERT INTO frieren_public_chat_presence(account_id,last_seen_at) VALUES($1,NOW()) ON CONFLICT(account_id) DO UPDATE SET last_seen_at=NOW()',[accountId]);
 return{status:'online'};
}
export async function getPublicChatPresence(db){
 await ensurePublicChatSchema(db);
 const [online,typing]=await Promise.all([db.query("SELECT COUNT(*)::int AS online FROM frieren_public_chat_presence WHERE last_seen_at>NOW()-INTERVAL '90 seconds'"),db.query("SELECT DISTINCT ON(m.account_id) COALESCE(NULLIF(ap.display_name,''),m.username) AS username FROM frieren_public_chat_presence p JOIN frieren_public_chat_messages m ON m.account_id=p.account_id LEFT JOIN frieren_account_profiles ap ON ap.account_id=m.account_id WHERE p.typing_until>NOW() ORDER BY m.account_id,m.created_at DESC LIMIT 3")]);
 return{online:Number(online.rows[0]?.online||0),typing:typing.rows.map(x=>x.username)};
}

export async function setPublicChatTyping(db,{accountId}){
 assertAccount(accountId);await ensurePublicChatSchema(db);
 await db.query("INSERT INTO frieren_public_chat_presence(account_id,last_seen_at,typing_until) VALUES($1,NOW(),NOW()+INTERVAL '12 seconds') ON CONFLICT(account_id) DO UPDATE SET last_seen_at=NOW(),typing_until=NOW()+INTERVAL '12 seconds'",[accountId]);
 return{status:'typing'};
}

export async function markPublicChatMessagesRead(db,{accountId,messageIds=[]}){
 assertAccount(accountId);
 if(!Array.isArray(messageIds)||messageIds.length>100||messageIds.some(id=>!/^[0-9a-f-]{36}$/i.test(String(id))))throw new Error('PUBLIC_CHAT_READ_INVALID');
 if(!messageIds.length)return{status:'read',count:0};
 await ensurePublicChatSchema(db);
 const r=await db.query(`INSERT INTO frieren_public_chat_reads(message_id,reader_account_id)
  SELECT m.message_id,$1 FROM frieren_public_chat_messages m
  WHERE m.message_id=ANY($2::uuid[]) AND m.hidden=FALSE AND m.account_id<>$1
    AND m.created_at>=NOW()-INTERVAL '30 days'
  ON CONFLICT(message_id,reader_account_id) DO NOTHING RETURNING message_id`,[accountId,messageIds]);
 return{status:'read',count:r.rowCount||0};
}

export async function reportPublicChatMessage(db,{accountId,messageId,reason='other',details=''}){
 assertAccount(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(messageId||''))||!['spam','harassment','inappropriate','other'].includes(reason))throw new Error('PUBLIC_CHAT_REPORT_INVALID');
 const note=clean(details,500,'PUBLIC_CHAT_REPORT_INVALID',{optional:true});await ensurePublicChatSchema(db);
 const target=await db.query('SELECT account_id FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE AND deleted_at IS NULL',[messageId]);
 if(!target.rowCount)return{status:'not_found'};if(target.rows[0].account_id===accountId)return{status:'self_report'};
 const result=await db.query("INSERT INTO frieren_public_chat_reports(report_id,message_id,reporter_account_id,reason,details) VALUES($1,$2,$3,$4,$5) ON CONFLICT(message_id,reporter_account_id) DO NOTHING RETURNING report_id",[randomUUID(),messageId,accountId,reason,note]);
 return{status:result.rowCount?'reported':'already_reported'};
}

export async function listPublicChatReports(db,{status='pending',limit=30}={}){
 if(!['pending','reviewed','dismissed','all'].includes(status))throw new Error('PUBLIC_CHAT_REPORT_FILTER_INVALID');
 const count=Math.max(1,Math.min(100,Math.floor(Number(limit)||30)));
 await ensurePublicChatSchema(db);await ensureAccountProfileSchema(db);
 const result=await db.query(`SELECT r.report_id,r.message_id,r.reporter_account_id,
  COALESCE(NULLIF(ap.display_name,''),r.reporter_account_id) AS reporter_name,
  r.reason,r.details,r.status,r.created_at,m.account_id AS author_account_id,
  COALESCE(NULLIF(mp.display_name,''),m.username) AS author_name,m.body AS message_body
  FROM frieren_public_chat_reports r
  JOIN frieren_public_chat_messages m ON m.message_id=r.message_id
  LEFT JOIN frieren_account_profiles ap ON ap.account_id=r.reporter_account_id
  LEFT JOIN frieren_account_profiles mp ON mp.account_id=m.account_id
  WHERE ($1='all' OR r.status=$1)
  ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC
  LIMIT $2`,[status,count]);
 return result.rows;
}
export async function resolvePublicChatReport(db,{accountId,reportId,status,isOwner=false}){
 assertAccount(accountId);if(isOwner!==true)throw new Error('PUBLIC_CHAT_OWNER_REQUIRED');
 if(!/^[0-9a-f-]{36}$/i.test(String(reportId||''))||!['reviewed','dismissed'].includes(status))throw new Error('PUBLIC_CHAT_REPORT_INVALID');
 await ensurePublicChatSchema(db);
 const result=await db.query('UPDATE frieren_public_chat_reports SET status=$2 WHERE report_id=$1 AND status=\'pending\' RETURNING report_id,status',[reportId,status]);
 return{status:result.rowCount?status:'not_found'};
}
export async function getPublicChatControl(db){
 await ensurePublicChatSchema(db);const r=await db.query('SELECT is_paused,updated_at FROM frieren_public_chat_control WHERE control_id=1');
 return{paused:Boolean(r.rows[0]?.is_paused),updatedAt:r.rows[0]?.updated_at||null};
}
export async function setPublicChatPaused(db,{accountId,paused,isOwner=false}){
 assertAccount(accountId);if(isOwner!==true)throw new Error('PUBLIC_CHAT_OWNER_REQUIRED');if(typeof paused!=='boolean')throw new Error('PUBLIC_CHAT_CONTROL_INVALID');
 await ensurePublicChatSchema(db);const r=await db.query('UPDATE frieren_public_chat_control SET is_paused=$1,updated_by=$2,updated_at=NOW() WHERE control_id=1 RETURNING is_paused,updated_at',[paused,accountId]);
 return{status:r.rowCount?'updated':'not_found',paused:Boolean(r.rows[0]?.is_paused),updatedAt:r.rows[0]?.updated_at||null};
}
