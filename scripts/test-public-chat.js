import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePublicChatSchema,listPublicChatMessages,sendPublicChatMessage,deletePublicChatMessage} from '../public-chat.js';

const account='site_123e4567-e89b-12d3-a456-426614174000';
test('public chat schema is additive and never destroys existing data',async()=>{
 const statements=[];
 await ensurePublicChatSchema({query:async sql=>{statements.push(sql);return{rows:[],rowCount:0};}});
 assert.ok(statements.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS frieren_public_chat_messages')));
 assert.ok(statements.some(sql=>sql.includes('frieren_public_chat_recent_idx')));
 assert.ok(statements.every(sql=>! /DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql)));
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
test('chat message deletion is scoped to its author account',async()=>{
 let sql='',params;
 const db={query:async(q,p)=>{if(q.startsWith('DELETE FROM frieren_public_chat_messages')){sql=q;params=p;return{rows:[{message_id:p[0]}],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await deletePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'});
 assert.equal(result.status,'deleted');assert.match(sql,/message_id=\$1 AND account_id=\$2/);assert.equal(params[1],account);
});

test('chat reactions can be toggled only for an existing message and an allowed emoji',async()=>{
 const {togglePublicChatReaction}=await import('../public-chat.js');let inserted=0;
 const db={async query(sql){if(sql.includes('SELECT message_id FROM frieren_public_chat_messages'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1};if(sql.includes('SELECT 1 FROM frieren_public_chat_reactions'))return{rows:[],rowCount:0};if(sql.includes('INSERT INTO frieren_public_chat_reactions')){inserted++;return{rows:[],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'✨'});assert.equal(result.status,'added');assert.equal(inserted,1);
 await assert.rejects(togglePublicChatReaction(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',emoji:'🔥'}),/PUBLIC_CHAT_REACTION_INVALID/);
});
test('chat blocking resolves a message author without exposing account identifiers in the message list',async()=>{
 const {blockPublicChatUser,unblockPublicChatUser}=await import('../public-chat.js');let blockSql='';
 const db={async query(sql){if(sql.includes('SELECT account_id,username FROM frieren_public_chat_messages'))return{rows:[{account_id:'site_123e4567-e89b-12d3-a456-426614174999',username:'Fern'}],rowCount:1};if(sql.includes('INSERT INTO frieren_public_chat_blocks')){blockSql=sql;return{rows:[{}],rowCount:1};}if(sql.includes('DELETE FROM frieren_public_chat_blocks'))return{rows:[{}],rowCount:1};return{rows:[],rowCount:0};}};
 const blocked=await blockPublicChatUser(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'});assert.equal(blocked.status,'blocked');assert.ok(blockSql.includes('blocked_account_id'));
 const unblocked=await unblockPublicChatUser(db,{accountId:account,targetAccountId:'site_123e4567-e89b-12d3-a456-426614174999'});assert.equal(unblocked.status,'unblocked');
});

test('chat edits are limited to the author and recent messages',async()=>{
 const {updatePublicChatMessage}=await import('../public-chat.js');let sql='',params;
 const db={async query(q,p){if(q.startsWith('UPDATE frieren_public_chat_messages')){sql=q;params=p;return{rows:[{message_id:p[0]}],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await updatePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000',body:'Düzenlendi'});assert.equal(result.status,'updated');assert.match(sql,/account_id=\$2/);assert.match(sql,/15 minutes/);assert.equal(params[1],account);
});
test('chat pinning and presence are account-scoped and expose only aggregate online count',async()=>{
 const {togglePublicChatPin,touchPublicChatPresence,getPublicChatPresence}=await import('../public-chat.js');let pinSql='',presenceSql='';
 const db={async query(q){if(q.startsWith('UPDATE frieren_public_chat_messages')){pinSql=q;return{rows:[{pinned_at:new Date()}],rowCount:1};}if(q.startsWith('INSERT INTO frieren_public_chat_presence')){presenceSql=q;return{rows:[],rowCount:1};}if(q.startsWith('SELECT COUNT(*)::int AS online'))return{rows:[{online:3}],rowCount:1};return{rows:[],rowCount:0};}};
 assert.equal((await togglePublicChatPin(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'})).status,'pinned');assert.match(pinSql,/account_id=\$2/);
 assert.equal((await touchPublicChatPresence(db,{accountId:account})).status,'online');assert.ok(presenceSql.includes('frieren_public_chat_presence'));
 assert.deepEqual(await getPublicChatPresence(db),{online:3});
});
