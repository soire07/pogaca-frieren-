import { randomUUID } from 'node:crypto';

const publicChatSchemaReady=new WeakMap();
const ACCOUNT_ID=/^site_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max,code)=>{const text=String(value??'').normalize('NFC').trim();if(!text||Array.from(text).length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new Error(code);return text;};
function assertAccount(accountId){if(!ACCOUNT_ID.test(String(accountId||'')))throw new Error('PUBLIC_CHAT_ACCOUNT_INVALID');}
async function transaction(db,fn){if(typeof db.connect!=='function')return fn(db);const client=await db.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}

async function createPublicChatSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS frieren_public_chat_messages(
  message_id UUID PRIMARY KEY,account_id TEXT NOT NULL,username VARCHAR(24) NOT NULL,body VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),hidden BOOLEAN NOT NULL DEFAULT FALSE
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_recent_idx ON frieren_public_chat_messages(created_at DESC) WHERE hidden=FALSE');
 await db.query('CREATE INDEX IF NOT EXISTS frieren_public_chat_account_idx ON frieren_public_chat_messages(account_id,created_at DESC)');
}
export async function ensurePublicChatSchema(db){
 if(!db||typeof db.query!=='function')throw new Error('PUBLIC_CHAT_DATABASE_INVALID');
 let pending=publicChatSchemaReady.get(db);
 if(!pending){pending=createPublicChatSchema(db);publicChatSchemaReady.set(db,pending);}
 try{await pending;}catch(error){publicChatSchemaReady.delete(db);throw error;}
}

export async function listPublicChatMessages(db,{limit=60}={}){
 const count=Math.max(1,Math.min(100,Math.floor(Number(limit)||60)));
 await ensurePublicChatSchema(db);
 const result=await db.query('SELECT message_id,username,body,created_at FROM frieren_public_chat_messages WHERE hidden=FALSE AND created_at>=NOW()-INTERVAL \'7 days\' ORDER BY created_at DESC,message_id DESC LIMIT $1',[count]);
 return result.rows.reverse();
}

export async function sendPublicChatMessage(db,{accountId,username,body}){
 assertAccount(accountId);
 const author=clean(username,24,'PUBLIC_CHAT_USERNAME_INVALID');
 const message=clean(body,500,'PUBLIC_CHAT_MESSAGE_INVALID');
 await ensurePublicChatSchema(db);
 return transaction(db,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId]);
  const recent=await client.query("SELECT COUNT(*)::int AS count FROM frieren_public_chat_messages WHERE account_id=$1 AND created_at>NOW()-INTERVAL '60 seconds'",[accountId]);
  if(Number(recent.rows?.[0]?.count||0)>=5)return{status:'rate_limited'};
  const id=randomUUID();
  const result=await client.query('INSERT INTO frieren_public_chat_messages(message_id,account_id,username,body) VALUES($1,$2,$3,$4) RETURNING message_id,username,body,created_at',[id,accountId,author,message]);
  return{status:'sent',message:result.rows[0]};
 });
}

export async function deletePublicChatMessage(db,{accountId,messageId}){
 assertAccount(accountId);
 if(!/^[0-9a-f-]{36}$/i.test(String(messageId||'')))throw new Error('PUBLIC_CHAT_MESSAGE_INVALID');
 await ensurePublicChatSchema(db);
 const result=await db.query('DELETE FROM frieren_public_chat_messages WHERE message_id=$1 AND account_id=$2 RETURNING message_id',[messageId,accountId]);
 return{status:result.rowCount?'deleted':'not_found'};
}
