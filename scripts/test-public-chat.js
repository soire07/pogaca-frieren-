import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePublicChatSchema,listPublicChatMessages,sendPublicChatMessage,deletePublicChatMessage,markPublicChatMessagesRead,reportPublicChatMessage,togglePublicChatPin,setPublicChatPaused,isValidPublicChatReactionEmoji} from '../public-chat.js';

const account='site_123e4567-e89b-12d3-a456-426614174000';
test('public chat schema is additive and never destroys existing data',async()=>{
 const statements=[];
 await ensurePublicChatSchema({query:async sql=>{statements.push(sql);return{rows:[],rowCount:0};}});
 assert.ok(statements.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS frieren_public_chat_messages')));
 assert.ok(statements.some(sql=>sql.includes('frieren_public_chat_recent_idx')));
 assert.ok(statements.every(sql=>! /DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql)));
});
test('reaction schema upgrades the fixed emoji allowlist to bounded Unicode reaction storage',async()=>{
 const statements=[];await ensurePublicChatSchema({query:async sql=>{statements.push(sql);return{rows:[],rowCount:0};}});
 const upgrade=statements.find(sql=>sql.includes('pg_get_constraintdef')&&sql.includes('frieren_public_chat_reactions_emoji_check'));
 assert.ok(upgrade.includes('DO $ BEGIN'));
 assert.ok(upgrade.includes('END; $'));
 assert.ok(upgrade,'schema must inspect and upgrade the existing emoji constraint');
 assert.match(upgrade,/DROP CONSTRAINT IF EXISTS frieren_public_chat_reactions_emoji_check/);
 assert.match(upgrade,/ADD CONSTRAINT frieren_public_chat_reactions_emoji_check CHECK/);
 assert.match(upgrade,/char_length\(emoji\) BETWEEN 1 AND 16/);
 assert.doesNotMatch(upgrade,/❤️|✨|😂|😍|🥰|😭|👀|🎉|🙌|💜|🍪|🌸/);
});
test('reaction emoji validation accepts one native Unicode emoji grapheme and rejects text or multiple emoji',()=>{
 for(const emoji of ['😂','🔥','🥹','👨🏽‍🚀','🏳️‍🌈','🇹🇷','1️⃣'])assert.equal(isValidPublicChatReactionEmoji(emoji),true,emoji);
 for(const value of ['', 'hello', '😂😂', '😂 hello', '  😂', 'a'.repeat(17)])assert.equal(isValidPublicChatReactionEmoji(value),false,value);
});
test('public chat rejects anonymous, malformed and oversized writes before database access',async()=>{
 let queries=0;const db={query:async()=>{queries++;return{rows:[],rowCount:0};}};
 await assert.rejects(sendPublicChatMessage(db,{accountId:'anonymous',username:'Gezgin',body:'Merhaba'}),/PUBLIC_CHAT_ACCOUNT_INVALID/);
 await assert.rejects(sendPublicChatMessage(db,{accountId:account,username:'Gezgin',body:'x'.repeat(501)}),/PUBLIC_CHAT_MESSAGE_INVALID/);
 await assert.rejects(sendPublicChatMessage(db,{accountId:account,username:'x'.repeat(25),body:'Merhaba'}),/PUBLIC_CHAT_USERNAME_INVALID/);
 assert.equal(queries,0);
});
test('public chat read is bounded and uses hidden-message filtering',async()=>{
 let sql='',params;
 const rows=[{message_id:'a',body:'one'},{message_id:'b',body:'two'}];
 const db={query:async(q,p)=>{if(q.includes('SELECT m.message_id')){sql=q;params=p;return{rows,rowCount:2};}return{rows:[],rowCount:0};}};
 const result=await listPublicChatMessages(db,{limit:1000});
 assert.equal(result.length,2);assert.equal(params[0],100);
 assert.match(sql,/hidden=FALSE/);assert.match(sql,/ORDER BY \(m\.pinned_at IS NOT NULL\) DESC,m\.created_at DESC,m\.message_id DESC/);
});
test('public chat marks only trusted owner authors for the visible OWNER badge',async()=>{
 let sql='',params;
 const db={query:async(q,p)=>{if(q.includes('SELECT m.message_id')){sql=q;params=p;return{rows:[{message_id:'owner-message',is_owner:true}],rowCount:1};}return{rows:[],rowCount:0};}};
 const owners=['site_123e4567-e89b-12d3-a456-426614174000'];
 const rows=await listPublicChatMessages(db,{ownerAccountIds:owners});
 assert.equal(rows[0].is_owner,true);
 assert.match(sql,/AS is_owner/);
 assert.match(sql,/site_discord_links/);
 assert.match(sql,/user_id='1553794496234262641'/);
 assert.deepEqual(params[4],owners);
});
test('chat deletion and pinning reject members and allow only owner moderation',async()=>{
 let deleteSql='',pinSql='';const db={async query(q){if(q.startsWith('DELETE FROM frieren_public_chat_messages')){deleteSql=q;return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1};}if(q.startsWith('UPDATE frieren_public_chat_messages')){pinSql=q;return{rows:[{pinned_at:new Date()}],rowCount:1};}return{rows:[],rowCount:0};}};
 await assert.rejects(()=>deletePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'}),/PUBLIC_CHAT_OWNER_REQUIRED/);
 await assert.rejects(()=>togglePublicChatPin(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'}),/PUBLIC_CHAT_OWNER_REQUIRED/);
 assert.equal((await deletePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',isOwner:true})).status,'deleted');
 assert.match(deleteSql,/WHERE message_id=\$1 RETURNING message_id/);
 assert.equal((await togglePublicChatPin(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',isOwner:true})).status,'pinned');
 assert.match(pinSql,/WHERE message_id=\$1 AND hidden=FALSE/);
});
test('only owner can pause or resume chat and paused chat rejects new posts',async()=>{
 let updateSql='';const ownerDb={async query(q){if(q.startsWith('UPDATE frieren_public_chat_control')){updateSql=q;return{rows:[{is_paused:true,updated_at:new Date()}],rowCount:1};}return{rows:[],rowCount:0};}};
 await assert.rejects(()=>setPublicChatPaused(ownerDb,{accountId:account,paused:true}),/PUBLIC_CHAT_OWNER_REQUIRED/);
 assert.equal((await setPublicChatPaused(ownerDb,{accountId:account,paused:true,isOwner:true})).paused,true);
 assert.match(updateSql,/updated_by=\$2/);
 let inserted=false;const pausedDb={async query(q){if(q.includes('SELECT is_paused FROM frieren_public_chat_control'))return{rows:[{is_paused:true}],rowCount:1};if(q.includes('INSERT INTO frieren_public_chat_messages'))inserted=true;return{rows:[],rowCount:0};}};
 assert.equal((await sendPublicChatMessage(pausedDb,{accountId:account,username:'Gezgin',body:'Yeni mesaj'})).status,'chat_paused');
 assert.equal(inserted,false);
});
test('chat reactions can be toggled for any single Unicode emoji on an existing message',async()=>{
 const {togglePublicChatReaction}=await import('../public-chat.js');let inserted=0;
 const db={async query(sql){if(sql.includes('SELECT message_id,account_id,username FROM frieren_public_chat_messages'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174000',account_id:'site_123e4567-e89b-12d3-a456-426614174001',username:'Fern'}],rowCount:1};if(sql.includes('SELECT 1 FROM frieren_public_chat_reactions'))return{rows:[],rowCount:0};if(sql.includes('INSERT INTO frieren_public_chat_reactions')){inserted++;return{rows:[],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'✨'});assert.equal(result.status,'added');assert.equal(inserted,1);
 assert.equal((await togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'💜'})).status,'added');
 await assert.equal((await togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'👨🏽‍🚀'})).status,'added');
  await assert.rejects(togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'hello'}),/PUBLIC_CHAT_REACTION_INVALID/);
});
test('chat blocking resolves a message author without exposing account identifiers in the message list',async()=>{
 const {blockPublicChatUser,unblockPublicChatUser}=await import('../public-chat.js');let blockSql='';
 const db={async query(sql){if(sql.includes('SELECT account_id,username FROM frieren_public_chat_messages'))return{rows:[{account_id:'site_123e4567-e89b-12d3-a456-426614174999',username:'Fern'}],rowCount:1};if(sql.includes('INSERT INTO frieren_public_chat_blocks')){blockSql=sql;return{rows:[{}],rowCount:1};}if(sql.includes('DELETE FROM frieren_public_chat_blocks'))return{rows:[{}],rowCount:1};return{rows:[],rowCount:0};}};
 const blocked=await blockPublicChatUser(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'});assert.equal(blocked.status,'blocked');assert.ok(blockSql.includes('blocked_account_id'));
 const unblocked=await unblockPublicChatUser(db,{accountId:account,targetAccountId:'site_123e4567-e89b-12d3-a456-426614174999'});assert.equal(unblocked.status,'unblocked');
});

test('members can soft-delete only their own recent messages',async()=>{
 const {deleteOwnPublicChatMessage}=await import('../public-chat.js');let sql='',params;
 const db={async query(q,p){if(q.startsWith('UPDATE frieren_public_chat_messages')){sql=q;params=p;return{rows:[{message_id:p[0]}],rowCount:1};}return{rows:[],rowCount:0};}};
 assert.equal((await deleteOwnPublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'})).status,'deleted');
 assert.match(sql,/account_id=\$2/);assert.match(sql,/deleted_at IS NULL/);assert.match(sql,/15 minutes/);assert.equal(params[1],account);
});
test('chat edits refuse deleted messages at the database boundary',async()=>{
 const {updatePublicChatMessage}=await import('../public-chat.js');let sql='';const db={async query(q){if(q.startsWith('UPDATE frieren_public_chat_messages')){sql=q;return{rows:[],rowCount:0};}return{rows:[],rowCount:0};}};
 const result=await updatePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',body:'revize'});assert.equal(result.status,'not_found');assert.match(sql,/deleted_at IS NULL/);
});
test('chat edits are limited to the author and recent messages',async()=>{
 const {updatePublicChatMessage}=await import('../public-chat.js');let sql='',params;
 const db={async query(q,p){if(q.startsWith('UPDATE frieren_public_chat_messages')){sql=q;params=p;return{rows:[{message_id:p[0]}],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await updatePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',body:'Düzenlendi'});assert.equal(result.status,'updated');assert.match(sql,/account_id=\$2/);assert.match(sql,/15 minutes/);assert.equal(params[1],account);
});
test('chat pinning and presence are account-scoped and expose only aggregate online count',async()=>{
 const {togglePublicChatPin,touchPublicChatPresence,getPublicChatPresence}=await import('../public-chat.js');let pinSql='',presenceSql='';
 const db={async query(q){if(q.startsWith('UPDATE frieren_public_chat_messages')){pinSql=q;return{rows:[{pinned_at:new Date()}],rowCount:1};}if(q.startsWith('INSERT INTO frieren_public_chat_presence')){presenceSql=q;return{rows:[],rowCount:1};}if(q.startsWith('SELECT COUNT(*)::int AS online'))return{rows:[{online:3}],rowCount:1};return{rows:[],rowCount:0};}};
 assert.equal((await togglePublicChatPin(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',isOwner:true})).status,'pinned');assert.match(pinSql,/WHERE message_id=\$1 AND hidden=FALSE/);
 assert.equal((await touchPublicChatPresence(db,{accountId:account})).status,'online');assert.ok(presenceSql.includes('frieren_public_chat_presence'));
 assert.deepEqual(await getPublicChatPresence(db),{online:3,typing:[]});
});

test('chat typing renews the live typing window for active accounts',async()=>{
 const {setPublicChatTyping}=await import('../public-chat.js');let sql='';const db={async query(q){if(q.startsWith('INSERT INTO frieren_public_chat_presence'))sql=q;return{rows:[],rowCount:1};}};
 await setPublicChatTyping(db,{accountId:account});assert.match(sql,/ON CONFLICT\(account_id\) DO UPDATE SET last_seen_at=NOW\(\),typing_until=NOW\(\)\+INTERVAL '12 seconds'/);
});
test('typing indicators expire through short-lived account presence',async()=>{
 const {setPublicChatTyping}=await import('../public-chat.js');let sql='';
 const db={async query(q){if(q.startsWith('INSERT INTO frieren_public_chat_presence'))sql=q;return{rows:[],rowCount:1};}};
 assert.equal((await setPublicChatTyping(db,{accountId:account})).status,'typing');assert.match(sql,/INTERVAL '12 seconds'/);
});

test('chat read receipts only mark visible message IDs supplied by the active reader',async()=>{
 let sql='',params;const messageId='123e4567-e89b-12d3-a456-426614174000';const db={async query(q,p){if(q.includes('INSERT INTO frieren_public_chat_reads')){sql=q;params=p;return{rows:[{message_id:messageId}],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await markPublicChatMessagesRead(db,{accountId:account,messageIds:[messageId]});assert.equal(result.status,'read');assert.equal(result.count,1);assert.match(sql,/message_id=ANY\(\$2::uuid\[\]\)/);assert.match(sql,/m\.account_id<>\$1/);assert.match(sql,/NOT EXISTS\(SELECT 1 FROM frieren_public_chat_blocks/);assert.match(sql,/ON CONFLICT\(message_id,reader_account_id\) DO NOTHING/);assert.deepEqual(params,[account,[messageId]]);
 assert.equal((await markPublicChatMessagesRead(db,{accountId:account,messageIds:[]})).count,0);
 await assert.rejects(()=>markPublicChatMessagesRead(db,{accountId:account,messageIds:['bad-id']}),/PUBLIC_CHAT_READ_INVALID/);
});

test('chat reports validate ownership, reason and prevent duplicate reports',async()=>{
 let inserted=0;const db={async query(q){if(q.startsWith('SELECT account_id FROM frieren_public_chat_messages'))return{rows:[{account_id:'site_123e4567-e89b-12d3-a456-426614174001'}],rowCount:1};if(q.startsWith('INSERT INTO frieren_public_chat_reports')){inserted++;return{rows:[{report_id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1};}return{rows:[],rowCount:0};}};
 assert.equal((await reportPublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',reason:'spam'})).status,'reported');
 assert.equal(inserted,1);
 await assert.rejects(()=>reportPublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',reason:'unknown'}),/PUBLIC_CHAT_REPORT_INVALID/);
});


test('community chat uses accessible in-page dialogs instead of native prompt and confirm popups',async()=>{
 const {readFile}=await import('node:fs/promises');const script=await readFile(new URL('../public-assets/public-chat.js',import.meta.url),'utf8');
 assert.match(script,/askChatDialog/);assert.match(script,/askChatReport/);assert.doesNotMatch(script,/window\.(?:prompt|confirm)\s*\(/);
});


test('public chat prefers an uploaded avatar and otherwise resolves the linked Discord avatar without leaking link fields',async()=>{
 const {buildDiscordAvatarUrl}=await import('../site-auth.js');
 let sql='';
 const db={async query(q){if(q.includes('SELECT m.message_id')){sql=q;return{rows:[
  {message_id:'uploaded',account_id:account,username:'Fern',avatar_url:'/profil/media/public?accountId='+account,discord_user_id:'123456789012345678',discord_avatar_hash:'a_customhash'},
  {message_id:'discord',account_id:account,username:'Stark',avatar_url:null,discord_user_id:'123456789012345678',discord_avatar_hash:'a_customhash'},
  {message_id:'default',account_id:account,username:'Frieren',avatar_url:null,discord_user_id:'123456789012345678',discord_avatar_hash:null}
 ],rowCount:3};}return{rows:[],rowCount:0};}};
 const rows=await listPublicChatMessages(db);
 assert.match(sql,/LEFT JOIN frieren_site_discord_accounts/);
 assert.match(sql,/discord_avatar_hash/);
 const byId=Object.fromEntries(rows.map(row=>[row.message_id,row]));
 assert.equal(byId.uploaded.avatar_url,'/profil/media/public?accountId='+account);
 assert.equal(byId.discord.avatar_url,buildDiscordAvatarUrl('123456789012345678','a_customhash'));
 assert.equal(byId.default.avatar_url,buildDiscordAvatarUrl('123456789012345678',null));
 assert.equal(Object.hasOwn(byId.discord,'discord_avatar_hash'),false);
 assert.equal(Object.hasOwn(byId.discord,'discord_user_id'),false);
});


test('community chat falls back to initials when an avatar image cannot be loaded',async()=>{
 const {readFile}=await import('node:fs/promises');const script=await readFile(new URL('../public-assets/public-chat.js',import.meta.url),'utf8');
 assert.match(script,/avatar\.onerror\s*=/);assert.match(script,/avatar\.replaceWith\(fallback\)/);assert.match(script,/fallback\.dataset\.online=avatar\.dataset\.online/);
});

test('public chat accepts an attachment-only message and binds media to its new message id',async()=>{
 const {sendPublicChatMessage}=await import('../public-chat.js');
 const account='site_123e4567-e89b-12d3-a456-426614174000',media='123e4567-e89b-12d3-a456-426614174099';const seen=[];
 const db={async query(sql,params=[]){seen.push({sql,params});
  if(sql.includes('SELECT is_paused'))return{rows:[{is_paused:false}],rowCount:1};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM frieren_public_chat_messages'))return{rows:[{count:0}],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_public_chat_messages'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174088'}],rowCount:1};
  if(sql.startsWith('UPDATE frieren_site_chat_media'))return{rows:[{media_id:media}],rowCount:1};
  return{rows:[],rowCount:1};
 }};
 const result=await sendPublicChatMessage(db,{accountId:account,username:'Gezgin',body:'',mediaId:media});
 assert.equal(result.status,'sent');const attach=seen.find(x=>x.sql.startsWith('UPDATE frieren_site_chat_media'));
 const insert=seen.find(x=>x.sql.startsWith('INSERT INTO frieren_public_chat_messages'));assert.ok(insert);assert.deepEqual(attach.params,[media,account,'public','public',insert.params[0]]);
});
