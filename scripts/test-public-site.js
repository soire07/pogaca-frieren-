import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePublicSiteRequest } from '../public-site.js';
import { createPublicSiteSession, buildPublicSiteSessionCookie } from '../owner-dashboard.js';
import { createSiteCsrfToken } from '../site-auth.js';

const secret = 'test-public-site-session-secret-at-least-32-characters';
process.env.ADMIN_SESSION_SECRET = secret;
const visitor = { id: '123456789012345678', username: 'Gezgin', avatar: null };
function res() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
}
function request(path = '/', user = visitor) {
  const token = createPublicSiteSession(secret, user, Math.floor(Date.now() / 1000) + 3600);
  const cookie = buildPublicSiteSessionCookie(token, 3600).split(';')[0];
  return { method: 'GET', url: path, headers: { cookie } };
}

test('account-only player routes reject legacy Discord sessions before querying account data', async () => {
  const routes=['/maceraci','/maceraci/yasam','/maceraci/atolye','/maceraci/bildirimler','/maceraci/envanter','/maceraci/koleksiyon','/maceraci/sosyal','/pazar','/destek'];
  for(const route of routes){
    let queries=0;
    const response=res();
    const db={async query(){queries++;throw new Error('invalid account session must not query the database');}};
    assert.equal(await handlePublicSiteRequest(request(route,visitor),response,{db}),true,route);
    assert.equal(response.status,302,route);
    assert.equal(response.headers.Location,'/login?status=site_account_required',route);
    assert.equal(queries,0,route);
  }
});

test('public command catalog includes the new guild mini-game command', async () => {
  const response = res();
  const client = { guilds: { cache: { size: 1 } }, commands: { size: 1 }, isReady: () => true };
  await handlePublicSiteRequest(request('/pogaca'), response, { client });
  assert.ok(response.body.includes('/loncaoyun'));
});


test('support center is account-scoped and exposes data export and deletion controls',async()=>{
 const accountId='site_123e4567-e89b-12d3-a456-426614174000';
 const db={async query(sql,params){
  if(sql.includes('FROM frieren_support_tickets'))return{rows:[{ticket_id:'ticket-1',category:'bug',subject:'OAuth issue',status:'open',created_at:new Date().toISOString()}],rowCount:1};
  throw new Error('Unexpected support query: '+sql);
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest(request('/destek',{id:accountId,username:'Gezgin'}),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Destek ve Hesap Merkezi/);
 assert.match(response.body,/OAuth issue/);
 assert.match(response.body,/Verilerimi dışa aktar/);
 assert.match(response.body,/Portal hesabını sil/);
});

test('account data export is authenticated and delivered as a no-store JSON attachment',async()=>{
 const accountId='site_123e4567-e89b-12d3-a456-426614174000';
 const db={async query(sql){
  if(sql.includes('FROM frieren_site_accounts'))return{rows:[{id:accountId.slice(5),username:'Gezgin',email:'member@example.com'}],rowCount:1};
  if(sql.includes('FROM site_discord_links'))return{rows:[],rowCount:0};
  if(sql.includes('FROM frieren_support_tickets'))return{rows:[],rowCount:0};
  if(sql.includes('FROM pg_constraint relation'))return{rows:[],rowCount:0};
  if(sql.includes("column_name='account_id'"))return{rows:[],rowCount:0};
  throw new Error('Unexpected export query: '+sql);
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest(request('/hesap/veri',{id:accountId,username:'Gezgin'}),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.headers['Content-Disposition'],/frieren-account-data\.json/);
 assert.equal(response.headers['Cache-Control'],'no-store');
 assert.equal(JSON.parse(response.body).account.username,'Gezgin');
});


test('notification preferences are account and guild scoped and expose the news bird controls',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:20,xp:2400,coins:500,hp:100,max_hp:100,mana:80,max_mana:100};
 const db={async query(sql){
  if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};
  if(sql.includes('FROM frieren_notification_preferences'))return{rows:[{category:'anime_news',enabled:true}],rowCount:1};
  throw new Error('Unexpected notification query: '+sql);
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest(request('/maceraci/bildirimler?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Haberci kuş/);
 assert.match(response.body,/Boss \/ Raid hatırlatmaları/);
 assert.match(response.body,/action="\/maceraci\/bildirimler"/);
});

test('notification preference updates require CSRF and persist the selected category',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
 let inserted=false;
 const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};if(sql.includes('INSERT INTO frieren_notification_preferences')){inserted=true;return{rows:[],rowCount:1};}throw new Error('Unexpected preference update query: '+sql);}};
 const response=res();
 const post=sitePost('/maceraci/bildirimler',{csrf:createSiteCsrfToken(secret),guildId:profile.guild_id,category:'anime_news',enabled:'true'});
 assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
 assert.equal(response.status,303);
 assert.match(response.headers.Location,/status=saved/);
 assert.equal(inserted,true);
});


test('guild workshop is permission-gated and renders embed, custom spell and automation builders',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:20};
 const db={async query(sql){
  if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};
  if(sql.includes('FROM guild_embed_templates'))return{rows:[],rowCount:0};
  if(sql.includes('FROM guild_custom_commands'))return{rows:[],rowCount:0};
  if(sql.includes('FROM guild_spell_automations'))return{rows:[],rowCount:0};
  throw new Error('Unexpected workshop query: '+sql);
 }};
 const client={guilds:{cache:{get:()=>({ownerId:profile.user_id})}}};
 const response=res();
 assert.equal(await handlePublicSiteRequest(request('/maceraci/atolye?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db,client}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Görsel Embed Tasarımcısı/);assert.match(response.body,/embed-live-preview/);assert.match(response.body,/embed-preview-description/);assert.match(response.body,/Önizleme yalnızca tarayıcında çalışır/);assert.match(response.body,/src=\"\/assets\/embed-preview.js\"/);assert.doesNotMatch(response.body,/<script>\s*\(\(\)=>/);assert.match(response.headers['Content-Security-Policy'],/script-src 'self'/);
 assert.match(response.body,/Özel Komut \/ Büyü Oluşturucu/);
 assert.match(response.body,/Büyü Otomasyonu Oluşturucu/);
});

test('guild workshop embed saves require the linked Discord guild owner',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
 let saved=false;
 const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};if(sql.includes('INSERT INTO guild_embed_templates')){saved=true;return{rows:[{template_id:'template-1'}],rowCount:1};}throw new Error('Unexpected workshop save query: '+sql);}};
 const client={guilds:{cache:{get:()=>({ownerId:profile.user_id})}}};
 const response=res();
 const post=sitePost('/maceraci/atolye',{csrf:createSiteCsrfToken(secret),guildId:profile.guild_id,action:'embed',name:'Raid',title:'Boss Raid',description:'The party is ready.',color:'#9b8cff',footer:'Frieren'});
 assert.equal(await handlePublicSiteRequest(post,response,{db,client}),true);
 assert.equal(response.status,303);
 assert.match(response.headers.Location,/saved_embed/);
 assert.equal(saved,true);
});

test('anonymous visitors must authenticate before viewing the homepage', async () => {
  const response = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/', headers: {} }, response), true);
  assert.equal(response.status, 302);
  assert.equal(response.headers.Location, '/login');
});

test('authenticated homepage includes the member identity, profile and GIF gallery', async () => {
  const response = res();
  const client = { guilds: { cache: { size: 3 } }, commands: { size: 68 }, isReady: () => true };
  assert.equal(await handlePublicSiteRequest(request('/kesfet', visitor), response, { client }), true);
  assert.equal(response.status, 200);
  assert.match(response.body, /Bin yıllık/);
  assert.match(response.body, /Gezgin/);
  assert.match(response.body, /class="profile-banner profile-banner-art"/);
  assert.doesNotMatch(response.body, /site-banner\.webp/);
  assert.doesNotMatch(response.body, /class="wrap home-banner"/);
  assert.match(response.body, /class="skip-link" href="#main-content"/);
  assert.match(response.body, /<main id="main-content"/);
  assert.match(response.body, /aria-label="Ana gezinme"/);
  assert.match(response.body, /gif-gallery/);
  assert.match(response.body, /href="\/assets\/site\.css"/);
  assert.match(response.body, /profile-avatar/);
  assert.equal((response.body.match(/loading="lazy"/g) || []).length, 17);
  assert.equal((response.body.match(/class="gif-item"/g) || []).length, 16);
  assert.match(response.body, /68/);
});


test('authenticated homepage is the account-scoped player dashboard', async () => {
  const profile = { guild_id:'1539562273197260860', user_id:'123456789012345678', character_name:'Fern', class_name:'Büyücü', level:12, xp:1440, coins:900, hp:80, max_hp:100, mana:65, max_mana:100, season_name:'Sezon 2026', rating:1180, wins:4, losses:2, matches:6 };
  const event = { event_id:'event-home', guild_id:profile.guild_id, title:'Zindan Gecesi', description:'Topluluk etkinliği', event_type:'community', starts_at:new Date(Date.now()+3600000).toISOString(), ends_at:new Date(Date.now()+7200000).toISOString(), max_participants:12, participants:5 };
  const accountId = 'site_123e4567-e89b-12d3-a456-426614174000';
  const queries = [];
  const db = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('FROM site_discord_links l JOIN users u')) return { rows:[profile], rowCount:1 };
    if (sql.includes('FROM guild_events e LEFT JOIN guild_event_participants')) return { rows:[event], rowCount:1 };
    throw new Error('Unexpected query: ' + sql);
  }};
  const response = res();
  assert.equal(await handlePublicSiteRequest(request('/', { id:accountId, username:'Gezgin' }), response, { db }), true);
  assert.equal(response.status, 200);
  assert.match(response.body, /Maceracı Paneli/);
  assert.match(response.body, /Fern/);
  assert.match(response.body, /1180/);
  assert.match(response.body, /Zindan Gecesi/);
  assert.ok(response.body.includes('action="/maceraci/link"'));
  assert.equal(queries.length, 2);
  assert.equal(queries[0].params[0], accountId.replace(/^site_/, ''));
});

test('player collection page is scoped to the linked guild and shows existing game collections', async () => {
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:12,xp:1440,coins:900,hp:80,max_hp:100,mana:65,max_mana:100};
  const accountId='site_123e4567-e89b-12d3-a456-426614174000';
  const db={async query(sql){
    if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};
    if(sql.includes('FROM inventory i'))return{rows:[],rowCount:0};
    if(sql.includes('FROM user_companions'))return{rows:[{companion_key:'moon_owl',cosmetic_key:'default',xp:300,level:3,happiness:80,energy:90,hunger:10}]};
    if(sql.includes('FROM user_fish_collection'))return{rows:[{fish_key:'silver_trout',quantity:2}]};
    if(sql.includes('FROM user_farm_plots'))return{rows:[{seed_key:'winter_berry',harvest_at:new Date(Date.now()-1000).toISOString(),ready:true}]};
    if(sql.includes('FROM user_creature_collection'))return{rows:[{creature_key:'mana_slime',quantity:1}]};
    if(sql.includes('FROM user_creature_wishlist'))return{rows:[{creature_key:'frost_hare'}]};
    if(sql.includes('FROM user_character_wishlist'))return{rows:[{character_name:'Frieren',created_at:new Date().toISOString()}]};
    if(sql.includes('FROM anime_character_card_variants'))return{rows:[{character_name:'Frieren',series_name:'Frieren Series',variant_key:'mage_exam',quantity:1}]};
    throw new Error('Unexpected collection query: '+sql);
  }};
  const response=res();
  assert.equal(await handlePublicSiteRequest(request('/maceraci/koleksiyon?guildId='+profile.guild_id,{id:accountId,username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,200);
  for(const expected of ['Fern','Ay Baykuşu','Gümüş Alabalık','Kuzey Meyvesi','Mana Slime','Buz Tavşanı','Frieren','Seviye 3','Anime Kart Serileri ve Varyantlar','Büyü Sınavı Baskısı'])assert.ok(response.body.includes(expected),expected);
});
test('player collection page rejects guilds not linked to the signed-in site account', async () => {
  const accountId='site_123e4567-e89b-12d3-a456-426614174000';
  const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[],rowCount:0};throw new Error('Collection queries must not run for an unlinked guild');}};
  const response=res();
  assert.equal(await handlePublicSiteRequest(request('/maceraci/koleksiyon?guildId=1539562273197260860',{id:accountId,username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,403);
});
test('player homepage fails closed when its database is unavailable for a valid site account', async () => {
  const response = res();
  const siteAccount = { id: 'site_123e4567-e89b-12d3-a456-426614174000', username: 'Gezgin' };
  assert.equal(await handlePublicSiteRequest(request('/', siteAccount), response, {}), true);
  assert.equal(response.status, 503);
  assert.match(response.body, /veritabanına/);
});

test('all public pages require a valid Discord session', async () => {
  for (const path of ['/pogaca', '/frieren-ai', '/assets/frieren.gif']) {
    const anonymous = res();
    await handlePublicSiteRequest({ method: 'GET', url: path, headers: {} }, anonymous);
    assert.equal(anonymous.status, 302, path);
    const authenticated = res();
    const handled = await handlePublicSiteRequest(request(path), authenticated);
    assert.equal(handled, true, path);
    if (!path.startsWith('/assets/')) assert.equal(authenticated.status, 200, path);
  }
});

test('Poğaça page describes verified starter commands and includes a bot invite when configured', async () => {
  const previous = process.env.CLIENT_ID;
  process.env.CLIENT_ID = '123456789012345678';
  try {
    const response = res();
    await handlePublicSiteRequest(request('/pogaca'), response);
    assert.match(response.body, /\/karakter/);
    assert.match(response.body, /\/bakiye/);
    assert.match(response.body, /\/zindan/);
    assert.match(response.body, /discord.com\/oauth2\/authorize/);
  } finally {
    if (previous === undefined) delete process.env.CLIENT_ID;
    else process.env.CLIENT_ID = previous;
  }
});

test('owner link is only rendered for the configured bot owner', async () => {
  const owner = res();
  const ownerUser = { id: '1553794496234262641', username: 'Owner', avatar: null };
  await handlePublicSiteRequest(request('/kesfet', ownerUser), owner);
  assert.match(owner.body, /href="\/owner"/);
  const visitorResponse = res();
  await handlePublicSiteRequest(request('/kesfet', visitor), visitorResponse);
  assert.doesNotMatch(visitorResponse.body, /href="\/owner"/);
});

test('logout clears the shared member session cookie', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/logout', headers: {} }, response);
  assert.equal(response.status, 302);
  assert.match(response.headers['Set-Cookie'], /frieren_site_session=/);
  assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
});

test('unknown routes and non-GET requests are not intercepted', async () => {
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/unknown', headers: {} }, res()), false);
  assert.equal(await handlePublicSiteRequest({ method: 'POST', url: '/', headers: {} }, res()), false);
});



test('registration and login pages expose username and password forms', async () => {
  const registration = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/register', headers: {} }, registration, { db: { query: async () => ({ rows: [], rowCount: 0 }) } }), true);
  assert.equal(registration.status, 200);
  assert.match(registration.body, /name="username"/);
  assert.match(registration.body, /name="email"/);
  assert.match(registration.body, /name="confirmPassword"/);
  assert.match(registration.body, /action="\/register"/);
  const login = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/login', headers: {} }, login, { db: { query: async () => ({ rows: [], rowCount: 0 }) } }), true);
  assert.equal(login.status, 200);
  assert.match(login.body, /name="username"/);
  assert.match(login.body, /name="password"/);
  assert.match(login.body, /href="\/forgot-password"/);
  assert.match(login.body, /action="\/login"/);
});

test('homepage uses the brand avatar and a lightweight custom profile header instead of the rejected banner', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/kesfet', visitor), response);
  assert.ok(response.body.includes('site-avatar.webp'));
  assert.ok(response.body.includes('profile-banner-art'));
  assert.equal(response.body.includes('site-banner.webp'), false);
  const stylesheet = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site.css', headers: {} }, stylesheet);
  assert.ok(String(stylesheet.body).includes('.profile-banner-art{display:grid'));
  assert.ok(String(stylesheet.body).includes('.hero{position:relative;isolation:isolate'));
});
test('shared stylesheet is publicly cacheable for authenticated and auth pages', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site.css', headers: {} }, response);
  assert.equal(response.status, 200);
  assert.match(response.headers['Content-Type'], /text\/css/);
  assert.match(response.headers['Cache-Control'], /public,max-age=86400/);
  assert.match(String(response.body), /@media\(max-width:560px\)/);
  assert.match(String(response.body), /\.hero-art/);
});

test('Owner Panel stylesheet is served as a cacheable static asset', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/owner.css', headers: {} }, response);
  assert.equal(response.status, 200);
  assert.match(response.headers['Content-Type'], /text\/css/);
  assert.match(response.headers['Cache-Control'], /public,max-age=86400/);
  assert.match(String(response.body), /\.bot-cards/);
  assert.match(String(response.body), /@media\(max-width:760px\)/);
});

test('dedicated site avatar asset is public so auth screens can render it', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site-avatar.webp', headers: {} }, response);
  assert.equal(response.status, 200);
  assert.match(response.headers['Content-Type'], /image\/webp/);
  assert.ok(Buffer.isBuffer(response.body) && response.body.length > 1000);
});

test('registration page reports that email delivery must be configured before signup', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/register?status=mail_unavailable', headers: {} }, response, { db: { query: async () => ({ rows: [], rowCount: 0 }) } });
  assert.equal(response.status, 200);
  assert.match(response.body, /Gmail API bağlantısını tamamlamalı/);
  assert.match(response.body, /href="\/assets\/site\.css"/);
});


test('mobile public pages keep card actions and hero media within the viewport', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/kesfet'), response);
  assert.match(response.body, /assets\/site\.css/);
  const stylesheet = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site.css', headers: {} }, stylesheet);
  assert.match(String(stylesheet.body), /max-width:560px/);
  assert.match(String(stylesheet.body), /\.actions \.btn\{flex:1 1 100%;width:100%\}/);
  assert.match(String(stylesheet.body), /focus-visible/);
  assert.ok(String(stylesheet.body).includes('.skip-link:focus'));
  assert.match(String(stylesheet.body), /overscroll-behavior-x:contain/);
});

test('Owner Panel mobile rendering defers offscreen sections and avoids animated hero GIF decoding', async () => {
  const response = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/owner.css', headers: {} }, response);
  const css = String(response.body);
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /contain-intrinsic-size:auto 480px/);
  assert.match(css, /\.hero:after\{[^}]*background-image:radial-gradient/);
});

test('command catalogue is authenticated, dynamic, searchable and safely escapes command metadata', async () => {
  const response = res();
  const commands = new Map([
    ['karakter', { data: { name: 'karakter', description: 'RPG karakterini görüntüle.' } }],
    ['animequiz', { data: { name: 'animequiz', description: 'Anime quizlerine katıl.' } }],
    ['yoldas', { data: { name: 'yoldas', description: 'Yoldaşını geliştir.' } }],
    ['balik', { data: { name: 'balik', description: 'Balık tut.' } }],
    ['sera', { data: { name: 'sera', description: 'Tohum ek ve hasat yap.' } }],
    ['yaratik', { data: { name: 'yaratik', description: 'Yaratık yakala.' } }],
    ['karakteristek', { data: { name: 'karakteristek', description: 'Karakter istek listeni yönet.' } }],
    ['hazine', { data: { name: 'hazine', description: '<script>alert(1)</script>' } }],
  ]);
  await handlePublicSiteRequest(request('/komutlar'), response, { client: { commands } });
  assert.equal(response.status, 200);
  assert.match(response.body, /Bütün <em>komutlar/);
  assert.match(response.body, /8\/8 komut gösteriliyor/);
  assert.match(response.body, /command-search/);
  assert.match(response.body, /RPG &amp; Macera/);
  assert.match(response.body, /Anime &amp; Eğlence/);
  assert.doesNotMatch(response.body, /<script>alert\(1\)<\/script>/);
  assert.match(response.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('command catalogue mirrors Discord subcommands, required options, choices and default permissions', async () => {
  const response = res();
  const commands = new Map([['yonetim', { data: {
    name: 'yonetim',
    description: 'Sunucu bağlantı araçları.',
    default_member_permissions: '32',
    dm_permission: false,
    options: [{
      type: 1,
      name: 'bagla',
      description: 'Karakter bağlantısını başlat.',
      options: [{
        type: 3,
        name: 'kod',
        description: 'Tek kullanımlık bağlantı kodu.',
        required: true,
        choices: [{ name: 'Örnek kod', value: 'ornek-kod' }]
      }]
    }]
  }}]]);
  await handlePublicSiteRequest(request('/komutlar'), response, { client: { commands } });
  assert.equal(response.status, 200);
  assert.match(response.body, /Parametreler ve kullanım/);
  assert.match(response.body, /Alt komut/);
  assert.match(response.body, /--bagla/);
  assert.match(response.body, /--kod/);
  assert.match(response.body, /Zorunlu/);
  assert.match(response.body, /Örnek kod/);
  assert.match(response.body, /Gerekli: Sunucuyu Yönet/);
  assert.match(response.body, /DM kullanımına kapalı/);
  assert.match(response.body, /command-options/);
});

test('command catalogue handles an unavailable command collection without throwing', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/komutlar'), response, { client: {} });
  assert.equal(response.status, 200);
  assert.match(response.body, /0\/0 komut gösteriliyor/);
  assert.match(response.body, /Komut kataloğu şu anda yüklenemiyor/);
});

test('homepage declares the existing Frieren brand favicon and serves the SVG asset publicly', async () => {
  const homepage = res();
  await handlePublicSiteRequest(request('/kesfet'), homepage);
  assert.match(homepage.body, /<link rel="icon" type="image\/svg\+xml" href="\/assets\/site-avatar\.svg">/);
  assert.match(homepage.body, /href="\/lonca">Maceracı Loncası/);
  assert.match(homepage.body, /Frieren modüllerini düzenle/);
  const favicon = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/assets/site-avatar.svg', headers: {} }, favicon), true);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers['Content-Type'], /image\/svg\+xml/);
  assert.ok(String(favicon.body).startsWith('<svg'), 'favicon response must contain the existing SVG brand artwork');
});

test('homepage advertises an installable Frieren web app manifest and brand icon', async () => {
  const homepage = res();
  await handlePublicSiteRequest(request('/kesfet'), homepage);
  assert.match(homepage.body, /<link rel="manifest" href="\/site\.webmanifest">/);
  assert.match(homepage.body, /name="mobile-web-app-capable"/);
  const manifestResponse = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/site.webmanifest', headers: {} }, manifestResponse), true);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers['Content-Type'], /application\/manifest\+json/);
  assert.match(manifestResponse.headers['Cache-Control'], /public,max-age=86400/);
  const manifest = JSON.parse(String(manifestResponse.body));
  assert.equal(manifest.name, 'Frieren Platform');
  assert.equal(manifest.short_name, 'Frieren');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons, [{ src: '/assets/site-shortcut.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]);
  const icon = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/assets/site-shortcut.svg', headers: {} }, icon), true);
  assert.equal(icon.status, 200);
  assert.match(icon.headers['Content-Type'], /image\/svg\+xml/);
  assert.match(String(icon.body), /<clipPath id="clip"><circle cx="256" cy="256" r="246"/);
  assert.ok(String(icon.body).startsWith('<svg'), 'shortcut icon must be a scalable circular SVG');
});

function sitePost(path, fields, id='site_123e4567-e89b-12d3-a456-426614174000') {
  const token=createPublicSiteSession(secret,{id,username:'Gezgin'},Math.floor(Date.now()/1000)+3600);
  const body=new URLSearchParams(fields).toString();
  return {method:'POST',url:path,headers:{cookie:buildPublicSiteSessionCookie(token,3600).split(';')[0],'content-type':'application/x-www-form-urlencoded'},async *[Symbol.asyncIterator](){yield Buffer.from(body);}};
}

test('adventurer dashboard requires a verified member session and renders linked RPG, season and event data', async () => {
  const anonymous=res();
  await handlePublicSiteRequest({method:'GET',url:'/maceraci',headers:{}},anonymous);
  assert.equal(anonymous.status,302);
  assert.equal(anonymous.headers.Location,'/login');
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:12,xp:1440,coins:900,hp:80,max_hp:100,mana:65,max_mana:100,season_name:'Sezon 2026',rating:1180,wins:4,losses:2,matches:6};
  const event={event_id:'event-test',guild_id:profile.guild_id,title:'Zindan Gecesi',description:'Topluluk etkinliği',event_type:'community',starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString(),max_participants:12,participants:5};
  let queryCount=0;
  const db={query:async()=>({rows:queryCount++===0?[profile]:[event],rowCount:1})};
  const response=res();
  const id='site_123e4567-e89b-12d3-a456-426614174000';
  assert.equal(await handlePublicSiteRequest(request('/maceraci',{id,username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,200);
  assert.match(response.body,/Maceracı Paneli/);
  assert.match(response.body,/Fern/);
  assert.match(response.body,/1180/);
  assert.match(response.body,/Zindan Gecesi/);
  assert.match(response.body,/action="\/maceraci\/link"/);
  assert.match(response.body,/name="csrf"/);
});

test('adventurer account linking validates CSRF and consumes a single-use token', async () => {
  const id='site_123e4567-e89b-12d3-a456-426614174000';
  const csrf=createSiteCsrfToken(secret);
  let selected=false;
  const client={async query(sql){
    if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('DELETE')||sql.startsWith('INSERT')) return {rows:[],rowCount:1};
    if(sql.startsWith('SELECT guild_id,user_id FROM site_link_tokens')) { selected=true; return {rows:[{guild_id:'1539562273197260860',user_id:'123456789012345678'}],rowCount:1}; }
    throw new Error('Unexpected query: '+sql);
  },release(){}};
  const db={connect:async()=>client};
  const requestPost=sitePost('/maceraci/link',{csrf,token:'abcdefghijklmnopqrstuvwxyz0123456789'},id);
  const response=res();
  assert.equal(await handlePublicSiteRequest(requestPost,response,{db}),true);
  assert.equal(selected,true);
  assert.equal(response.status,303);
  assert.equal(response.headers.Location,'/maceraci?status=linked');
});

test('adventurer account linking rejects invalid CSRF before opening a database transaction', async () => {
  let connected=false;
  const db={connect:async()=>{connected=true;throw new Error('must not connect');}};
  const requestPost=sitePost('/maceraci/link',{csrf:'invalid',token:'abcdefghijklmnopqrstuvwxyz0123456789'});
  const response=res();
  assert.equal(await handlePublicSiteRequest(requestPost,response,{db}),true);
  assert.equal(response.status,403);
  assert.equal(connected,false);
});

test('public home showcase is visible only after explicit opt-in',async()=>{
 const profile={user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:20,xp:2400,active_room:'starter',layout:[],is_public:true};
 const db={async query(sql){
  if(sql.includes('FROM player_homes h JOIN users u'))return {rows:[profile],rowCount:1};
  if(sql.includes('FROM player_home_rooms'))return {rows:[{room_key:'starter'}],rowCount:1};
  if(sql.includes('FROM achievement_claims'))return {rows:[{achievement_key:'first_boss',display_slot:0}],rowCount:1};
  if(sql.includes('FROM player_cosmetic_loadout'))return {rows:[{slot:'profile_frame',cosmetic_key:'moon_frame'}],rowCount:1};
  if(sql.includes('FROM user_companions'))return {rows:[],rowCount:0};
  if(sql.includes('FROM anime_character_card_variants'))return {rows:[],rowCount:0};
  throw new Error('Unexpected public home query: '+sql);
 }};
 const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
 const response=res();
 assert.equal(await handlePublicSiteRequest({method:'GET',url:'/maceraci/ev?guildId=1539562273197260860&userId='+profile.user_id,headers:{}},response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Profil Vitrini/);
 assert.match(response.body,/Seviye 20/);
 assert.match(response.body,/2\.400 XP/);
 assert.match(response.body,/Rozet ve Başarım Vitrini/);
 assert.match(response.body,/Fern/);
 assert.match(response.body,/first_boss/);
 assert.match(response.body,/Ay Işığı Çerçevesi/);
});

test('player experience web mutations reject invalid CSRF before database access',async()=>{
 let connected=false;
 const db={connect:async()=>{connected=true;throw new Error('must not connect');},query:async()=>{connected=true;throw new Error('must not query');}};
 const response=res();
 const post=sitePost('/maceraci/yasam',{csrf:'invalid',guildId:'1539562273197260860',action:'unlock-room',roomKey:'library'});
 assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
 assert.equal(response.status,403);
 assert.equal(connected,false);
});

test('player experience web page is scoped to the linked character and shows home cosmetics and event progress',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:20};
 const db={async query(sql){
  if(sql.includes('FROM site_discord_links'))return {rows:[profile],rowCount:1};
  if(sql.startsWith('INSERT INTO users')||sql.startsWith('INSERT INTO user_talents')||sql.startsWith('INSERT INTO learned_spells')||sql.startsWith('INSERT INTO player_home_rooms')||sql.startsWith('INSERT INTO player_homes'))return {rows:[],rowCount:1};
  if(sql.includes('SELECT active_room,layout,is_public FROM player_homes'))return {rows:[{active_room:'starter',layout:[],is_public:false}],rowCount:1};
  if(sql.includes('SELECT room_key,unlocked_at FROM player_home_rooms'))return {rows:[{room_key:'starter'}],rowCount:1};
  if(sql.includes('FROM player_cosmetic_ownership'))return {rows:[],rowCount:0};
  if(sql.includes('FROM player_cosmetic_loadout'))return {rows:[],rowCount:0};
  if(sql.includes('FROM player_cosmetic_presets'))return {rows:[],rowCount:0};
  if(sql.includes('FROM achievement_claims'))return {rows:[{achievement_key:'first_boss',display_slot:null,claimed_at:new Date().toISOString()}],rowCount:1};
  if(sql.includes('FROM guild_events'))return {rows:[{event_id:'123e4567-e89b-42d3-a456-426614174000',title:'Zindan Gecesi',ends_at:new Date(Date.now()+3600000).toISOString(),participation:1,checkin:0}],rowCount:1};
  throw new Error('Unexpected player experience query: '+sql);
 }};
 const response=res();
 const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
 assert.equal(await handlePublicSiteRequest(request('/maceraci/yasam?guildId='+profile.guild_id,account),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Kişisel Ev/);
 assert.match(response.body,/Ev İstasyonları/);
 assert.match(response.body,/Simya Laboratuvarı/);
 assert.match(response.body,/Genel Kozmetikler/);
 assert.match(response.body,/Zafer Salonu/);
 assert.match(response.body,/first_boss/);
 assert.match(response.body,/Etkinlik İlerlemesi/);
 assert.match(response.body,/Zindan Gecesi/);
 assert.match(response.body,/book_shelf/);
});

test('adventurer inventory page is account- and guild-scoped and displays equipped items', async () => {
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:12,xp:1440,coins:900,hp:80,max_hp:100,mana:65,max_mana:100};
  const db={async query(sql){
    if(sql.includes('FROM site_discord_links')) return {rows:[profile],rowCount:1};
    if(sql.includes('FROM inventory')) return {rows:[{item_key:'Mana Kristali',quantity:3,slot:null},{item_key:'Efsunlu Asa',quantity:1,slot:'weapon'}],rowCount:2};
    throw new Error('Unexpected query: '+sql);
  }};
  const response=res();
  assert.equal(await handlePublicSiteRequest(request('/maceraci/envanter?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,200);
  assert.match(response.body,/Envanter/);
  assert.match(response.body,/Mana Kristali/);
  assert.match(response.body,/Efsunlu Asa/);
  assert.match(response.body,/Takılı: Silah/);
  assert.match(response.body,/Kuzey Pazarı/);
});

test('web player market renders linked inventory, public listings, own-listing cancellation and history', async () => {
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:12,xp:1440,coins:900,hp:80,max_hp:100,mana:65,max_mana:100};
  const listing={listing_id:'123e4567-e89b-42d3-a456-426614174000',seller_id:'223456789012345678',item_key:'Mana Kristali',quantity:2,price_coins:80,created_at:new Date().toISOString()};
  const ownListing={...listing,listing_id:'123e4567-e89b-42d3-a456-426614174001',seller_id:profile.user_id,item_key:'Efsunlu Asa'};
  const db={async query(sql){
    if(sql.includes('FROM site_discord_links')) return {rows:[profile],rowCount:1};
    if(sql.includes('FROM inventory')) return {rows:[{item_key:'Efsunlu Asa',quantity:1,slot:null}],rowCount:1};
    if(sql.includes("WHERE guild_id=$1 AND status='active'")) return {rows:[listing,ownListing],rowCount:2};
    if(sql.includes('seller_id=$2 OR buyer_id=$2')) return {rows:[{...ownListing,status:'active'}],rowCount:1};
    if(sql.includes('FROM player_market_offers o JOIN player_market_listings')) return {rows:[{offer_id:'123e4567-e89b-42d3-a456-426614174002',listing_id:ownListing.listing_id,buyer_id:'323456789012345678',offer_coins:75,status:'pending',seller_id:profile.user_id,item_key:ownListing.item_key,quantity:1,price_coins:100,listing_status:'active'}],rowCount:1};
    if(sql.includes('FROM player_market_price_alerts')) return {rows:[],rowCount:0};
    throw new Error('Unexpected query: '+sql);
  }};
  const response=res();
  assert.equal(await handlePublicSiteRequest(request('/pazar?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,200);
  assert.match(response.body,/Kuzey Pazarı/);
  assert.match(response.body,/Satın al/);
  assert.match(response.body,/İlanı iptal et/);
  assert.match(response.body,/Eşyanı satışa çıkar/);
  assert.match(response.body,/İşlem geçmişim/);
  assert.match(response.body,/Pazarlık teklifi gönder/);
  assert.match(response.body,/Tekliflerim ve gelen teklifler/);
  assert.match(response.body,/Teklifi kabul et/);
  assert.match(response.body,/Fiyat alarmı kur/);
  assert.match(response.body,/Fiyat alarmlarım/);
  assert.doesNotMatch(response.body,/223456789012345678/);
});


test('web market price alert mutations reject invalid CSRF before database access', async () => {
  let queries=0;
  const db={async query(){queries++;throw new Error('must not query');}};
  const response=res();
  const post=sitePost('/pazar/alarm-kur',{csrf:'invalid',guildId:'1539562273197260860',itemKey:'Mana Kristali',targetPrice:'250'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
  assert.equal(response.status,403);
  assert.equal(queries,0);
});

test('web market mutations reject invalid CSRF before any database access', async () => {
  let queries=0;
  const db={async query(){queries++;throw new Error('must not query');}};
  const response=res();
  const post=sitePost('/pazar/teklif-ver',{csrf:'invalid',guildId:'1539562273197260860',listingId:'123e4567-e89b-42d3-a456-426614174000',offerCoins:'100'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
  assert.equal(response.status,403);
  assert.equal(queries,0);
});

test('web market mutations reject a guild not linked to the authenticated site account', async () => {
  let queryCount=0;
  const db={async query(sql){queryCount++;if(sql.includes('FROM site_discord_links'))return {rows:[],rowCount:0};throw new Error('Unexpected query: '+sql);}};
  const response=res();
  const post=sitePost('/pazar/al',{csrf:createSiteCsrfToken(secret),guildId:'1539562273197260860',listingId:'123e4567-e89b-42d3-a456-426614174000'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
  assert.equal(response.status,403);
  assert.equal(queryCount,1);
});

test('web event RSVP uses the linked Discord character and redirects after joining', async () => {
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
  const db={
    async query(sql){
      if(sql.includes('FROM site_discord_links')) return {rows:[profile],rowCount:1};
      if(sql.startsWith('INSERT INTO users')||sql.startsWith('INSERT INTO user_talents')||sql.startsWith('INSERT INTO learned_spells')) return {rows:[],rowCount:1};
      throw new Error('Unexpected pool query: '+sql);
    },
    async connect(){
      return {async query(sql){
        if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK') return {rows:[],rowCount:1};
        if(sql.includes('FROM guild_events')) return {rows:[{event_id:'123e4567-e89b-42d3-a456-426614174000',max_participants:10}],rowCount:1};
        if(sql.includes('FROM guild_event_participants WHERE event_id=$1 AND user_id=$2')) return {rows:[],rowCount:0};
        if(sql.includes('COUNT(*)::int AS count')) return {rows:[{count:1}],rowCount:1};
        if(sql.startsWith('INSERT INTO guild_event_participants')) return {rows:[{user_id:profile.user_id}],rowCount:1};
        if(sql.startsWith('INSERT INTO guild_event_progress')) return {rows:[{progress:1}],rowCount:1};
        throw new Error('Unexpected client query: '+sql);
      },release(){}};
    }
  };
  const response=res();
  const post=sitePost('/maceraci/event',{csrf:createSiteCsrfToken(secret),guildId:profile.guild_id,eventId:'123e4567-e89b-42d3-a456-426614174000',action:'join'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
  assert.equal(response.status,303);
  assert.match(response.headers.Location,/status=joined/);
});

test('adventurer social page is scoped to the linked guild character and renders relationships and pending requests',async()=>{
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
  const db={async query(sql,params){
    if(sql.includes('FROM site_discord_links'))return{rows:[profile],rowCount:1};
    if(sql.includes('FROM guild_feature_settings'))return{rows:[{enabled:true}],rowCount:1};
    if(sql.includes('FROM social_relationships'))return{rows:[{user_id:params?.[2]==='rival'?'323456789012345678':'223456789012345678',relationship_type:params?.[2]||'friend'}],rowCount:1};
    if(sql.includes('FROM social_friend_requests'))return{rows:[{request_id:'123e4567-e89b-42d3-a456-426614174000',requester_id:'423456789012345678'}],rowCount:1};
    if(sql.includes('FROM social_reputation'))return{rows:[{points:7}],rowCount:1};
    throw new Error('Unexpected query: '+sql);
  }};
  const response=res();
  assert.equal(await handlePublicSiteRequest(request('/maceraci/sosyal?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db}),true);
  assert.equal(response.status,200);
  assert.match(response.body,/Sosyal Alan|Sosyal <em>alanın/);
  assert.match(response.body,/223456789012345678/);
  assert.match(response.body,/323456789012345678/);
  assert.match(response.body,/423456789012345678/);
  assert.match(response.body,/İtibar/);
  assert.match(response.body,/action="\/maceraci\/sosyal"/);
});
test('web social mutations reject invalid CSRF before any database access',async()=>{
  let queries=0;const db={async query(){queries++;throw new Error('must not query');}};
  const response=res(),post=sitePost('/maceraci/sosyal',{csrf:'invalid',guildId:'1539562273197260860',action:'request',targetId:'223456789012345678'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);assert.equal(response.status,403);assert.equal(queries,0);
});
test('web social mutations reject a guild not linked to the authenticated site account',async()=>{
  let queries=0;const db={async query(sql){queries++;if(sql.includes('FROM site_discord_links'))return{rows:[],rowCount:0};throw new Error('Unexpected query: '+sql);}};
  const response=res(),post=sitePost('/maceraci/sosyal',{csrf:createSiteCsrfToken(secret),guildId:'1539562273197260860',action:'request',targetId:'223456789012345678'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);assert.equal(response.status,403);assert.equal(queries,1);
});
test('web social friend request uses the linked character and redirects after creating a guild-scoped request',async()=>{
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
  const queries=[];
  const db={
    async query(sql){queries.push(sql);if(sql.includes('FROM site_discord_links'))return{rows:[profile],rowCount:1};if(sql.includes('FROM guild_feature_settings'))return{rows:[{enabled:true}],rowCount:1};throw new Error('Unexpected pool query: '+sql);},
    async connect(){return{async query(sql,params){queries.push(sql);if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[],rowCount:1};if(sql.includes('SELECT user_id FROM users'))return{rows:[{user_id:profile.user_id},{user_id:'223456789012345678'}],rowCount:2};if(sql.includes('SELECT relationship_type FROM social_relationships'))return{rows:[],rowCount:0};if(sql.startsWith('UPDATE social_friend_requests'))return{rows:[],rowCount:0};if(sql.includes('SELECT request_id,requester_id FROM social_friend_requests'))return{rows:[],rowCount:0};if(sql.startsWith('INSERT INTO social_friend_requests'))return{rows:[{request_id:'123e4567-e89b-42d3-a456-426614174000'}],rowCount:1};throw new Error('Unexpected client query: '+sql+' '+JSON.stringify(params));},release(){}};}
  };
  const response=res();
  const post=sitePost('/maceraci/sosyal',{csrf:createSiteCsrfToken(secret),guildId:profile.guild_id,action:'request',targetId:'223456789012345678'});
  assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
  assert.equal(response.status,303);
  assert.match(response.headers.Location,/status=request_sent/);
  assert.ok(queries.some(sql=>sql.includes('social_friend_requests')));
});
test('web social page and mutations respect the guild social feature toggle',async()=>{
  const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
  const db={async query(sql){
    if(sql.includes('FROM site_discord_links'))return{rows:[profile],rowCount:1};
    if(sql.includes('FROM guild_feature_settings'))return{rows:[{enabled:false}],rowCount:1};
    throw new Error('Unexpected query: '+sql);
  }};
  const page=res();
  assert.equal(await handlePublicSiteRequest(request('/maceraci/sosyal?guildId='+profile.guild_id,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),page,{db}),true);
  assert.equal(page.status,403);
  assert.match(String(page.body),/Sosyal modül bu sunucuda kapalı/);
  const post=res();
  assert.equal(await handlePublicSiteRequest(sitePost('/maceraci/sosyal',{csrf:createSiteCsrfToken(secret),guildId:profile.guild_id,action:'request',targetId:'223456789012345678'}),post,{db}),true);
  assert.equal(post.status,403);
  assert.match(String(post.body),/Sosyal modül bu sunucuda kapalı/);
});
test('main startup initializes all player-facing collection schemas before serving the web portal', async () => {
  const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
  for(const moduleName of ['companions.js','fishing.js','farming.js','character-wishlist.js'])assert.ok(source.includes("from './"+moduleName+"'"));
  assert.match(source,/await Promise\.all\(\[[\s\S]*ensureCreatureSchema\(\)[\s\S]*initCompanionSchema\(pool\)[\s\S]*initFishingSchema\(pool\)[\s\S]*initFarmSchema\(pool\)[\s\S]*initCharacterWishlistSchema\(pool\)[\s\S]*\]\)/);
});


test('private home showcase remains unavailable without explicit opt-in',async()=>{
 const db={async query(sql){
  assert.ok(sql.includes('h.is_public=TRUE'));
  return {rows:[],rowCount:0};
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest({method:'GET',url:'/maceraci/ev?guildId=1539562273197260860&userId=123456789012345678',headers:{}},response,{db}),true);
 assert.equal(response.status,404);
 assert.match(response.body,/Bu ev paylaşılmıyor/);
});


test('Discord-only sessions are redirected to the site account login before player dashboard queries', async () => {
  for (const path of ['/', '/maceraci']) {
    let queryCount = 0;
    const db = { async query() { queryCount += 1; throw new Error('Dashboard query must not run for a Discord-only session'); } };
    const response = res();
    assert.equal(await handlePublicSiteRequest(request(path, visitor), response, { db }), true);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.Location, '/login?status=site_account_required', path);
    assert.equal(queryCount, 0, path);
  }
});


test('support ticket thread is isolated to the authenticated account and renders reply and status history',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern'};
 const ticketId='123e4567-e89b-42d3-a456-426614174000';
 const db={async query(sql){
  if(sql.includes('FROM frieren_support_tickets WHERE account_id'))return{rows:[{ticket_id:ticketId,category:'bug',subject:'OAuth issue',status:'in_progress',created_at:new Date().toISOString()}],rowCount:1};
  if(sql.includes('SELECT ticket_id,message,status FROM frieren_support_tickets'))return{rows:[{ticket_id:ticketId,message:'Callback failed',status:'in_progress'}],rowCount:1};
  if(sql.includes('FROM frieren_support_ticket_messages'))return{rows:[{message_id:'message-1',author_type:'support',message:'We are investigating',created_at:new Date().toISOString()}],rowCount:1};
  if(sql.includes('FROM frieren_support_ticket_events'))return{rows:[{actor_type:'support',previous_status:'open',new_status:'in_progress',created_at:new Date().toISOString()}],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest(request('/destek?ticket='+ticketId,{id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'}),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Talep konuşması/);
 assert.match(response.body,/We are investigating/);
 assert.match(response.body,/Yanıt gönder/);
 assert.match(response.body,/open → in_progress/);
});

test('support replies require valid CSRF and stay scoped to the signed-in account',async()=>{
 const ticketId='123e4567-e89b-42d3-a456-426614174000';
 let replyInserted=false;
 const db={async query(sql){
  if(sql.includes('SELECT ticket_id,status FROM frieren_support_tickets'))return{rows:[{ticket_id:ticketId,status:'open'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_messages')){replyInserted=true;return{rows:[{message_id:'message-2'}],rowCount:1};}
  if(sql.includes('UPDATE frieren_support_tickets SET updated_at'))return{rows:[],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_events'))return{rows:[],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const response=res();
 const post=sitePost('/destek/yanit',{csrf:createSiteCsrfToken(secret),ticketId,message:'I can provide more details.'});
 assert.equal(await handlePublicSiteRequest(post,response,{db}),true);
 assert.equal(response.status,303);
 assert.match(response.headers.Location,/reply_sent/);
 assert.equal(replyInserted,true);
});


test('public player showcase respects privacy and exposes only the opt-in card and companion showcase',async()=>{
 const calls=[];
 const db={async query(sql){
  calls.push(sql);
  if(sql.includes('h.is_public=TRUE'))return{rows:[{user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:42,xp:9000,active_room:'starter',layout:[],is_public:true}],rowCount:1};
  if(sql.includes('FROM player_home_rooms'))return{rows:[{room_key:'starter'}],rowCount:1};
  if(sql.includes('FROM achievement_claims'))return{rows:[{achievement_key:'first_raid',display_slot:0}],rowCount:1};
  if(sql.includes('FROM player_cosmetic_loadout'))return{rows:[{slot:'profile_frame',cosmetic_key:'moon_frame'}],rowCount:1};
  if(sql.includes('FROM user_companions'))return{rows:[{companion_key:'flamme_cat',evolution_stage:2,level:8,xp:500}],rowCount:1};
  if(sql.includes('FROM anime_character_card_variants'))return{rows:[{character_name:'Frieren',series_name:'Frieren',variant_key:'holo',quantity:2}],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const response=res();
 assert.equal(await handlePublicSiteRequest({method:'GET',url:'/maceraci/ev?guildId=1539562273197260860&userId=123456789012345678',headers:{}},response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/PAYLAŞILABİLİR MACERACI PROFİLİ/);
 assert.match(response.body,/Anime Kart Koleksiyonu/);
 assert.match(response.body,/Yoldaş Vitrini/);
 assert.match(response.body,/first_raid/);
 assert.ok(calls.some(sql=>sql.includes('h.is_public=TRUE')));
});


test('adventurer calendar exposes direct raid signup with the real guild team UUID',async()=>{
 const profile={guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',class_name:'Büyücü',level:20,xp:2400,coins:100,hp:80,max_hp:100,mana:40,max_mana:60,rating:1200,wins:2,losses:1};
 const event={event_id:'123e4567-e89b-42d3-a456-426614174000',guild_id:profile.guild_id,title:'Kuzey Zindanı',description:'Birlikte ilerle.',event_type:'boss_raid',starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString(),max_participants:10,participants:2,joined:false,joined_team_key:null,joined_team_id:null,joined_team_name:null,available_teams:[{team_id:'123e4567-e89b-42d3-a456-426614174001',team_name:'Fern Takımı'}]};
 const db={async query(sql){if(sql.includes('FROM site_discord_links l JOIN users u'))return{rows:[profile],rowCount:1};if(sql.includes('FROM guild_events e'))return{rows:[event],rowCount:1};throw new Error('Unexpected dashboard query: '+sql);}};
 const response=res();
 const account={id:'site_123e4567-e89b-12d3-a456-426614174000',username:'Gezgin'};
 assert.equal(await handlePublicSiteRequest(request('/maceraci',account),response,{db}),true);
 assert.equal(response.status,200);
 assert.match(response.body,/Raid takımına katıl/);
 assert.match(response.body,/name="teamId"/);
 assert.match(response.body,/Fern Takımı/);
 assert.doesNotMatch(response.body,/name="teamKey"/);
});


// Crawler routes intentionally remain public while player and owner routes stay gated.
test('anonymous search crawlers can read the dedicated Frieren Bot identity landing page', async () => {
  const response = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/tanitim', headers: {} }, response), true);
  assert.equal(response.status, 200);
  assert.equal(response.headers['X-Robots-Tag'], 'index, follow');
  assert.match(response.body, /<title>Frieren Bot \| Poğaça Frieren Discord RPG/);
  assert.match(response.body, /rel="canonical" href="https:\/\/frierenbot\.vercel\.app\/tanitim"/);
  assert.match(response.body, /name="robots" content="index,follow"/);
  assert.match(response.body, /Poğaça Frieren/);
  assert.match(response.body, /Soiree/);
  assert.match(response.body, /application\/ld\+json/);
  assert.match(response.body, /https:\/\/github\.com\/soire07/);
});

test('Google Search Console verification file is publicly served at the root path', async () => {
  const response = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/google1941de4c3bd5e8ea.html', headers: {} }, response), true);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(response.body, 'google-site-verification: google1941de4c3bd5e8ea.html\n');
});

test('anonymous search crawlers can read robots.txt and the XML sitemap', async () => {
  const robots = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/robots.txt', headers: {} }, robots), true);
  assert.equal(robots.status, 200);
  assert.match(robots.headers['Content-Type'], /text\/plain/);
  assert.match(robots.body, /Allow: \/tanitim/);
  assert.match(robots.body, /Allow: \/sitemap\.xml/);
  assert.match(robots.body, /Sitemap: https:\/\/frierenbot\.vercel\.app\/sitemap\.xml/);

  const sitemap = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/sitemap.xml', headers: {} }, sitemap), true);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers['Content-Type'], /application\/xml/);
  assert.match(sitemap.body, /<loc>https:\/\/frierenbot\.vercel\.app\/tanitim<\/loc>/);
});

test('market price preview source is registered', async () => { const source = await readFile(new URL('../public-site.js', import.meta.url), 'utf8'); assert.ok(source.includes('market-preview.js')); });
