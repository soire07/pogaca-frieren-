import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {assertIsolatedAuditDatabase} from './isolated-audit-db-guard.js';
import {ensurePublicChatSchema,deleteOwnPublicChatMessage,updatePublicChatMessage,togglePublicChatReaction,sendPublicChatMessage} from '../public-chat.js';
import {sendSiteDirectMessage,listSiteDirectMessages,markSiteDirectMessagesRead,ensureSiteDirectMessageSchema,createSiteDmGroup,listSiteDmGroups,sendSiteDmGroupMessage,listSiteDmGroupMessages,markSiteDmGroupMessagesRead,leaveSiteDmGroup} from '../site-direct-messages.js';

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


test('site private messages enforce accepted friendships, block rules, receipts and bounded persistence on PostgreSQL',async()=>{
 assertIsolatedAuditDatabase();
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 const schema='site_dm_rehearsal_'+randomUUID().replaceAll('-','');
 try{
  await pool.query('CREATE SCHEMA "'+schema+'"');
  const scoped={
   async connect(){const client=await pool.connect();try{await client.query('SET search_path TO "'+schema+'"');return client;}catch(error){client.release();throw error;}},
   async query(sql,params){const client=await this.connect();try{return await client.query(sql,params);}finally{client.release();}}
  };
  await ensureSiteDirectMessageSchema(scoped);
  const a=account(),b=account();
  await scoped.query("INSERT INTO frieren_account_friend_requests(request_id,requester_account_id,recipient_account_id,status) VALUES($1,$2,$3,'accepted')",[randomUUID(),a,b]);
  const sent=await sendSiteDirectMessage(scoped,{senderAccountId:a,recipientAccountId:b,body:'Özel selam'});
  assert.equal(sent.status,'sent');
  const inbox=await listSiteDirectMessages(scoped,{accountId:b,otherAccountId:a});
  assert.equal(inbox.status,'ok');assert.equal(inbox.messages.length,1);assert.equal(inbox.messages[0].body,'Özel selam');assert.equal(inbox.messages[0].is_own,false);
  const receipt=await markSiteDirectMessagesRead(scoped,{accountId:b,otherAccountId:a});
  assert.equal(receipt.status,'read');assert.equal(receipt.count,1);
  const read=await listSiteDirectMessages(scoped,{accountId:a,otherAccountId:b});
  assert.ok(read.messages[0].read_at);
  const c=account();
  await scoped.query("INSERT INTO frieren_account_friend_requests(request_id,requester_account_id,recipient_account_id,status) VALUES($1,$2,$3,'accepted')",[randomUUID(),a,c]);
  const group=await createSiteDmGroup(scoped,{creatorAccountId:a,memberAccountIds:[b,c],title:'Büyü akademisi'});
  assert.equal(group.status,'created');
  assert.equal((await listSiteDmGroups(scoped,b)).length,1);
  const groupSent=await sendSiteDmGroupMessage(scoped,{senderAccountId:a,groupId:group.groupId,body:'Grup mesajı'});
  assert.equal(groupSent.status,'sent');
  const groupInbox=await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId});
  assert.equal(groupInbox.status,'ok');assert.equal(groupInbox.messages.length,1);assert.equal(groupInbox.messages[0].username,'Gezgin');
  assert.equal((await markSiteDmGroupMessagesRead(scoped,{accountId:b,groupId:group.groupId})).status,'read');
  await scoped.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3)',[b,a,'Gezgin']);
  assert.equal((await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId})).messages.length,0);
  assert.equal((await leaveSiteDmGroup(scoped,{accountId:a,groupId:group.groupId})).status,'left');
  await scoped.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3)',[b,a,'Fern']);
  assert.equal((await sendSiteDirectMessage(scoped,{senderAccountId:a,recipientAccountId:b,body:'Engel sonrası'})).status,'not_allowed');
  assert.deepEqual((await listSiteDirectMessages(scoped,{accountId:a,otherAccountId:b})),{status:'not_allowed',messages:[]});
 }finally{
  await pool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
  await pool.end();
 }
});
