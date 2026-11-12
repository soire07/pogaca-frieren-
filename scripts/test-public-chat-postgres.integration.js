import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {assertIsolatedAuditDatabase} from './isolated-audit-db-guard.js';
import {ensurePublicChatSchema,deleteOwnPublicChatMessage,updatePublicChatMessage,togglePublicChatReaction,sendPublicChatMessage} from '../public-chat.js';

const {Pool}=pg;
const account=()=> 'site_'+randomUUID();
test('legacy three-reaction PostgreSQL constraint upgrades safely and deleted messages stay consistent',async()=>{
 assertIsolatedAuditDatabase();
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 const schema='public_chat_rehearsal_'+randomUUID().replaceAll('-','');
 try{
  await pool.query('CREATE SCHEMA "'+schema+'"');
  const scoped={
   async connect(){const client=await pool.connect();try{await client.query('SET search_path TO "'+schema+'"');return client;}catch(error){client.release();throw error;}},
   async query(sql,params){const client=await this.connect();try{return await client.query(sql,params);}finally{client.release();}}
  };
  await scoped.query(`CREATE TABLE frieren_public_chat_messages(message_id UUID PRIMARY KEY,account_id TEXT NOT NULL,username VARCHAR(24) NOT NULL,body VARCHAR(500) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),hidden BOOLEAN NOT NULL DEFAULT FALSE,reply_to_message_id UUID)`);
  await scoped.query(`CREATE TABLE frieren_public_chat_reactions(message_id UUID NOT NULL REFERENCES frieren_public_chat_messages(message_id) ON DELETE CASCADE,account_id TEXT NOT NULL,emoji VARCHAR(16) NOT NULL CHECK(emoji IN ('❤️','✨','😂')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,account_id,emoji))`);
  await ensurePublicChatSchema(scoped);
  const messageId=randomUUID(),author=account();
  await scoped.query('INSERT INTO frieren_public_chat_messages(message_id,account_id,username,body) VALUES($1,$2,$3,$4)',[messageId,author,'Fern','Eski mesaj']);
  const allowed=['❤️','✨','😂','😍','🥰','😭','👀','🎉','🙌','💜','🍪','🌸'];
  for(const emoji of allowed)await scoped.query('INSERT INTO frieren_public_chat_reactions(message_id,account_id,emoji) VALUES($1,$2,$3)',[messageId,account(),emoji]);
  const reactions=await scoped.query('SELECT COUNT(*)::int AS count FROM frieren_public_chat_reactions WHERE message_id=$1',[messageId]);
  assert.equal(reactions.rows[0].count,allowed.length);
  await assert.rejects(scoped.query('INSERT INTO frieren_public_chat_reactions(message_id,account_id,emoji) VALUES($1,$2,$3)',[messageId,account(),'🔥']),/frieren_public_chat_reactions_emoji_check|check constraint/i);
  const deleted=await deleteOwnPublicChatMessage(scoped,{accountId:author,messageId});
  assert.equal(deleted.status,'deleted');
  const tombstone=await scoped.query('SELECT body,deleted_at FROM frieren_public_chat_messages WHERE message_id=$1',[messageId]);
  assert.equal(tombstone.rows[0].body,'Bu mesaj silindi');
  assert.ok(tombstone.rows[0].deleted_at);
  assert.equal((await updatePublicChatMessage(scoped,{accountId:author,messageId,body:'geri al'})).status,'not_found');
  assert.equal((await togglePublicChatReaction(scoped,{accountId:account(),messageId,emoji:'💜'})).status,'not_found');
  const reply=await sendPublicChatMessage(scoped,{accountId:account(),username:'Stark',body:'Yanıt',replyToMessageId:messageId});
  assert.equal(reply.status,'reply_not_found');
 }finally{
  await pool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
  await pool.end();
 }
});
