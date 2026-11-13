import { randomUUID } from 'node:crypto';
import { ensureAccountProfileSchema } from './account-profile.js';
import { ensurePublicChatSchema } from './public-chat.js';

const ACCOUNT=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ready=new WeakMap();
const account=id=>{if(!ACCOUNT.test(String(id||'')))throw new Error('SITE_DM_ACCOUNT_INVALID');return String(id);};
const text=(value,max)=>{const v=String(value??'').normalize('NFC').trim();if(!v||Array.from(v).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw new Error('SITE_DM_MESSAGE_INVALID');return v;};
async function tx(db,fn){if(typeof db.connect!=='function')return fn(db);const c=await db.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
async function createSchema(db){
 await ensureAccountProfileSchema(db);
 await ensurePublicChatSchema(db);
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_direct_messages(
  message_id UUID PRIMARY KEY,sender_account_id TEXT NOT NULL,recipient_account_id TEXT NOT NULL,
  body VARCHAR(1000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,
  CHECK(sender_account_id<>recipient_account_id)
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_dm_thread_idx ON frieren_site_direct_messages(sender_account_id,recipient_account_id,created_at DESC)');
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_dm_inbox_idx ON frieren_site_direct_messages(recipient_account_id,read_at,created_at DESC)');
}
export async function ensureSiteDirectMessageSchema(db){
 if(!db||typeof db.query!=='function')throw new Error('SITE_DM_DATABASE_INVALID');
 let p=ready.get(db);if(!p){p=createSchema(db);ready.set(db,p);}try{await p;}catch(e){ready.delete(db);throw e;}
}
async function canMessage(db,a,b){
 const friendship=await db.query("SELECT 1 FROM frieren_account_friend_requests WHERE status='accepted' AND ((requester_account_id=$1 AND recipient_account_id=$2) OR (requester_account_id=$2 AND recipient_account_id=$1)) LIMIT 1",[a,b]);
 if(!friendship.rowCount)return false;
 const blocked=await db.query('SELECT 1 FROM frieren_public_chat_blocks WHERE (blocker_account_id=$1 AND blocked_account_id=$2) OR (blocker_account_id=$2 AND blocked_account_id=$1) LIMIT 1',[a,b]);
 return !blocked.rowCount;
}
export async function sendSiteDirectMessage(db,{senderAccountId,recipientAccountId,body}){
 const sender=account(senderAccountId),recipient=account(recipientAccountId),message=text(body,1000);
 if(sender===recipient)throw new Error('SITE_DM_SELF_INVALID');
 await ensureSiteDirectMessageSchema(db);
 return tx(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[[sender,recipient].sort().join(':')]);
  if(!await canMessage(c,sender,recipient))return{status:'not_allowed'};
  const rate=await c.query("SELECT COUNT(*)::int AS count FROM frieren_site_direct_messages WHERE sender_account_id=$1 AND created_at>NOW()-INTERVAL '10 minutes'",[sender]);
  if(Number(rate.rows[0]?.count||0)>=20)return{status:'rate_limited'};
  const id=randomUUID();
  await c.query('INSERT INTO frieren_site_direct_messages(message_id,sender_account_id,recipient_account_id,body) VALUES($1,$2,$3,$4)',[id,sender,recipient,message]);
  await c.query(`DELETE FROM frieren_site_direct_messages WHERE message_id IN (
   SELECT message_id FROM frieren_site_direct_messages
   WHERE (sender_account_id=$1 AND recipient_account_id=$2) OR (sender_account_id=$2 AND recipient_account_id=$1)
   ORDER BY created_at DESC,message_id DESC OFFSET 500
  )`,[sender,recipient]);
  return{status:'sent',messageId:id};
 });
}
export async function listSiteDirectMessages(db,{accountId,otherAccountId,limit=50}){
 const viewer=account(accountId),other=account(otherAccountId);if(viewer===other)throw new Error('SITE_DM_SELF_INVALID');
 const n=Math.max(1,Math.min(100,Math.floor(Number(limit)||50)));
 await ensureSiteDirectMessageSchema(db);
 if(!await canMessage(db,viewer,other))return{status:'not_allowed',messages:[]};
 const r=await db.query('SELECT message_id,sender_account_id,recipient_account_id,body,created_at,read_at,(sender_account_id=$1) AS is_own FROM frieren_site_direct_messages WHERE (sender_account_id=$1 AND recipient_account_id=$2) OR (sender_account_id=$2 AND recipient_account_id=$1) ORDER BY created_at DESC,message_id DESC LIMIT $3',[viewer,other,n]);
 return{status:'ok',messages:r.rows.reverse()};
}
export async function markSiteDirectMessagesRead(db,{accountId,otherAccountId}){
 const viewer=account(accountId),other=account(otherAccountId);if(viewer===other)throw new Error('SITE_DM_SELF_INVALID');
 await ensureSiteDirectMessageSchema(db);
 if(!await canMessage(db,viewer,other))return{status:'not_allowed',count:0};
 const r=await db.query('UPDATE frieren_site_direct_messages SET read_at=NOW() WHERE sender_account_id=$2 AND recipient_account_id=$1 AND read_at IS NULL',[viewer,other]);
 return{status:'read',count:r.rowCount||0};
}
