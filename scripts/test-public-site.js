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

test('anonymous visitors must authenticate with Discord before viewing the homepage', async () => {
  const response = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/', headers: {} }, response), true);
  assert.equal(response.status, 302);
  assert.equal(response.headers.Location, '/login');
});

test('authenticated homepage includes the member identity, profile, GIF gallery and draggable chibi', async () => {
  const response = res();
  const client = { guilds: { cache: { size: 3 } }, commands: { size: 68 }, isReady: () => true };
  assert.equal(await handlePublicSiteRequest(request('/', visitor), response, { client }), true);
  assert.equal(response.status, 200);
  assert.match(response.body, /Bin yıllık/);
  assert.match(response.body, /Gezgin/);
  assert.match(response.body, /profile-banner/);
  assert.match(response.body, /gif-gallery/);
  assert.match(response.body, /id="chibi"/);
  assert.match(response.body, /pointermove/);
  assert.match(response.body, /Ensemden tutma/);
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


test('registration and login pages offer distinct Discord OAuth flows', async () => {
  const registration = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/register', headers: {} }, registration), true);
  assert.equal(registration.status, 200);
  assert.match(registration.body, /Discord ile kayıt ol/);
  assert.match(registration.body, /\/owner\/login\?flow=register/);
  const login = res();
  assert.equal(await handlePublicSiteRequest({ method: 'GET', url: '/login', headers: {} }, login), true);
  assert.equal(login.status, 200);
  assert.match(login.body, /Discord ile giriş yap/);
  assert.match(login.body, /\/owner\/login\?flow=login/);
});

test('site profile uses dedicated brand avatar and banner assets', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/', visitor), response);
  assert.match(response.body, /\/assets\/site-avatar\.svg/);
  assert.match(response.body, /\/assets\/site-banner\.svg/);
});

test('chibi speech bubble is nested inside the draggable companion wrapper', async () => {
  const response = res();
  await handlePublicSiteRequest(request('/', visitor), response);
  assert.match(response.body, /id="chibiCompanion"[\s\S]*id="chibiHint"[\s\S]*id="chibi"/);
  assert.match(response.body, /chibiCompanion/);
  assert.match(response.body, /pointermove/);
});
