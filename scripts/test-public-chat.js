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
 const db={query:async(q,p)=>{if(q.includes('SELECT message_id')){sql=q;params=p;return{rows,rowCount:2};}return{rows:[],rowCount:0};}};
 const result=await listPublicChatMessages(db,{limit:1000});
 assert.equal(result.length,2);assert.equal(params[0],100);
 assert.match(sql,/hidden=FALSE/);assert.match(sql,/ORDER BY created_at DESC/);
});
test('chat message deletion is scoped to its author account',async()=>{
 let sql='',params;
 const db={query:async(q,p)=>{if(q.startsWith('DELETE FROM frieren_public_chat_messages')){sql=q;params=p;return{rows:[{message_id:p[0]}],rowCount:1};}return{rows:[],rowCount:0};}};
 const result=await deletePublicChatMessage(db,{accountId:account,messageId:'123e4567-e89b-12d3-a456-426614174000'});
 assert.equal(result.status,'deleted');assert.match(sql,/message_id=\$1 AND account_id=\$2/);assert.equal(params[1],account);
});
