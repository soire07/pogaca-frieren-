import { randomUUID } from 'node:crypto';
import { ensureProfileMediaSchema } from './profile-media.js';

const publicChatSchemaReady=new WeakMap();
const ACCOUNT_ID=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max,code)=>{const text=String(value??'').normalize('NFC').trim();if(!text||Array.from(text).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new Error(code);return text;};
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
 await db.query('CREATE TABLE IF NOT EXISTS frieren_public_chat_presence(account_id TEXT PRIMARY KEY,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await db.query('CREATE TABLE IF NOT EXISTS frieren_public_chat_reactions(message_id UUID NOT NULL REFERENCES frieren_public_chat_messages(message_id) ON DELETE CASCADE,account_id TEXT NOT NULL,emoji VARCHAR(16) NOT NULL CHECK(emoji IN (\'❤️\',\'✨\',\'😂\')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,account_id,emoji))');
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

export async function listPublicChatMessages(db,{limit=60,viewerAccountId=null}={}){
 const count=Math.max(1,Math.min(100,Math.floor(Number(limit)||60)));
 const viewer=viewerAccountId&&ACCOUNT_ID.test(String(viewerAccountId))?String(viewerAccountId):null;
 await ensurePublicChatSchema(db);
 await ensureProfileMediaSchema(db);
 const result=await db.query(`SELECT m.message_id,m.account_id,m.username,m.body,m.created_at,m.edited_at,m.pinned_at,m.reply_to_message_id,m.account_id=$2 AS is_own,
  CASE WHEN EXISTS(SELECT 1 FROM frieren_profile_media pm WHERE pm.account_id=REPLACE(m.account_id,'site_','')::uuid AND pm.media_kind='avatar') THEN '/profil/media/public?accountId='||m.account_id ELSE NULL END AS avatar_url,
  EXISTS(SELECT 1 FROM frieren_public_chat_presence pr WHERE pr.account_id=m.account_id AND pr.last_seen_at>NOW()-INTERVAL '90 seconds') AS is_online,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.count,'reacted',r.reacted)) FROM (
   SELECT emoji,COUNT(*)::int AS count,BOOL_OR(account_id=$2) AS reacted FROM frieren_public_chat_reactions WHERE message_id=m.message_id GROUP BY emoji
  ) r),'[]'::jsonb) AS reactions,
  (SELECT jsonb_build_object('username',p.username,'body',LEFT(p.body,120)) FROM frieren_public_chat_messages p WHERE p.message_id=m.reply_to_message_id) AS reply
  FROM frieren_public_chat_messages m
  WHERE m.hidden=FALSE AND m.created_at>=NOW()-INTERVAL '7 days'
   AND ($2::text IS NULL OR NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE b.blocker_account_id=$2 AND b.blocked_account_id=m.account_id))
  ORDER BY (m.pinned_at IS NOT NULL) DESC,m.created_at DESC,m.message_id DESC LIMIT $1`,[count,viewer]);
 return result.rows.reverse().sort((a,b)=>Number(Boolean(b.pinned_at))-Number(Boolean(a.pinned_at)));
}

export async function sendPublicChatMessage(db,{accountId,username,body,replyToMessageId=null}){
 assertAccount(accountId);
 const author=clean(username,24,'PUBLIC_CHAT_USERNAME_INVALID');
 const message=clean(body,500,'PUBLIC_CHAT_MESSAGE_INVALID');
 if(replyToMessageId&&!/^[0-9a-f-]{36}$/i.test(String(replyToMessageId)))throw new Error('PUBLIC_CHAT_REPLY_INVALID');
 await ensurePublicChatSchema(db);
 return transaction(db,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId]);
  const recent=await client.query("SELECT COUNT(*)::int AS count FROM frieren_public_chat_messages WHERE account_id=$1 AND created_at>NOW()-INTERVAL '60 seconds'",[accountId]);
  if(Number(recent.rows?.[0]?.count||0)>=5)return{status:'rate_limited'};
  if(replyToMessageId){const parent=await client.query('SELECT message_id FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE',[replyToMessageId]);if(!parent.rowCount)return{status:'reply_not_found'};}
  const id=randomUUID();
  const result=await client.query('INSERT INTO frieren_public_chat_messages(message_id,account_id,username,body,reply_to_message_id) VALUES($1,$2,$3,$4,$5) RETURNING message_id,username,body,created_at,reply_to_message_id',[id,accountId,author,message,replyToMessageId]);
  return{status:'sent',message:result.rows[0]};
 });
}

export async function togglePublicChatReaction(db,{accountId,messageId,emoji}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||''))||!['❤️','✨','😂'].includes(String(emoji||'')))throw new Error('PUBLIC_CHAT_REACTION_INVALID');
 await ensurePublicChatSchema(db);
 return transaction(db,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId+':'+messageId]);
  const message=await client.query('SELECT message_id FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE',[messageId]);
  if(!message.rowCount)return{status:'not_found'};
  const existing=await client.query('SELECT 1 FROM frieren_public_chat_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3',[messageId,accountId,emoji]);
  if(existing.rowCount){await client.query('DELETE FROM frieren_public_chat_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3',[messageId,accountId,emoji]);return{status:'removed'};}
  await client.query('INSERT INTO frieren_public_chat_reactions(message_id,account_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[messageId,accountId,emoji]);
  return{status:'added'};
 });
}

export async function blockPublicChatUser(db,{accountId,messageId}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_BLOCK_INVALID');
 await ensurePublicChatSchema(db);
 return transaction(db,async client=>{
  const target=await client.query('SELECT account_id,username FROM frieren_public_chat_messages WHERE message_id=$1 AND hidden=FALSE',[messageId]);
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

export async function deletePublicChatMessage(db,{accountId,messageId}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');
 await ensurePublicChatSchema(db);
 const result=await db.query('DELETE FROM frieren_public_chat_messages WHERE message_id=$1 AND account_id=$2 RETURNING message_id',[messageId,accountId]);
 return{status:result.rowCount?'deleted':'not_found'};
}

export async function updatePublicChatMessage(db,{accountId,messageId,body}){
 assertAccount(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');
 const message=clean(body,500,'PUBLIC_CHAT_MESSAGE_INVALID');await ensurePublicChatSchema(db);
 const r=await db.query("UPDATE frieren_public_chat_messages SET body=$3,edited_at=NOW() WHERE message_id=$1 AND account_id=$2 AND hidden=FALSE AND created_at>NOW()-INTERVAL '15 minutes' RETURNING message_id",[messageId,accountId,message]);
 return{status:r.rowCount?'updated':'not_found'};
}
export async function togglePublicChatPin(db,{accountId,messageId}){
 assertAccount(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');await ensurePublicChatSchema(db);
 const r=await db.query("UPDATE frieren_public_chat_messages SET pinned_at=CASE WHEN pinned_at IS NULL THEN NOW() ELSE NULL END WHERE message_id=$1 AND account_id=$2 AND hidden=FALSE RETURNING pinned_at",[messageId,accountId]);
 return{status:r.rowCount?(r.rows[0].pinned_at?'pinned':'unpinned'):'not_found'};
}
export async function touchPublicChatPresence(db,{accountId}){
 assertAccount(accountId);await ensurePublicChatSchema(db);
 await db.query('INSERT INTO frieren_public_chat_presence(account_id,last_seen_at) VALUES($1,NOW()) ON CONFLICT(account_id) DO UPDATE SET last_seen_at=NOW()',[accountId]);
 return{status:'online'};
}
export async function getPublicChatPresence(db){
 await ensurePublicChatSchema(db);
 const r=await db.query("SELECT COUNT(*)::int AS online FROM frieren_public_chat_presence WHERE last_seen_at>NOW()-INTERVAL '90 seconds'");
 return{online:Number(r.rows[0]?.online||0)};
}
