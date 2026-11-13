import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {assertIsolatedAuditDatabase} from './isolated-audit-db-guard.js';
import {ensurePublicChatSchema,listPublicChatMessages,deleteOwnPublicChatMessage,updatePublicChatMessage,togglePublicChatReaction,sendPublicChatMessage} from '../public-chat.js';
import {sendSiteDirectMessage,listSiteDirectMessages,markSiteDirectMessagesRead,ensureSiteDirectMessageSchema,createSiteDmGroup,listSiteDmGroups,sendSiteDmGroupMessage,listSiteDmGroupMessages,markSiteDmGroupMessagesRead,leaveSiteDmGroup} from '../site-direct-messages.js';

const {Pool}=pg;
const account=()=> 'site_'+randomUUID();
test('legacy reaction constraint upgrades to native Unicode emoji and deleted messages stay consistent',async()=>{
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
  const nativeReaction=await togglePublicChatReaction(scoped,{accountId:account(),messageId,emoji:'👨🏽‍🚀'});
  assert.equal(nativeReaction.status,'added','the old fixed allowlist must accept a native keyboard emoji');
  const reactions=await scoped.query('SELECT COUNT(*)::int AS count FROM frieren_public_chat_reactions WHERE message_id=$1',[messageId]);
  assert.equal(reactions.rows[0].count,allowed.length+1);
  await assert.rejects(()=>togglePublicChatReaction(scoped,{accountId:account(),messageId,emoji:'hello'}),/PUBLIC_CHAT_REACTION_INVALID/);
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
  await markSiteDmGroupMessagesRead(scoped,{accountId:c,groupId:group.groupId});
  const groupInbox=await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId});
  assert.equal(groupInbox.status,'ok');assert.equal(groupInbox.messages.length,1);assert.equal(groupInbox.messages[0].username,'Gezgin');
  assert.equal(groupInbox.messages[0].is_read,false,'another member reading the message must not mark it read for this viewer');
  assert.equal((await markSiteDmGroupMessagesRead(scoped,{accountId:b,groupId:group.groupId})).status,'read');
  const groupReadByViewer=await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId});
  assert.equal(groupReadByViewer.messages[0].is_read,true,'the current viewer read receipt must be reflected');
  await scoped.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3)',[b,a,'Gezgin']);
  assert.equal((await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId})).messages.length,0);
  await scoped.query('DELETE FROM frieren_public_chat_blocks WHERE blocker_account_id=$1 AND blocked_account_id=$2',[b,a]);
  await scoped.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3)',[a,c,'Fern']);
  const reverseBlocked=await sendSiteDmGroupMessage(scoped,{senderAccountId:c,groupId:group.groupId,body:'Engellenen üyeden mesaj'});
  assert.equal(reverseBlocked.status,'sent');
  const creatorInbox=await listSiteDmGroupMessages(scoped,{accountId:a,groupId:group.groupId});
  assert.equal(creatorInbox.messages.some(message=>message.sender_account_id===c),false,'messages from a member who blocked the viewer must remain hidden');
  const creatorRead=await markSiteDmGroupMessagesRead(scoped,{accountId:a,groupId:group.groupId});
  assert.equal(creatorRead.status,'read');
  assert.equal((await leaveSiteDmGroup(scoped,{accountId:a,groupId:group.groupId})).status,'left');
  await scoped.query('INSERT INTO frieren_public_chat_blocks(blocker_account_id,blocked_account_id,blocked_username) VALUES($1,$2,$3)',[b,a,'Gezgin']);
  const blockCheck=await scoped.query('SELECT 1 FROM frieren_public_chat_blocks WHERE (blocker_account_id=$1 AND blocked_account_id=$2) OR (blocker_account_id=$2 AND blocked_account_id=$1)',[a,b]);
  assert.equal(blockCheck.rowCount,1,'reciprocal block must be persisted before direct-message authorization');
  assert.equal((await sendSiteDirectMessage(scoped,{senderAccountId:a,recipientAccountId:b,body:'Engel sonrası'})).status,'not_allowed');
  assert.deepEqual((await listSiteDirectMessages(scoped,{accountId:a,otherAccountId:b})),{status:'not_allowed',messages:[]});
 }finally{
  await pool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
  await pool.end();
 }
});

test('PostgreSQL persists media metadata with public, friend and group message scopes',async()=>{
 assertIsolatedAuditDatabase();
 const keys=['CHAT_MEDIA_R2_ACCOUNT_ID','CHAT_MEDIA_R2_BUCKET','CHAT_MEDIA_R2_ACCESS_KEY_ID','CHAT_MEDIA_R2_SECRET_ACCESS_KEY'];
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 const schema='chat_media_rehearsal_'+randomUUID().replaceAll('-','');
 try{
  await pool.query('CREATE SCHEMA "'+schema+'"');
  const scoped={
   async connect(){const client=await pool.connect();try{await client.query('SET search_path TO "'+schema+'"');return client;}catch(error){client.release();throw error;}},
   async query(sql,params){const client=await this.connect();try{return await client.query(sql,params);}finally{client.release();}}
  };
  await ensureSiteDirectMessageSchema(scoped);
  await scoped.query('CREATE TABLE site_discord_links(account_id UUID NOT NULL,user_id TEXT NOT NULL)');
  const a=account(),b=account(),c=account(),outsider=account();
  for(const friend of [b,c])await scoped.query("INSERT INTO frieren_account_friend_requests(request_id,requester_account_id,recipient_account_id,status) VALUES($1,$2,$3,'accepted')",[randomUUID(),a,friend]);
  const publicMedia=randomUUID(),dmMedia=randomUUID(),groupMedia=randomUUID(),wrongScopeMedia=randomUUID();
  const mediaRows=[
   [publicMedia,a,'public','public','image/png'],
   [dmMedia,a,'dm','dm:'+[a,b].sort().join(':'),'image/jpeg'],
   [groupMedia,a,'group','group:pending','image/webp'],
   [wrongScopeMedia,a,'dm','dm:'+[a,b].sort().join(':'),'image/jpeg']
  ];
  for(const [id,owner,scope,scopeKey,mime] of mediaRows)await scoped.query('INSERT INTO frieren_site_chat_media(media_id,owner_account_id,scope_type,scope_key,object_key,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,owner,scope,scopeKey,'chat/'+scope+'/'+id+'.'+(mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp'),mime,32]);
  const publicSent=await sendPublicChatMessage(scoped,{accountId:a,username:'Fern',body:'Görsel',mediaId:publicMedia});
  assert.equal(publicSent.status,'sent');
  const publicHistory=await listPublicChatMessages(scoped,{viewerAccountId:a});
  assert.equal(publicHistory.find(message=>message.message_id===publicSent.message.message_id)?.media_id,publicMedia);
  assert.equal(publicHistory.find(message=>message.message_id===publicSent.message.message_id)?.media_url,null,'without R2 credentials, no public object URL may be emitted');
  const dmSent=await sendSiteDirectMessage(scoped,{senderAccountId:a,recipientAccountId:b,body:'Özel görsel',mediaId:dmMedia});
  assert.equal(dmSent.status,'sent');
  const dmHistory=await listSiteDirectMessages(scoped,{accountId:b,otherAccountId:a});
  assert.equal(dmHistory.messages[0].media_id,dmMedia);assert.equal(dmHistory.messages[0].media_url,null);
  const group=await createSiteDmGroup(scoped,{creatorAccountId:a,memberAccountIds:[b,c],title:'Medya grubu'});
  assert.equal(group.status,'created');
  await scoped.query('UPDATE frieren_site_chat_media SET scope_key=$2 WHERE media_id=$1',[groupMedia,'group:'+group.groupId]);
  const groupSent=await sendSiteDmGroupMessage(scoped,{senderAccountId:a,groupId:group.groupId,body:'Grup görseli',mediaId:groupMedia});
  assert.equal(groupSent.status,'sent');
  const groupHistory=await listSiteDmGroupMessages(scoped,{accountId:b,groupId:group.groupId});
  assert.equal(groupHistory.messages[0].media_id,groupMedia);assert.equal(groupHistory.messages[0].media_url,null);
  assert.deepEqual(await listSiteDmGroupMessages(scoped,{accountId:outsider,groupId:group.groupId}),{status:'not_allowed',messages:[]});
  await assert.rejects(()=>sendPublicChatMessage(scoped,{accountId:a,username:'Fern',body:'',mediaId:wrongScopeMedia}),/CHAT_MEDIA_ATTACHMENT_NOT_ALLOWED/);
  const stillPending=await scoped.query('SELECT message_id FROM frieren_site_chat_media WHERE media_id=$1',[wrongScopeMedia]);
  assert.equal(stillPending.rows[0].message_id,null,'a media object from another conversation must not be attachable');
 }finally{
  await pool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
  await pool.end();
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
 }
});
