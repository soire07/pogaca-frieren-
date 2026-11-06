import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handlePublicSiteRequest} from '../public-site.js';
import {createPublicSiteSession,buildPublicSiteSessionCookie} from '../owner-dashboard.js';
import {createSiteCsrfToken} from '../site-auth.js';

const secret='test-personal-center-secret-at-least-32-characters';
process.env.ADMIN_SESSION_SECRET=secret;
const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',xp:2400};
function res(){return{status:0,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
function cookie(){const token=createPublicSiteSession(secret,account,Math.floor(Date.now()/1000)+3600);return buildPublicSiteSessionCookie(token,3600).split(';')[0];}
function get(path){return{method:'GET',url:path,headers:{cookie:cookie()}};}
function post(path,fields){const req=Readable.from([Buffer.from(new URLSearchParams(fields).toString())]);Object.assign(req,{method:'POST',url:path,headers:{cookie:cookie(),'content-type':'application/x-www-form-urlencoded'}});return req;}

test('personal center route renders profile, messaging, planner, discovery and reports from linked guild character',async()=>{
 const db={async query(sql){
  if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};
  if(sql.includes('SELECT bio,status_text,theme'))return{rows:[{bio:'Büyü araştırmacısı',status_text:'Yolculukta',theme:'violet',guestbook_enabled:true}],rowCount:1};
  if(sql.includes('SELECT DISTINCT ON (other_id)'))return{rows:[],rowCount:0};
  if(sql.includes('FROM player_planner_entries WHERE'))return{rows:[],rowCount:0};
  if(sql.includes('FROM player_guestbook_entries e WHERE'))return{rows:[],rowCount:0};
  if(sql.includes('FROM adventure_history WHERE'))return{rows:[{adventures:2,xp:300,boss_events:1,achievements:1,completed_tasks:0}],rowCount:1};
  if(sql.includes('FROM users u WHERE u.guild_id'))return{rows:[],rowCount:0};
  if(sql.includes('FROM social_relationships mine'))return{rows:[],rowCount:0};
  if(sql.includes('FROM player_close_friends f'))return{rows:[],rowCount:0};
  if(sql.includes('FROM social_relationships WHERE guild_id'))return{rows:[],rowCount:0};
  return{rows:[],rowCount:0};
 }};
 const response=res();assert.equal(await handlePublicSiteRequest(get('/maceraci/merkez?guildId='+profile.guild_id),response,{db}),true);
 assert.equal(response.status,200);assert.match(response.body,/Kişisel yaşamın ve sosyal alanın/);assert.match(response.body,/Özel mesajlar/);assert.match(response.body,/Kişisel ajanda/);assert.match(response.body,/Oyuncu keşfi ve öneriler/);assert.match(response.body,/Yakın arkadaşlarım/);assert.match(response.body,/İlerleme raporların/);
});
test('personal center writes require CSRF and a linked character in the selected guild',async()=>{
 let writes=0;
 const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};if(sql.includes('INSERT INTO player_personal_profiles')){writes++;return{rows:[{bio:'Merhaba'}],rowCount:1};}return{rows:[],rowCount:0};}};
 const bad=res();await handlePublicSiteRequest(post('/maceraci/merkez',{guildId:profile.guild_id,action:'profile-save',bio:'Merhaba',statusText:'',theme:'midnight',guestbookEnabled:'true',csrf:'bad'}),bad,{db});assert.equal(bad.status,403);assert.equal(writes,0);
 const csrf=createSiteCsrfToken(secret);const good=res();await handlePublicSiteRequest(post('/maceraci/merkez',{guildId:profile.guild_id,action:'profile-save',bio:'Merhaba',statusText:'',theme:'midnight',guestbookEnabled:'true',csrf}),good,{db});assert.equal(good.status,303);assert.equal(writes,1);assert.match(good.headers.Location,/profile-save_ok/);
});
test('personal center rejects a guild without a linked character before mutations',async()=>{
 let writes=0;const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[],rowCount:0};writes++;return{rows:[],rowCount:0};}};
 const csrf=createSiteCsrfToken(secret);const response=res();await handlePublicSiteRequest(post('/maceraci/merkez',{guildId:profile.guild_id,action:'profile-save',bio:'X',theme:'midnight',guestbookEnabled:'true',csrf}),response,{db});
 assert.equal(response.status,403);assert.equal(writes,0);
});

test('public player profiles require public home visibility and respect hidden statistics',async()=>{
 const target={user_id:profile.user_id,character_name:'Fern',level:20,xp:2400,boss_defeats:4,dungeon_wins:3,active_room:'starter',layout:[]};
 const db={async query(sql){
  if(sql.includes('SELECT u.user_id,u.character_name,u.class_name'))return{rows:[target],rowCount:1};
  if(sql.includes('SELECT show_stats,show_achievements'))return{rows:[{show_stats:false,show_achievements:false,show_collections:false,show_activity:false,show_cosmetics:false}],rowCount:1};
  if(sql.includes('SELECT bio,status_text,theme'))return{rows:[{bio:'Araştırmacı',status_text:'Yolculukta',guestbook_enabled:true}],rowCount:1};
  if(sql.includes('FROM player_guestbook_entries e WHERE'))return{rows:[],rowCount:0};
  return{rows:[],rowCount:0};
 }};
 const response=res();assert.equal(await handlePublicSiteRequest({method:'GET',url:'/maceraci/oyuncu?guildId='+profile.guild_id+'&userId='+profile.user_id,headers:{}},response,{db}),true);
 assert.equal(response.status,200);assert.match(response.body,/AÇIK OYUNCU PROFİLİ/);assert.match(response.body,/istatistiklerini gizli tutuyor/);assert.doesNotMatch(response.body,/action="\/maceraci\/oyuncu\/ziyaretci-defteri"/);
});
