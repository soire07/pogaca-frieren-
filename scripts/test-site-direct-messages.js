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
  if(sql.includes('frieren_site_direct_messages WHERE sender_account_id=$1')&&sql.includes('10 minutes'))return{rows:[{count:rate}],rowCount:1};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM frieren_site_direct_messages WHERE (sender_account_id'))return{rows:[{count:thread}],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_direct_messages'))return{rows:[],rowCount:1};
  if(sql.startsWith('UPDATE frieren_site_chat_media'))return{rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT m.message_id,m.sender_account_id')||sql.startsWith('SELECT message_id,sender_account_id'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174000',sender_account_id:b,recipient_account_id:a,body:'Selam',is_own:false}],rowCount:1};
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


test('site group conversations require friendship with every invited member and support member-scoped actions',async()=>{
 const c='site_123e4567-e89b-12d3-a456-426614174002';let groupId='123e4567-e89b-12d3-a456-426614174003';const seen=[];
 const db={async query(sql,params=[]){seen.push({sql,params});
  if(sql.includes('SELECT 1 FROM frieren_account_friend_requests'))return{rows:[{}],rowCount:1};
  if(sql.includes('SELECT 1 FROM frieren_public_chat_blocks'))return{rows:[],rowCount:0};
  if(sql.startsWith('INSERT INTO frieren_site_dm_groups'))return{rows:[],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_dm_group_members'))return{rows:[],rowCount:1};
  if(sql.startsWith('SELECT account_id FROM frieren_site_dm_group_members WHERE group_id=$1 AND account_id<>$2'))return{rows:[{account_id:b},{account_id:c}],rowCount:2};
  if(sql.startsWith('SELECT 1 FROM frieren_site_dm_group_members'))return{rows:[{}],rowCount:1};
  if(sql.includes('frieren_site_dm_group_messages')&&sql.includes('LIMIT $3'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174004',sender_account_id:a,username:'Fern',body:'Grup selamı',created_at:new Date().toISOString(),is_own:false,is_read:false}],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_dm_group_messages'))return{rows:[],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_dm_group_reads'))return{rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT created_by FROM frieren_site_dm_groups'))return{rows:[{created_by:a}],rowCount:1};
  if(sql.startsWith('DELETE FROM frieren_site_dm_group_members'))return{rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT account_id FROM frieren_site_dm_group_members WHERE group_id=$1 ORDER BY'))return{rows:[{account_id:b}],rowCount:1};
  return{rows:[],rowCount:1};
 }};
 const {createSiteDmGroup,sendSiteDmGroupMessage,listSiteDmGroupMessages,markSiteDmGroupMessagesRead,leaveSiteDmGroup}=await import('../site-direct-messages.js');
 const created=await createSiteDmGroup(db,{creatorAccountId:a,memberAccountIds:[b,c],title:'Büyü akademisi'});assert.equal(created.status,'created');groupId=created.groupId;
 assert.equal(seen.filter(x=>x.sql.startsWith('INSERT INTO frieren_site_dm_group_members')).length,3);
 assert.equal((await sendSiteDmGroupMessage(db,{senderAccountId:a,groupId,body:'Grup selamı'})).status,'sent');
 const mediaId='123e4567-e89b-12d3-a456-426614174099';assert.equal((await sendSiteDmGroupMessage(db,{senderAccountId:a,groupId,body:'',mediaId})).status,'sent');const mediaAttach=seen.find(x=>x.sql.startsWith('UPDATE frieren_site_chat_media'));assert.equal(mediaAttach.params[2],'group');assert.equal(mediaAttach.params[3],'group:'+groupId);
 const messages=await listSiteDmGroupMessages(db,{accountId:b,groupId});assert.equal(messages.status,'ok');assert.ok(seen.some(x=>x.sql.includes('frieren_site_dm_group_messages')&&x.sql.includes('LIMIT $3')));
 assert.equal((await markSiteDmGroupMessagesRead(db,{accountId:b,groupId})).status,'read');
 assert.equal((await leaveSiteDmGroup(db,{accountId:a,groupId})).status,'left');
 assert.ok(seen.some(x=>x.sql.startsWith('UPDATE frieren_site_dm_groups SET created_by=$2')));
});
test('site group conversations reject nonmembers and require at least two invited friends',async()=>{
 const db=database({friends:false});const {createSiteDmGroup,sendSiteDmGroupMessage}=await import('../site-direct-messages.js');
 await assert.rejects(()=>createSiteDmGroup(db,{creatorAccountId:a,memberAccountIds:[b],title:'Küçük grup'}),/SITE_DM_GROUP_MEMBERS_INVALID/);
 const id='123e4567-e89b-12d3-a456-426614174003';
 assert.equal((await sendSiteDmGroupMessage(db,{senderAccountId:a,groupId:id,body:'selam'})).status,'not_allowed');
});


test('group message read state is scoped to the current viewer, not another member',async()=>{
 const {listSiteDmGroupMessages}=await import('../site-direct-messages.js');
 const groupId='123e4567-e89b-12d3-a456-426614174003';let messageSql='';
 const db={async query(sql){
  if(sql.startsWith('SELECT 1 FROM frieren_site_dm_group_members'))return{rows:[{}],rowCount:1};
  if(sql.includes('FROM frieren_site_dm_group_messages m LEFT JOIN')){messageSql=sql;return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174004',sender_account_id:a,username:'Fern',body:'Grup selamı',is_read:false}],rowCount:1};}
  return{rows:[],rowCount:0};
 }};
 const result=await listSiteDmGroupMessages(db,{accountId:b,groupId});
 assert.equal(result.messages[0].is_read,false);
 assert.match(messageSql,/rd\.reader_account_id=\$2/);
 assert.match(messageSql,/ap\.profile_slug/,'group messages must include the sender profile slug for profile navigation');
 assert.doesNotMatch(messageSql,/rd\.reader_account_id<>m\.sender_account_id/);
});

test('direct message media is bound to the accepted friend thread and sender account',async()=>{
 const db=database();const media='123e4567-e89b-12d3-a456-426614174099';
 const result=await sendSiteDirectMessage(db,{senderAccountId:a,recipientAccountId:b,body:'',mediaId:media});
 assert.equal(result.status,'sent');const attach=db.statements.find(x=>x.sql.startsWith('UPDATE frieren_site_chat_media'));
 assert.ok(attach);assert.equal(attach.params[1],a);assert.equal(attach.params[2],'dm');assert.equal(attach.params[3],'dm:'+[a,b].sort().join(':'));
});
