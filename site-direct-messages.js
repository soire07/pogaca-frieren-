import { randomUUID } from 'node:crypto';
import { createAccountNotification, ensureAccountProfileSchema } from './account-profile.js';
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

 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_dm_groups(
  group_id UUID PRIMARY KEY,created_by TEXT NOT NULL,title VARCHAR(40) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_dm_group_members(
  group_id UUID NOT NULL REFERENCES frieren_site_dm_groups(group_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(group_id,account_id)
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_dm_group_members_account_idx ON frieren_site_dm_group_members(account_id,joined_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_dm_group_messages(
  message_id UUID PRIMARY KEY,group_id UUID NOT NULL REFERENCES frieren_site_dm_groups(group_id) ON DELETE CASCADE,
  sender_account_id TEXT NOT NULL,body VARCHAR(1000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_site_dm_group_messages_idx ON frieren_site_dm_group_messages(group_id,created_at DESC)');
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_site_dm_group_reads(
  message_id UUID NOT NULL REFERENCES frieren_site_dm_group_messages(message_id) ON DELETE CASCADE,
  reader_account_id TEXT NOT NULL,read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,reader_account_id)
 )`);

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
  await createAccountNotification(c,{accountId:recipient,type:'site_dm',title:'Yeni özel mesaj',body:message.slice(0,120),href:'/kesfet#topluluk-sohbeti',schemaReady:true});
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


export async function createSiteDmGroup(db,{creatorAccountId,memberAccountIds=[],title}){
 const creator=account(creatorAccountId),name=text(title,40);
 const members=[...new Set([creator,...(Array.isArray(memberAccountIds)?memberAccountIds.map(account):[])])];
 if(members.length<3||members.length>8)throw new Error('SITE_DM_GROUP_MEMBERS_INVALID');
 await ensureSiteDirectMessageSchema(db);
 return tx(db,async client=>{
  const lock=members.slice().sort().join(':');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[lock]);
  for(const member of members){if(member!==creator&&!await canMessage(client,creator,member))return{status:'not_allowed'};}
  const groupId=randomUUID();
  await client.query('INSERT INTO frieren_site_dm_groups(group_id,created_by,title) VALUES($1,$2,$3)',[groupId,creator,name]);
  for(const member of members)await client.query('INSERT INTO frieren_site_dm_group_members(group_id,account_id) VALUES($1,$2)',[groupId,member]);
  for(const member of members){if(member!==creator)await createAccountNotification(client,{accountId:member,type:'site_dm_group',title:'Grup sohbetine davet edildin',body:name,href:'/kesfet#topluluk-sohbeti',schemaReady:true});}
  return{status:'created',groupId};
 });
}
export async function listSiteDmGroups(db,accountId){
 const viewer=account(accountId);await ensureSiteDirectMessageSchema(db);
 const r=await db.query(`SELECT g.group_id,g.title,g.created_at,g.created_by,
  (SELECT COUNT(*)::int FROM frieren_site_dm_group_members gm WHERE gm.group_id=g.group_id) AS member_count,
  (SELECT COUNT(*)::int FROM frieren_site_dm_group_messages m WHERE m.group_id=g.group_id AND m.sender_account_id<>$1 AND NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE b.blocker_account_id=$1 AND b.blocked_account_id=m.sender_account_id) AND NOT EXISTS(SELECT 1 FROM frieren_site_dm_group_reads rd WHERE rd.message_id=m.message_id AND rd.reader_account_id=$1)) AS unread_count
  FROM frieren_site_dm_groups g JOIN frieren_site_dm_group_members mine ON mine.group_id=g.group_id
  WHERE mine.account_id=$1 ORDER BY g.created_at DESC LIMIT 50`,[viewer]);
 return r.rows;
}
export async function sendSiteDmGroupMessage(db,{senderAccountId,groupId,body}){
 const sender=account(senderAccountId),message=text(body,1000);
 if(!/^[0-9a-f-]{36}$/i.test(String(groupId||'')))throw new Error('SITE_DM_GROUP_INVALID');
 await ensureSiteDirectMessageSchema(db);
 return tx(db,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[String(groupId)]);
  const member=await client.query('SELECT 1 FROM frieren_site_dm_group_members WHERE group_id=$1 AND account_id=$2',[groupId,sender]);
  if(!member.rowCount)return{status:'not_allowed'};
  const rate=await client.query(`SELECT
   (SELECT COUNT(*) FROM frieren_site_direct_messages WHERE sender_account_id=$1 AND created_at>NOW()-INTERVAL '10 minutes')+
   (SELECT COUNT(*) FROM frieren_site_dm_group_messages WHERE sender_account_id=$1 AND created_at>NOW()-INTERVAL '10 minutes') AS count`,[sender]);
  if(Number(rate.rows[0]?.count||0)>=20)return{status:'rate_limited'};
  const id=randomUUID();await client.query('INSERT INTO frieren_site_dm_group_messages(message_id,group_id,sender_account_id,body) VALUES($1,$2,$3,$4)',[id,groupId,sender,message]);
  await client.query('DELETE FROM frieren_site_dm_group_messages WHERE message_id IN (SELECT message_id FROM frieren_site_dm_group_messages WHERE group_id=$1 ORDER BY created_at DESC,message_id DESC OFFSET 500)',[groupId]);
  const recipients=await client.query('SELECT gm.account_id FROM frieren_site_dm_group_members gm WHERE gm.group_id=$1 AND gm.account_id<>$2 AND NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE (b.blocker_account_id=gm.account_id AND b.blocked_account_id=$2) OR (b.blocker_account_id=$2 AND b.blocked_account_id=gm.account_id))',[groupId,sender]);
  for(const recipient of recipients.rows)await createAccountNotification(client,{accountId:recipient.account_id,type:'site_dm_group',title:'Grup sohbetinde yeni mesaj',body:message.slice(0,120),href:'/kesfet#topluluk-sohbeti',schemaReady:true});
  return{status:'sent',messageId:id};
 });
}
export async function listSiteDmGroupMessages(db,{accountId,groupId,limit=60}){
 const viewer=account(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(groupId||'')))throw new Error('SITE_DM_GROUP_INVALID');
 const n=Math.max(1,Math.min(100,Math.floor(Number(limit)||60)));await ensureSiteDirectMessageSchema(db);
 const member=await db.query('SELECT 1 FROM frieren_site_dm_group_members WHERE group_id=$1 AND account_id=$2',[groupId,viewer]);
 if(!member.rowCount)return{status:'not_allowed',messages:[]};
 const r=await db.query(`SELECT m.message_id,m.sender_account_id,COALESCE(NULLIF(ap.display_name,''),'Gezgin') AS username,m.body,m.created_at,(m.sender_account_id=$2) AS is_own,
  EXISTS(SELECT 1 FROM frieren_site_dm_group_reads rd WHERE rd.message_id=m.message_id AND rd.reader_account_id=$2) AS is_read
  FROM frieren_site_dm_group_messages m LEFT JOIN frieren_account_profiles ap ON ap.account_id=m.sender_account_id WHERE m.group_id=$1
  AND NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE b.blocker_account_id=$2 AND b.blocked_account_id=m.sender_account_id)
  ORDER BY m.created_at DESC,m.message_id DESC LIMIT $3`,[groupId,viewer,n]);
 return{status:'ok',messages:r.rows.reverse()};
}
export async function markSiteDmGroupMessagesRead(db,{accountId,groupId}){
 const viewer=account(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(groupId||'')))throw new Error('SITE_DM_GROUP_INVALID');
 await ensureSiteDirectMessageSchema(db);
 const member=await db.query('SELECT 1 FROM frieren_site_dm_group_members WHERE group_id=$1 AND account_id=$2',[groupId,viewer]);
 if(!member.rowCount)return{status:'not_allowed',count:0};
 const r=await db.query(`INSERT INTO frieren_site_dm_group_reads(message_id,reader_account_id)
  SELECT m.message_id,$2 FROM frieren_site_dm_group_messages m WHERE m.group_id=$1 AND m.sender_account_id<>$2
  AND NOT EXISTS(SELECT 1 FROM frieren_public_chat_blocks b WHERE b.blocker_account_id=$2 AND b.blocked_account_id=m.sender_account_id)
  ON CONFLICT(message_id,reader_account_id) DO NOTHING`,[groupId,viewer]);
 return{status:'read',count:r.rowCount||0};
}
export async function leaveSiteDmGroup(db,{accountId,groupId}){
 const viewer=account(accountId);if(!/^[0-9a-f-]{36}$/i.test(String(groupId||'')))throw new Error('SITE_DM_GROUP_INVALID');
 await ensureSiteDirectMessageSchema(db);
 return tx(db,async client=>{
  const group=await client.query('SELECT created_by FROM frieren_site_dm_groups WHERE group_id=$1 FOR UPDATE',[groupId]);
  if(!group.rowCount)return{status:'not_found'};
  const removed=await client.query('DELETE FROM frieren_site_dm_group_members WHERE group_id=$1 AND account_id=$2 RETURNING account_id',[groupId,viewer]);
  if(!removed.rowCount)return{status:'not_member'};
  const next=await client.query('SELECT account_id FROM frieren_site_dm_group_members WHERE group_id=$1 ORDER BY joined_at,account_id LIMIT 1',[groupId]);
  if(!next.rowCount){await client.query('DELETE FROM frieren_site_dm_groups WHERE group_id=$1',[groupId]);return{status:'left',deleted:true};}
  if(group.rows[0].created_by===viewer)await client.query('UPDATE frieren_site_dm_groups SET created_by=$2 WHERE group_id=$1',[groupId,next.rows[0].account_id]);
  return{status:'left',deleted:false};
 });
}
