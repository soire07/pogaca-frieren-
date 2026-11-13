import test from 'node:test';
import assert from 'node:assert/strict';
import {sendSiteDirectMessage,listSiteDirectMessages,markSiteDirectMessagesRead} from '../site-direct-messages.js';

const a='site_123e4567-e89b-12d3-a456-426614174000';
const b='site_123e4567-e89b-12d3-a456-426614174001';
function database({friends=true,blocked=false,rate=0,thread=0}={}){
 const statements=[];
 return {statements,async query(sql,params=[]){
  statements.push({sql,params});
  if(sql.includes('SELECT 1 FROM frieren_account_friend_requests'))return{rows:friends?[{}]:[],rowCount:friends?1:0};
  if(sql.includes('SELECT 1 FROM frieren_public_chat_blocks'))return{rows:blocked?[{}]:[],rowCount:blocked?1:0};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM frieren_site_direct_messages WHERE sender_account_id'))return{rows:[{count:rate}],rowCount:1};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM frieren_site_direct_messages WHERE (sender_account_id'))return{rows:[{count:thread}],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_direct_messages'))return{rows:[],rowCount:1};
  if(sql.startsWith('SELECT message_id,sender_account_id'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174000',sender_account_id:b,recipient_account_id:a,body:'Selam',is_own:false}],rowCount:1};
  if(sql.startsWith('UPDATE frieren_site_direct_messages'))return{rows:[],rowCount:2};
  return{rows:[],rowCount:0};
 }};
}
test('site DMs require an accepted friend relationship and respect blocks in either direction',async()=>{
 const stranger=database({friends:false});
 assert.equal((await sendSiteDirectMessage(stranger,{senderAccountId:a,recipientAccountId:b,body:'Merhaba'})).status,'not_allowed');
 assert.ok(!stranger.statements.some(x=>x.sql.startsWith('INSERT INTO frieren_site_direct_messages')));
 const blocked=database({blocked:true});
 assert.equal((await sendSiteDirectMessage(blocked,{senderAccountId:a,recipientAccountId:b,body:'Merhaba'})).status,'not_allowed');
});
test('site DMs enforce sender rate limits and prune history to the newest 500 messages',async()=>{
 assert.equal((await sendSiteDirectMessage(database({rate:20}),{senderAccountId:a,recipientAccountId:b,body:'Merhaba'})).status,'rate_limited');
 const db=database();assert.equal((await sendSiteDirectMessage(db,{senderAccountId:a,recipientAccountId:b,body:'Merhaba'})).status,'sent');
 const prune=db.statements.find(x=>x.sql.startsWith('DELETE FROM frieren_site_direct_messages'));
 assert.ok(prune);assert.match(prune.sql,/OFFSET 500/);assert.deepEqual(prune.params,[a,b]);
});
test('site DMs persist only a validated friend-to-friend message',async()=>{
 const db=database();
 const result=await sendSiteDirectMessage(db,{senderAccountId:a,recipientAccountId:b,body:'  Merhaba Fern  '});
 assert.equal(result.status,'sent');
 const insert=db.statements.find(x=>x.sql.startsWith('INSERT INTO frieren_site_direct_messages'));
 assert.deepEqual(insert.params.slice(1),[a,b,'Merhaba Fern']);
 await assert.rejects(()=>sendSiteDirectMessage(db,{senderAccountId:a,recipientAccountId:b,body:' '}),/SITE_DM_MESSAGE_INVALID/);
 await assert.rejects(()=>sendSiteDirectMessage(db,{senderAccountId:a,recipientAccountId:a,body:'x'}),/SITE_DM_SELF_INVALID/);
});
test('site DM history is private to accepted unblocked friends and read receipts target only the viewer inbox',async()=>{
 const db=database();
 const history=await listSiteDirectMessages(db,{accountId:a,otherAccountId:b});
 assert.equal(history.status,'ok');assert.equal(history.messages.length,1);
 const read=await markSiteDirectMessagesRead(db,{accountId:a,otherAccountId:b});
 assert.deepEqual(read,{status:'read',count:2});
 const update=db.statements.find(x=>x.sql.startsWith('UPDATE frieren_site_direct_messages'));
 assert.match(update.sql,/sender_account_id=\$2 AND recipient_account_id=\$1 AND read_at IS NULL/);
 assert.deepEqual(update.params,[a,b]);
 const noFriend=database({friends:false});
 assert.deepEqual(await listSiteDirectMessages(noFriend,{accountId:a,otherAccountId:b}),{status:'not_allowed',messages:[]});
});
