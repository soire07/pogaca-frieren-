import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicSiteRequest } from '../public-site.js';
import { createPublicSiteSession, buildPublicSiteSessionCookie } from '../owner-dashboard.js';

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

test('anonymous visitors must authenticate before viewing the homepage', async () => {
  const response = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/', headers: {} }, response), true);
  assert.equal(response.status, 302);
  assert.equal(response.headers.Location, '/login');
});

test('authenticated homepage includes the member identity, profile and GIF gallery', async () => {
  const response = res();
  const client = { guilds: { cache: { size: 3 } }, commands: { size: 68 }, isReady: () => true };
  assert.equal(await handlePublicSiteRequest(request('/', visitor), response, { client }), true);
  assert.equal(response.status, 200);
  assert.match(response.body, /Bin yıllık/);
  assert.match(response.body, /Gezgin/);
  assert.match(response.body, /class="profile-banner"/);
  assert.match(response.body, /profile-banner[\\s\\S]*?src="https:\\/\\/images\\.wallpapersden\\.com\\/image\\/download\\/frieren-hd-frieren-beyond-journey-s-end_bmdoamyUmZqaraWkpJRpZW1lrWZlbWU\\.jpg"/);
  assert.match(response.body, /class="wrap home-banner"/);
  assert.match(response.body, /assets\/site-banner\.webp/);
  assert.match(response.body, /gif-gallery/);
  assert.match(response.body, /href="\/assets\/site\.css"/);
  assert.match(response.body, /profile-avatar/);
  assert.equal((response.body.match(/loading="lazy"/g) || []).length, 17);
  assert.equal((response.body.match(/class="gif-item"/g) || []).length, 16);
  assert.match(response.body, /68/);
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
  await handlePublicSiteRequest(request('/', ownerUser), owner);
  assert.match(owner.body, /href="\/owner"/);
  const visitorResponse = res();
  await handlePublicSiteRequest(request('/', visitor), visitorResponse);
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

test('site profile uses dedicated brand avatar and banner assets', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/', visitor), response);
  assert.match(response.body, /site-avatar\.webp/);
  const stylesheet = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site.css', headers: {} }, stylesheet);
  assert.match(String(stylesheet.body), /site-banner\.webp/);
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
  assert.match(response.body, /Gmail SMTP ayarlarını tamamlamalı/);
  assert.match(response.body, /href="\/assets\/site\.css"/);
});


test('mobile public pages keep card actions and hero media within the viewport', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/'), response);
  assert.match(response.body, /assets\/site\.css/);
  const stylesheet = res();
  await handlePublicSiteRequest({ method: 'GET', url: '/assets/site.css', headers: {} }, stylesheet);
  assert.match(String(stylesheet.body), /max-width:560px/);
  assert.match(String(stylesheet.body), /\.actions \.btn\{flex:1 1 100%;width:100%\}/);
  assert.match(String(stylesheet.body), /focus-visible/);
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
    ['hazine', { data: { name: 'hazine', description: '<script>alert(1)</script>' } }],
  ]);
  await handlePublicSiteRequest(request('/komutlar'), response, { client: { commands } });
  assert.equal(response.status, 200);
  assert.match(response.body, /Bütün <em>komutlar/);
  assert.match(response.body, /3\/3 komut gösteriliyor/);
  assert.match(response.body, /command-search/);
  assert.match(response.body, /RPG &amp; Macera/);
  assert.match(response.body, /Anime &amp; Eğlence/);
  assert.doesNotMatch(response.body, /<script>alert\(1\)<\/script>/);
  assert.match(response.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('command catalogue handles an unavailable command collection without throwing', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/komutlar'), response, { client: {} });
  assert.equal(response.status, 200);
  assert.match(response.body, /0\/0 komut gösteriliyor/);
  assert.match(response.body, /Komut kataloğu şu anda yüklenemiyor/);
});
