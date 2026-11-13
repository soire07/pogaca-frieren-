import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureAccountProfileSchema,getAccountProfile,updateAccountProfile,followAccount,unfollowAccount,recordAccountProfileVisit,getAccountIdByProfileSlug,createAccountNotification,listAccountNotifications,markAccountNotificationsRead,listAccountFriends} from '../account-profile.js';
const a='site_123e4567-e89b-12d3-a456-426614174000',b='site_123e4567-e89b-12d3-a456-426614174001';
function dbMock(handler=()=>({rows:[],rowCount:0})){const calls=[];return{calls,async query(sql,params=[]){calls.push({sql,params});return handler(sql,params);}};}
test('account profile schema creates global profile, follow, activity and visit stores',async()=>{const db=dbMock();await ensureAccountProfileSchema(db);assert.ok(db.calls.some(x=>x.sql.includes('frieren_account_profiles')));assert.ok(db.calls.some(x=>x.sql.includes('frieren_account_follows')));assert.ok(db.calls.some(x=>x.sql.includes('frieren_account_activity')));});
test('account profile updates are account-scoped and validate HTTPS social links',async()=>{const row={account_id:a,bio:'Büyü araştırmacısı',status_text:'Yolculukta',interests:['anime'],tags:['frieren'],theme:'violet',visibility:'public',social_links:{website:'https://example.com'}};const db=dbMock(sql=>sql.includes('INSERT INTO frieren_account_profiles')?{rows:[row],rowCount:1}:{rows:[],rowCount:0});const result=await updateAccountProfile(db,{accountId:a,bio:row.bio,statusText:row.status_text,interests:row.interests,tags:row.tags,theme:'violet',accentColor:'#aabbcc',socialLinks:{website:'https://example.com'},visibility:'public',showActivity:true,allowVisitors:true});assert.equal(result.account_id,a);assert.ok(db.calls.at(-1).params.includes(a));await assert.rejects(()=>updateAccountProfile(db,{accountId:a,socialLinks:{website:'javascript:alert(1)'}}),/ACCOUNT_PROFILE_LINKS_INVALID/);});
test('private account profiles are hidden from non-followers but visible to their owner',async()=>{const profile={account_id:a,bio:'secret',visibility:'private',theme:'midnight',allow_visitors:true};const db=dbMock((sql)=>sql.includes('SELECT * FROM frieren_account_profiles')?{rows:[profile],rowCount:1}:sql.includes('SELECT 1 FROM frieren_account_follows')?{rows:[],rowCount:0}:sql.includes('AS followers')?{rows:[{followers:0,following:0}],rowCount:1}:{rows:[],rowCount:0});const guest=await getAccountProfile(db,a,{viewerAccountId:b});assert.equal(guest.canView,false);const owner=await getAccountProfile(db,a,{viewerAccountId:a});assert.equal(owner.canView,true);});
test('self-follow and self-visit are rejected without changing relationships',async()=>{const db=dbMock();await assert.rejects(()=>followAccount(db,{followerAccountId:a,followedAccountId:a}),/ACCOUNT_PROFILE_SELF_FOLLOW/);assert.equal((await recordAccountProfileVisit(db,{ownerAccountId:a,visitorAccountId:a})).status,'self');});
test('unfollow is idempotent and account IDs are validated',async()=>{const db=dbMock();assert.equal((await unfollowAccount(db,{followerAccountId:a,followedAccountId:b})).status,'not_following');await assert.rejects(()=>getAccountProfile(db,'not-an-account'),/ACCOUNT_PROFILE_ID_INVALID/);});

test('account friend requests are global and can be accepted by the recipient',async()=>{
 const db=dbMock(sql=>sql.includes('SELECT allow_visitors')?{rows:[{allow_visitors:true}],rowCount:1}:sql.includes('SELECT request_id,status,requester_account_id')?{rows:[],rowCount:0}:sql.includes('INSERT INTO frieren_account_friend_requests')?{rows:[{request_id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1}:sql.includes('UPDATE frieren_account_friend_requests')?{rows:[{request_id:'123e4567-e89b-12d3-a456-426614174000',requester_account_id:a}],rowCount:1}:{rows:[],rowCount:0});
 const {sendAccountFriendRequest,respondAccountFriendRequest}=await import('../account-profile.js');
 assert.equal((await sendAccountFriendRequest(db,{requesterAccountId:a,recipientAccountId:b})).status,'sent');
 assert.equal((await respondAccountFriendRequest(db,{accountId:b,requestId:'123e4567-e89b-12d3-a456-426614174000',accept:true})).status,'accepted');
 assert.equal(db.calls.filter(x=>x.sql.includes('INSERT INTO frieren_account_notifications')).length,2,'request and acceptance notifications are both persisted');
 assert.ok(db.calls.some(x=>x.sql.includes('INSERT INTO frieren_account_notifications')&&x.params[2]==='friend_accepted'));
});

test('custom profile slugs are validated, persisted and resolved without guild context',async()=>{
 const db=dbMock(sql=>sql.includes('SELECT account_id FROM frieren_account_profiles')?{rows:[{account_id:a}],rowCount:1}:sql.includes('INSERT INTO frieren_account_profiles')?{rows:[{account_id:a,profile_slug:'soiree'}],rowCount:1}:{rows:[],rowCount:0});
 const result=await updateAccountProfile(db,{accountId:a,profileSlug:'Soiree',displayName:'Soiree'});
 assert.equal(result.profile_slug,'soiree');
 assert.equal(await getAccountIdByProfileSlug(db,'soiree'),a);
 assert.equal(await getAccountIdByProfileSlug(db,'../soiree'),null);
 await assert.rejects(()=>updateAccountProfile(db,{accountId:a,profileSlug:'bad slug'}),/ACCOUNT_PROFILE_INVALID/);
});
test('account notifications are private, bounded and only accept local destinations',async()=>{
 const db=dbMock(sql=>sql.includes('INSERT INTO frieren_account_notifications')?{rows:[{notification_id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1}:sql.includes('SELECT notification_id')?{rows:[{notification_id:'123e4567-e89b-12d3-a456-426614174000',title:'Yeni arkadaşlık isteği'}],rowCount:1}:{rows:[],rowCount:1});
 assert.equal((await createAccountNotification(db,{accountId:a,type:'friend_request',title:'Yeni arkadaşlık isteği',href:'/profil'})).status,'created');
 assert.equal((await listAccountNotifications(db,a,500)).length,1);
 assert.equal((await markAccountNotificationsRead(db,a)).status,'read');
 await assert.rejects(()=>createAccountNotification(db,{accountId:a,type:'x',title:'x',href:'https://evil.example'}),/ACCOUNT_NOTIFICATION_INVALID/);
});

test('friend list includes each account profile slug for direct profile navigation',async()=>{const db=dbMock(sql=>sql.includes('frieren_account_friend_requests fr JOIN frieren_site_accounts')?{rows:[{account_id:b,username:'Fern',profile_slug:'fern'}],rowCount:1}:{rows:[],rowCount:0});const result=await listAccountFriends(db,a);assert.equal(result.friends[0].profile_slug,'fern');const query=db.calls.find(x=>x.sql.includes('frieren_account_friend_requests fr JOIN frieren_site_accounts'));assert.ok(query);assert.match(query.sql,/ap\.profile_slug/);});
