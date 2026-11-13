import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handlePublicSiteRequest} from '../public-site.js';
import {createPublicSiteSession,buildPublicSiteSessionCookie} from '../owner-dashboard.js';
import {createSiteCsrfToken} from '../site-auth.js';

const secret='test-public-chat-secret-at-least-32-characters';
process.env.ADMIN_SESSION_SECRET=secret;
const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
function response(){const listeners={};return{status:0,headers:{},body:'',writableEnded:false,writeHead(status,headers={}){this.status=status;this.headers=headers;},write(body){this.body+=String(body);return true;},end(body){this.body=body;this.writableEnded=true;},on(event,callback){listeners[event]=callback;return this;},close(){listeners.close?.();}};}
function cookieFor(user){const token=createPublicSiteSession(secret,user,Math.floor(Date.now()/1000)+3600);return buildPublicSiteSessionCookie(token,3600).split(';')[0];}
function get(path,user){return{method:'GET',url:path,headers:user?{cookie:cookieFor(user)}:{}};}

test('public discovery page and chat history are readable without login',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT m.message_id'))return{rows:[{message_id:'m1',account_id:account.id,username:'Gezgin',body:'Merhaba',created_at:new Date().toISOString()}],rowCount:1};return{rows:[],rowCount:0};}};
 const page=response();assert.equal(await handlePublicSiteRequest(get('/kesfet'),page,{db}),true);assert.equal(page.status,200);assert.match(page.body,/Yol arkadaşlarınla sohbet et/);assert.match(page.body,/Giriş yap ve sohbete katıl/);const signedPage=response();assert.equal(await handlePublicSiteRequest(get('/kesfet',account),signedPage,{db}),true);assert.equal(signedPage.status,200);assert.match(signedPage.body,/name="replyToMessageId"/);assert.match(signedPage.body,/data-chat-reply-preview/);assert.match(signedPage.body,/data-chat-reply-clear/);assert.match(signedPage.body,/data-chat-media/);
 const api=response();assert.equal(await handlePublicSiteRequest(get('/api/public-chat/messages'),api,{db}),true);assert.equal(api.status,200);assert.match(api.body,/Merhaba/);
});
test('public chat posting requires an authenticated site account and CSRF token',async()=>{
 let queries=0;const db={async query(sql){queries++;if(sql.includes('SELECT COUNT(*)'))return{rows:[{count:0}],rowCount:1};if(sql.includes('INSERT INTO frieren_public_chat_messages'))return{rows:[{message_id:'m1',body:'Merhaba'}],rowCount:1};return{rows:[],rowCount:0};}};
 const anonymous=response();const anonymousReq=Readable.from([Buffer.from('csrf=x&message=Merhaba')]);Object.assign(anonymousReq,{method:'POST',url:'/api/public-chat/messages',headers:{'content-type':'application/x-www-form-urlencoded'}});
 assert.equal(await handlePublicSiteRequest(anonymousReq,anonymous,{db}),true);assert.equal(anonymous.status,302);assert.equal(queries,0);
 const csrf=createSiteCsrfToken(secret);const form=new URLSearchParams({csrf,message:'Merhaba'}).toString();const req=Readable.from([Buffer.from(form)]);Object.assign(req,{method:'POST',url:'/api/public-chat/messages',headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
 const res=response();assert.equal(await handlePublicSiteRequest(req,res,{db}),true);assert.equal(res.status,201);assert.ok(queries>0);
});

test('public chat reactions and blocking mutations require a signed-in account and CSRF',async()=>{
 let queries=0;const db={async query(){queries++;return{rows:[],rowCount:0};}};
 for(const path of ['/api/public-chat/reactions','/api/public-chat/blocks','/api/public-chat/blocks/unblock']){
  const anonymous=Readable.from([Buffer.from('csrf=bad')]);Object.assign(anonymous,{method:'POST',url:path,headers:{'content-type':'application/x-www-form-urlencoded'}});
  const denied=response();await handlePublicSiteRequest(anonymous,denied,{db});assert.equal(denied.status,302,path);
  const authenticated=Readable.from([Buffer.from('csrf=bad&messageId=123e4567-e89b-12d3-a456-426614174000')]);Object.assign(authenticated,{method:'POST',url:path,headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
  const csrfDenied=response();await handlePublicSiteRequest(authenticated,csrfDenied,{db});assert.equal(csrfDenied.status,403,path);
 }
 assert.equal(queries,0);
});

test('homepage chat is inserted immediately after the hero and includes Frieren search and composer affordances',async()=>{
 const accountId='site_123e4567-e89b-12d3-a456-426614174000';const db={async query(sql){if(sql.includes('SELECT user_id FROM site_discord_links'))return{rows:[],rowCount:0};if(sql.includes('SELECT 1 FROM site_discord_links WHERE account_id=$1 AND user_id=$2'))return{rows:[{'?column?':1}],rowCount:1};if(sql.includes('SELECT 1 FROM frieren_profile_media'))return{rows:[],rowCount:0};if(sql.includes('SELECT m.message_id'))return{rows:[],rowCount:0};return{rows:[],rowCount:0};}};
 const pageRes=response();assert.equal(await handlePublicSiteRequest(get('/kesfet',{id:accountId,username:'Gezgin'}),pageRes,{db}),true);
 assert.ok(pageRes.body.indexOf('public-chat-section')>pageRes.body.toLocaleLowerCase('tr-TR').indexOf('fantastik bir'));
 assert.ok(pageRes.body.indexOf('public-chat-section')<pageRes.body.indexOf('YOL ARKADAŞLARIN'));
 assert.match(pageRes.body,/data-chat-search/);assert.match(pageRes.body,/data-site-dm/);assert.match(pageRes.body,/Arkadaş seç/);assert.match(pageRes.body,/data-site-dm-group/);assert.match(pageRes.body,/data-site-dm-profile/,'direct message view must expose the selected friend profile link');assert.match(pageRes.body,/Grup sohbetleri/);assert.match(pageRes.body,/data-site-dm-tab/);assert.match(pageRes.body,/data-chat-new-messages/);assert.match(pageRes.body,/data-chat-counter/);assert.match(pageRes.body,/chat-277-1/);assert.match(pageRes.body,/data-chat-owner="true"/);assert.match(pageRes.body,/data-chat-reports-refresh/);
 assert.equal((pageRes.body.match(/id="topluluk-sohbeti"/g)||[]).length,1,'community chat section must expose exactly one unique anchor id');
});

test('chat delete, pin and pause endpoints reject non-owner even with a valid session and CSRF',async()=>{
 const paths=['/api/public-chat/pins','/api/public-chat/control','/api/public-chat/reports/review'];const db={async query(sql){if(sql.includes('FROM site_discord_links'))return{rows:[],rowCount:0};throw new Error('database must not be reached for non-owner moderation');}};
 const previous=process.env.FRIEREN_OWNER_ACCOUNT_IDS;delete process.env.FRIEREN_OWNER_ACCOUNT_IDS;
 try{for(const path of paths){const form=new URLSearchParams({csrf:createSiteCsrfToken(secret),messageId:'123e4567-e89b-12d3-a456-426614174000',paused:'true'});const req=Readable.from([Buffer.from(form.toString())]);Object.assign(req,{method:'POST',url:path,headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});const res=response();assert.equal(await handlePublicSiteRequest(req,res,{db}),true);assert.equal(res.status,403,path);assert.match(res.body,/owner_only/);}}
 finally{if(previous===undefined)delete process.env.FRIEREN_OWNER_ACCOUNT_IDS;else process.env.FRIEREN_OWNER_ACCOUNT_IDS=previous;}
});
test('public chat members can delete their own messages through the signed-in CSRF route',async()=>{
 const seen=[];const db={async query(sql,params){seen.push({sql,params});if(sql.startsWith('UPDATE frieren_public_chat_messages SET body='))return{rows:[{message_id:params[0]}],rowCount:1};return{rows:[],rowCount:0};}};
 const form=new URLSearchParams({csrf:createSiteCsrfToken(secret),messageId:'123e4567-e89b-12d3-a456-426614174000'});
 const req=Readable.from([Buffer.from(form.toString())]);Object.assign(req,{method:'POST',url:'/api/public-chat/messages/delete',headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
 const res=response();await handlePublicSiteRequest(req,res,{db});assert.equal(res.status,200);assert.match(res.body,/"status":"deleted"/);const deletion=seen.find(item=>item.sql.startsWith('UPDATE frieren_public_chat_messages SET body='));assert.ok(deletion?.sql.includes('account_id=$2'));assert.equal(deletion.params[1],account.id);
});
test('configured site owner can pin and pause chat through CSRF-protected endpoints',async()=>{
 const previous=process.env.FRIEREN_OWNER_ACCOUNT_IDS;process.env.FRIEREN_OWNER_ACCOUNT_IDS='123e4567-e89b-12d3-a456-426614174000';const seen=[];
 const db={async query(sql){seen.push(sql);if(sql.startsWith('UPDATE frieren_public_chat_messages'))return{rows:[{pinned_at:new Date()}],rowCount:1};if(sql.startsWith('UPDATE frieren_public_chat_control'))return{rows:[{is_paused:true,updated_at:new Date()}],rowCount:1};if(sql.startsWith('UPDATE frieren_public_chat_reports'))return{rows:[{report_id:'123e4567-e89b-12d3-a456-426614174000',status:'reviewed'}],rowCount:1};return{rows:[],rowCount:0};}};
 try{for(const [path,expected] of [['/api/public-chat/pins','pinned'],['/api/public-chat/control','updated'],['/api/public-chat/reports/review','reviewed']]){const form=new URLSearchParams({csrf:createSiteCsrfToken(secret),messageId:'123e4567-e89b-12d3-a456-426614174000',reportId:'123e4567-e89b-12d3-a456-426614174000',status:'reviewed',paused:'true'});const req=Readable.from([Buffer.from(form.toString())]);Object.assign(req,{method:'POST',url:path,headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});const res=response();await handlePublicSiteRequest(req,res,{db});assert.equal(res.status,200,path);assert.match(res.body,new RegExp(expected));}}
 finally{if(previous===undefined)delete process.env.FRIEREN_OWNER_ACCOUNT_IDS;else process.env.FRIEREN_OWNER_ACCOUNT_IDS=previous;}
});

test('Discord-linked bot owner can pin and pause chat without an environment account allowlist',async()=>{
 const previous=process.env.FRIEREN_OWNER_ACCOUNT_IDS;delete process.env.FRIEREN_OWNER_ACCOUNT_IDS;
 const seen=[];
 const db={async query(sql,params){seen.push({sql,params});if(sql.includes('FROM site_discord_links'))return{rows:[{ '?column?':1 }],rowCount:1};if(sql.startsWith('UPDATE frieren_public_chat_messages'))return{rows:[{pinned_at:new Date()}],rowCount:1};if(sql.startsWith('UPDATE frieren_public_chat_control'))return{rows:[{is_paused:true,updated_at:new Date()}],rowCount:1};return{rows:[],rowCount:0};}};
 try{
  for(const [path,expected] of [['/api/public-chat/pins','pinned'],['/api/public-chat/control','updated']]){
   const form=new URLSearchParams({csrf:createSiteCsrfToken(secret),messageId:'123e4567-e89b-12d3-a456-426614174000',paused:'true'});
   const req=Readable.from([Buffer.from(form.toString())]);Object.assign(req,{method:'POST',url:path,headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
   const res=response();await handlePublicSiteRequest(req,res,{db});assert.equal(res.status,200,path);assert.match(res.body,new RegExp(expected));
  }
  assert.equal(seen.filter(x=>x.sql.includes('FROM site_discord_links')&&x.params?.[1]==='1553794496234262641').length,2);
 }finally{if(previous===undefined)delete process.env.FRIEREN_OWNER_ACCOUNT_IDS;else process.env.FRIEREN_OWNER_ACCOUNT_IDS=previous;}
});


test('site direct-message history is authenticated, friend-scoped and does not mutate on GET',async()=>{
 const other='site_123e4567-e89b-12d3-a456-426614174001';const seen=[];
 const db={async query(sql,params){seen.push({sql,params});
  if(sql.includes('SELECT 1 FROM frieren_account_friend_requests'))return{rows:[{}],rowCount:1};
  if(sql.includes('SELECT 1 FROM frieren_public_chat_blocks'))return{rows:[],rowCount:0};
  if(sql.startsWith('SELECT message_id,sender_account_id'))return{rows:[{message_id:'123e4567-e89b-12d3-a456-426614174002',sender_account_id:other,recipient_account_id:account.id,body:'Gizli selam',created_at:new Date().toISOString(),read_at:null,is_own:false}],rowCount:1};
  return{rows:[],rowCount:0};
 }};
 const anonymous=response();await handlePublicSiteRequest(get('/api/site-dm/messages?with='+other),anonymous,{db});assert.equal(anonymous.status,302);
 const res=response();await handlePublicSiteRequest(get('/api/site-dm/messages?with='+other,account),res,{db});assert.equal(res.status,200);assert.match(res.body,/Gizli selam/);assert.ok(!seen.some(x=>x.sql.startsWith('UPDATE frieren_site_direct_messages')),'GET must not mutate read receipts');
 const invalid=response();await handlePublicSiteRequest(get('/api/site-dm/messages?with=bad',account),invalid,{db});assert.equal(invalid.status,400);
});
test('site direct-message sends require CSRF and an accepted unblocked friendship',async()=>{
 const other='site_123e4567-e89b-12d3-a456-426614174001';let inserted=0;
 const db={async query(sql,params){
  if(sql.includes('SELECT 1 FROM frieren_account_friend_requests'))return{rows:[{}],rowCount:1};
  if(sql.includes('SELECT 1 FROM frieren_public_chat_blocks'))return{rows:[],rowCount:0};
  if(sql.includes('SELECT COUNT(*)::int AS count FROM frieren_site_direct_messages WHERE sender_account_id'))return{rows:[{count:0}],rowCount:1};
  if(sql.startsWith('INSERT INTO frieren_site_direct_messages')){inserted++;return{rows:[],rowCount:1};}
  return{rows:[],rowCount:0};
 }};
 const bad=Readable.from([Buffer.from('csrf=bad&recipientAccountId='+other+'&message=Merhaba')]);Object.assign(bad,{method:'POST',url:'/api/site-dm/messages',headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
 const denied=response();await handlePublicSiteRequest(bad,denied,{db});assert.equal(denied.status,403);assert.equal(inserted,0);
 const form=new URLSearchParams({csrf:createSiteCsrfToken(secret),recipientAccountId:other,message:'Merhaba'});
 const req=Readable.from([Buffer.from(form.toString())]);Object.assign(req,{method:'POST',url:'/api/site-dm/messages',headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
 const res=response();await handlePublicSiteRequest(req,res,{db});assert.equal(res.status,201);assert.match(res.body,/"status":"sent"/);assert.equal(inserted,1);
});


test('site group chat endpoints reject anonymous access and CSRF-less writes',async()=>{
 const paths=['/api/site-dm/groups','/api/site-dm/group-messages','/api/site-dm/group-read','/api/site-dm/group-leave'];
 const db={async query(){throw new Error('unauthenticated and CSRF-invalid requests must not reach the database');}};
 for(const path of paths){
  const anonymous=Readable.from([Buffer.from('csrf=bad')]);Object.assign(anonymous,{method:'POST',url:path,headers:{'content-type':'application/x-www-form-urlencoded'}});
  const denied=response();await handlePublicSiteRequest(anonymous,denied,{db});assert.equal(denied.status,302,path);
  const authenticated=Readable.from([Buffer.from('csrf=bad')]);Object.assign(authenticated,{method:'POST',url:path,headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
  const csrfDenied=response();await handlePublicSiteRequest(authenticated,csrfDenied,{db});assert.equal(csrfDenied.status,403,path);
 }
});

test('chat event stream requires an authenticated account and releases its listener on close',async()=>{
 const anonymous=response();assert.equal(await handlePublicSiteRequest(get('/api/chat-events'),anonymous,{db:{query:async()=>({rows:[],rowCount:0})}}),true);assert.equal(anonymous.status,302);
 const stream=response();assert.equal(await handlePublicSiteRequest(get('/api/chat-events',account),stream,{db:{query:async()=>({rows:[],rowCount:0})}}),true);
 assert.equal(stream.status,200);assert.match(stream.headers['Content-Type'],/text\/event-stream/);assert.match(stream.body,/retry: 3000/);stream.close();
});

test('chat media upload requires a signed-in account and valid CSRF before checking storage setup',async()=>{
 const keys=['CHAT_MEDIA_R2_ACCOUNT_ID','CHAT_MEDIA_R2_BUCKET','CHAT_MEDIA_R2_ACCESS_KEY_ID','CHAT_MEDIA_R2_SECRET_ACCESS_KEY'];const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];
 try{
 const anonymous=response();const anonReq=Readable.from([Buffer.from([0xff,0xd8,0xff])]);Object.assign(anonReq,{method:'POST',url:'/api/chat-media/upload',headers:{'content-type':'image/jpeg','x-chat-scope':'public'}});
 await handlePublicSiteRequest(anonReq,anonymous,{db:{query:async()=>({rows:[],rowCount:0})}});assert.equal(anonymous.status,302);
 const req=Readable.from([Buffer.from([0xff,0xd8,0xff])]);Object.assign(req,{method:'POST',url:'/api/chat-media/upload',headers:{cookie:cookieFor(account),'content-type':'image/jpeg','x-csrf-token':createSiteCsrfToken(secret),'x-chat-scope':'public','x-chat-target':'public'}});
 const res=response();await handlePublicSiteRequest(req,res,{db:{query:async()=>({rows:[],rowCount:0})}});
 assert.equal(res.status,503);assert.match(res.body,/media_storage_not_configured/);
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
