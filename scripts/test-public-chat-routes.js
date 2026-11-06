import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handlePublicSiteRequest} from '../public-site.js';
import {createPublicSiteSession,buildPublicSiteSessionCookie} from '../owner-dashboard.js';
import {createSiteCsrfToken} from '../site-auth.js';

const secret='test-public-chat-secret-at-least-32-characters';
process.env.ADMIN_SESSION_SECRET=secret;
const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
function response(){return{status:0,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
function cookieFor(user){const token=createPublicSiteSession(secret,user,Math.floor(Date.now()/1000)+3600);return buildPublicSiteSessionCookie(token,3600).split(';')[0];}
function get(path,user){return{method:'GET',url:path,headers:user?{cookie:cookieFor(user)}:{}};}

test('public discovery page and chat history are readable without login',async()=>{
 const db={async query(sql){if(sql.startsWith('SELECT m.message_id'))return{rows:[{message_id:'m1',account_id:account.id,username:'Gezgin',body:'Merhaba',created_at:new Date().toISOString()}],rowCount:1};return{rows:[],rowCount:0};}};
 const page=response();assert.equal(await handlePublicSiteRequest(get('/kesfet'),page,{db}),true);assert.equal(page.status,200);assert.match(page.body,/Yol arkadaşlarınla sohbet et/);assert.match(page.body,/Giriş yap ve sohbete katıl/);const signedPage=response();assert.equal(await handlePublicSiteRequest(get('/kesfet',account),signedPage,{db}),true);assert.equal(signedPage.status,200);assert.match(signedPage.body,/name="replyToMessageId"/);assert.match(signedPage.body,/data-chat-reply-preview/);assert.match(signedPage.body,/data-chat-reply-clear/);
 const api=response();assert.equal(await handlePublicSiteRequest(get('/api/public-chat/messages'),api,{db}),true);assert.equal(api.status,200);assert.match(api.body,/Merhaba/);
});
test('public chat posting requires an authenticated site account and CSRF token',async()=>{
 let queries=0;const db={async query(sql){queries++;if(sql.includes('SELECT COUNT(*)'))return{rows:[{count:0}],rowCount:1};if(sql.includes('INSERT INTO frieren_public_chat_messages'))return{rows:[{message_id:'m1',body:'Merhaba'}],rowCount:1};return{rows:[],rowCount:0};}};
 const anonymous=response();const anonymousReq=Readable.from([Buffer.from('csrf=x&message=Merhaba')]);Object.assign(anonymousReq,{method:'POST',url:'/api/public-chat/messages',headers:{'content-type':'application/x-www-form-urlencoded'}});
 assert.equal(await handlePublicSiteRequest(anonymousReq,anonymous,{db}),true);assert.equal(anonymous.status,302);assert.equal(queries,0);
 const csrf=createSiteCsrfToken(secret);const form=new URLSearchParams({csrf,message:'Merhaba'}).toString();const req=Readable.from([Buffer.from(form)]);Object.assign(req,{method:'POST',url:'/api/public-chat/messages',headers:{cookie:cookieFor(account),'content-type':'application/x-www-form-urlencoded'}});
 const res=response();assert.equal(await handlePublicSiteRequest(req,res,{db}),true);assert.equal(res.status,201);assert.equal(queries,9);
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
 const accountId='site_123e4567-e89b-12d3-a456-426614174000';const db={async query(sql){if(sql.includes('SELECT user_id FROM site_discord_links'))return{rows:[],rowCount:0};if(sql.includes('SELECT 1 FROM frieren_profile_media'))return{rows:[],rowCount:0};if(sql.includes('SELECT m.message_id'))return{rows:[],rowCount:0};return{rows:[],rowCount:0};}};
 const pageRes=response();assert.equal(await handlePublicSiteRequest(get('/kesfet',{id:accountId,username:'Gezgin'}),pageRes,{db}),true);
 assert.ok(pageRes.body.indexOf('public-chat-section')>pageRes.body.toLocaleLowerCase('tr-TR').indexOf('fantastik bir'));
 assert.ok(pageRes.body.indexOf('public-chat-section')<pageRes.body.indexOf('YOL ARKADAŞLARIN'));
 assert.match(pageRes.body,/data-chat-search/);assert.match(pageRes.body,/data-chat-counter/);assert.match(pageRes.body,/chat-266-1/);
});
