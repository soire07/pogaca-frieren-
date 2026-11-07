import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiteUsername, validateSiteEmail, validateSiteLoginIdentifier, hashSitePassword, verifySitePassword,
  createSiteCsrfToken, verifySiteCsrfToken, consumeSmtpBuffer, smtpFailureDetails, sendGmailApi, handleSiteAuthRequest, isSameOriginRequest
} from '../site-auth.js';
import { createPublicSiteSession, readPublicSiteSession } from '../owner-dashboard.js';

const secret = 'site-auth-test-secret-with-at-least-32-characters';
function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
function fakeDb() {
  const calls = [];
  return { calls, async query(sql, params = []) { calls.push({ sql: String(sql), params }); return { rows: [], rowCount: 0 }; } };
}


test('Vercel public origin is trusted through the Render proxy while unlisted origins remain blocked', () => {
  const previous = process.env.SITE_AUTH_ALLOWED_ORIGINS;
  process.env.SITE_AUTH_ALLOWED_ORIGINS = 'https://frierenbot.vercel.app';
  try {
    const proxied = { headers: {
      origin: 'https://frierenbot.vercel.app',
      'sec-fetch-site': 'same-site',
      host: 'pogaca-frieren.onrender.com',
      'x-forwarded-host': 'pogaca-frieren.onrender.com',
      'x-forwarded-proto': 'https'
    } };
    assert.equal(isSameOriginRequest(proxied, 'https://pogaca-frieren.onrender.com'), true);
    assert.equal(isSameOriginRequest({ headers: {
      ...proxied.headers, origin: 'https://attacker.example'
    } }, 'https://pogaca-frieren.onrender.com'), false);
    assert.equal(isSameOriginRequest({ headers: {
      ...proxied.headers, origin: 'https://frierenbot.vercel.app', 'sec-fetch-site': 'cross-site'
    } }, 'https://pogaca-frieren.onrender.com'), false);
  } finally {
    if (previous === undefined) delete process.env.SITE_AUTH_ALLOWED_ORIGINS;
    else process.env.SITE_AUTH_ALLOWED_ORIGINS = previous;
  }
});

test('canonical production Vercel origin stays trusted when optional allowlist is empty or overridden', () => {
  const previous = process.env.SITE_AUTH_ALLOWED_ORIGINS;
  const request = { headers: {
    origin: 'https://frierenbot.vercel.app',
    'sec-fetch-site': 'same-site',
    host: 'pogaca-frieren.onrender.com',
    'x-forwarded-host': 'pogaca-frieren.onrender.com',
    'x-forwarded-proto': 'https'
  } };
  try {
    process.env.SITE_AUTH_ALLOWED_ORIGINS = '';
    assert.equal(isSameOriginRequest(request, 'https://pogaca-frieren.onrender.com'), true);
    process.env.SITE_AUTH_ALLOWED_ORIGINS = 'https://attacker.example';
    assert.equal(isSameOriginRequest(request, 'https://pogaca-frieren.onrender.com'), true);
    assert.equal(isSameOriginRequest({ headers: {
      ...request.headers, origin: 'https://unlisted-attacker.example'
    } }, 'https://pogaca-frieren.onrender.com'), false);
  } finally {
    if (previous === undefined) delete process.env.SITE_AUTH_ALLOWED_ORIGINS;
    else process.env.SITE_AUTH_ALLOWED_ORIGINS = previous;
  }
});

test('same-origin request guard accepts the configured site host and rejects cross-site origins', () => {
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://site.example', host: 'site.example', 'x-forwarded-proto': 'https' } }, 'https://site.example'), true);
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://evil.example', host: 'site.example', 'x-forwarded-proto': 'https' } }, 'https://site.example'), false);
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'cross-site', origin: 'https://site.example', host: 'site.example' } }, 'https://site.example'), false);
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-site', origin: 'https://site.example', host: 'site.example', 'x-forwarded-proto': 'https' } }, 'https://site.example'), true);
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-site', origin: 'https://evil.example', host: 'site.example', 'x-forwarded-proto': 'https' } }, 'https://site.example'), false);
  assert.equal(isSameOriginRequest({ headers: { 'sec-fetch-site': 'same-site', host: 'site.example', 'x-forwarded-proto': 'https' } }, 'https://site.example'), false);
  assert.equal(isSameOriginRequest({ headers: {} }, 'https://site.example'), false);
});



test('SMTP failure diagnostics normalize unusual thrown values without exposing email addresses', () => {
  assert.deepEqual(smtpFailureDetails(Object.assign(new Error('connect failed for user@example.com'), { code: 'ECONNRESET', syscall: 'connect' })), {
    name: 'Error', code: 'ECONNRESET', syscall: 'connect', message: 'connect failed for [redacted-email]',
    relayStage: null, relayError: null
  });
  assert.deepEqual(smtpFailureDetails('unexpected transport failure'), {
    name: 'NonErrorThrow', code: null, syscall: null, message: 'unexpected transport failure',
    relayStage: null, relayError: null
  });
  assert.deepEqual(smtpFailureDetails(undefined), {
    name: 'NonErrorThrow', code: null, syscall: null, message: 'Unknown SMTP failure',
    relayStage: null, relayError: null
  });
});

test('Gmail Apps Script HTTPS relay sends verification mail without blocked SMTP ports', async () => {
  const keys = ['SITE_GMAIL_SCRIPT_URL','SITE_GMAIL_SCRIPT_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let call;
  process.env.SITE_GMAIL_SCRIPT_URL = '  https://script.google.com/macros/s/test-deployment-id/exec  ';
  process.env.SITE_GMAIL_SCRIPT_SECRET = '  test-script-secret\n';
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    const payload = JSON.parse(options.body);
    assert.equal(payload.secret, 'test-script-secret');
    assert.equal(payload.to, 'receiver@example.com');
    assert.equal(payload.subject, 'Frieren doğrulama');
    assert.match(payload.html, /Doğrula/);
    assert.equal(options.redirect, 'follow');
    return { ok: true, async json() { return { ok: true, messageId: 'apps-script-message-id' }; } };
  };
  try {
    assert.equal(await sendGmailApi('receiver@example.com','Frieren doğrulama','<p>Doğrula</p>','Doğrula'),'apps-script-message-id');
    assert.equal(call.url, 'https://script.google.com/macros/s/test-deployment-id/exec');
    assert.equal(call.options.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('Gmail HTTPS relay rejects failed delivery without logging response secrets', async () => {
  const keys = ['SITE_GMAIL_SCRIPT_URL','SITE_GMAIL_SCRIPT_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.SITE_GMAIL_SCRIPT_URL = 'https://script.google.com/macros/s/test-deployment-id/exec';
  process.env.SITE_GMAIL_SCRIPT_SECRET = 'test-script-secret';
  globalThis.fetch = async () => ({ ok: true, async json() { return { ok: false, error: 'private-detail' }; } });
  try {
    await assert.rejects(
      () => sendGmailApi('receiver@example.com','Subject','<p>HTML</p>','Text'),
      error => error.message === 'GMAIL_SCRIPT_REJECTED' &&
        error.relayStage === 'UNKNOWN' &&
        error.relayError === 'private-detail'
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('SMTP reply parser handles split CRLF chunks and multiline Gmail responses', () => {
  const first = consumeSmtpBuffer('220-smtp.gmail.com ESMTP\r');
  assert.equal(first.buffer, '220-smtp.gmail.com ESMTP\r');
  assert.deepEqual(first.replies, []);
  const second = consumeSmtpBuffer(first.buffer + '\n250-smtp.gmail.com at your service\r\n250 AUTH LOGIN PLAIN\r\n', first.lines);
  assert.equal(second.buffer, '');
  assert.deepEqual(second.replies, ['220-smtp.gmail.com ESMTP\n250-smtp.gmail.com at your service\n250 AUTH LOGIN PLAIN']);
});

test('username and email validation normalizes email and rejects malformed identifiers', () => {
  assert.equal(validateSiteUsername('Frieren_01'), 'Frieren_01');
  assert.equal(validateSiteUsername('ab'), null);
  assert.equal(validateSiteUsername('bad name'), null);
  assert.equal(validateSiteLoginIdentifier('  Owner '), 'owner');
  assert.equal(validateSiteLoginIdentifier(' User@Example.com '), 'user@example.com');
  assert.equal(validateSiteLoginIdentifier('bad identifier!'), null);
  assert.equal(validateSiteEmail('  User@Example.com '), 'user@example.com');
  assert.equal(validateSiteEmail('not-an-email'), null);
});

test('Turkish Unicode account names are accepted, normalized and safe for login', () => {
  assert.equal(validateSiteUsername(' Soirəe '), 'Soirəe');
  assert.equal(validateSiteUsername('Soire\u0301e'), 'Soirée');
  assert.equal(validateSiteLoginIdentifier(' Soirəe '), 'soirəe');
  assert.equal(validateSiteUsername('Soirəe with space'), null);
  assert.equal(validateSiteUsername('Soirəe😀'), null);
  assert.equal(validateSiteUsername('a'.repeat(25)), null);
});


test('password hashing uses salted scrypt and verifies only the matching password', async () => {
  const stored = await hashSitePassword('correct horse battery staple');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifySitePassword('correct horse battery staple', stored), true);
  assert.equal(await verifySitePassword('incorrect password', stored), false);
  assert.match(await hashSitePassword('Abcdef8!'), /^scrypt\$16384\$8\$1\$/);
  await assert.rejects(() => hashSitePassword('Abcdef7'), /INVALID_PASSWORD_LENGTH/);
});

test('CSRF token is signed, time bounded and cannot be modified', () => {
  const now = 1_800_000_000_000;
  const token = createSiteCsrfToken(secret, now);
  assert.equal(verifySiteCsrfToken(token, secret, now + 1000), true);
  assert.equal(verifySiteCsrfToken(token, 'different-secret-that-is-long-enough', now + 1000), false);
  assert.equal(verifySiteCsrfToken(token, secret, now + 3 * 60 * 60 * 1000), false);
  assert.equal(verifySiteCsrfToken(token + 'x', secret, now), false);
});

test('public account session supports a UUID account without changing Discord owner identity rules', () => {
  const id = 'site_123e4567-e89b-12d3-a456-426614174000';
  const token = createPublicSiteSession(secret, { id, username: 'Gezgin' }, Math.floor(Date.now() / 1000) + 600);
  const session = readPublicSiteSession(token, secret);
  assert.equal(session.id, id);
  assert.equal(session.username, 'Gezgin');
  assert.equal(session.avatarUrl, null);
});









test('proxy origin fallback rejects an untrusted Referer and a valid untrusted Origin', () => {
  assert.equal(isSameOriginRequest({ headers: {
    referer: 'https://attacker.example/login',
    'sec-fetch-site': 'same-oigi'
  } }, 'https://site.example'), false);
  assert.equal(isSameOriginRequest({ headers: {
    origin: 'https://attacker.example',
    referer: 'https://site.example/login'
  } }, 'https://site.example'), false);
});






test('public registration and password recovery routes redirect to Discord-only sign-in', async () => {
  for (const path of ['/register','/forgot-password','/reset-password','/verify-email','/resend-verification']) {
    const res = response();
    assert.equal(await handleSiteAuthRequest({ method: 'GET', url: path, headers: {} }, res, { db: fakeDb(), sessionSecret: secret }), true);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.Location, '/login', path);
  }
  const login = response();
  assert.equal(await handleSiteAuthRequest({ method: 'GET', url: '/login', headers: {} }, login, { db: fakeDb(), sessionSecret: secret }), true);
  assert.equal(login.status, 200);
  assert.match(login.body, /Discord ile giriş yap/);
  assert.match(login.body, /<head>[\s\\S]*<meta name="google-site-verification" content="zQvll4lo6fEkpcbHjwSdQeMbJggVxdAviEDKvLC0Ebc">[\s\\S]*<\/head>/);
  assert.equal((login.body.match(/name="google-site-verification"/g) || []).length, 1);
  assert.doesNotMatch(login.body, /name="password"|name="email"|Hesap oluştur|Şifremi unuttum/);
});

test('Discord OAuth login creates a short-lived signed state cookie and requests identify only', async () => {
  const previous = { CLIENT_ID: process.env.CLIENT_ID, DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET, SITE_DISCORD_REDIRECT_URI: process.env.SITE_DISCORD_REDIRECT_URI };
  process.env.CLIENT_ID = 'test-discord-client';
  process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.SITE_DISCORD_REDIRECT_URI = 'https://frierenbot.vercel.app/site/discord/callback';
  try {
    const res = response();
    await handleSiteAuthRequest({ method: 'GET', url: '/site/discord/login', headers: {} }, res, { db: fakeDb(), sessionSecret: secret });
    assert.equal(res.status, 302);
    const target = new URL(res.headers.Location);
    assert.equal(target.origin, 'https://discord.com');
    assert.equal(target.pathname, '/oauth2/authorize');
    assert.equal(target.searchParams.get('scope'), 'identify');
    assert.equal(target.searchParams.get('redirect_uri'), process.env.SITE_DISCORD_REDIRECT_URI);
    assert.match(res.headers['Set-Cookie'], /^frieren_site_oauth_state=/);
    assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Discord OAuth callback provisions one persistent site account and issues a signed site session', async () => {
  const previous = { CLIENT_ID: process.env.CLIENT_ID, DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET, SITE_DISCORD_REDIRECT_URI: process.env.SITE_DISCORD_REDIRECT_URI };
  const previousFetch = globalThis.fetch;
  process.env.CLIENT_ID = 'test-discord-client';
  process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.SITE_DISCORD_REDIRECT_URI = 'https://frierenbot.vercel.app/site/discord/callback';
  globalThis.fetch = async url => String(url).includes('/oauth2/token')
    ? { ok: true, json: async () => ({ access_token: 'temporary-discord-token' }) }
    : { ok: true, json: async () => ({ id: '123456789012345678', username: 'Frieren', avatar: 'avatarhash' }) };
  const accountId = '123e4567-e89b-42d3-a456-426614174000';
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes('INSERT INTO frieren_site_accounts')) return { rows: [{ id: accountId }], rowCount: 1 };
      if (String(sql).includes('SELECT account_id FROM frieren_site_discord_accounts')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const db = { async query(sql, params) { return client.query(sql, params); }, async connect() { return client; } };
  try {
    const stateRes = response();
    await handleSiteAuthRequest({ method: 'GET', url: '/site/discord/login', headers: {} }, stateRes, { db, sessionSecret: secret });
    const stateCookie = decodeURIComponent(stateRes.headers['Set-Cookie'].split(';')[0].split('=').slice(1).join('='));
    const state = new URL(stateRes.headers.Location).searchParams.get('state');
    const callback = response();
    await handleSiteAuthRequest({
      method: 'GET',
      url: '/site/discord/callback?code=valid-code&state=' + encodeURIComponent(state),
      headers: { cookie: 'frieren_site_oauth_state=' + encodeURIComponent(stateCookie) }
    }, callback, { db, sessionSecret: secret, createSession: createPublicSiteSession });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.Location, '/');
    const cookies = callback.headers['Set-Cookie'];
    const sessionCookie = cookies.find(value => value.startsWith('frieren_site_session='));
    assert.ok(sessionCookie);
    const token = decodeURIComponent(sessionCookie.split(';')[0].slice('frieren_site_session='.length));
    const session = readPublicSiteSession(token, secret);
    assert.equal(session.id, 'site_' + accountId);
    assert.equal(session.username, 'Frieren');
    assert.ok(queries.some(item => item.sql.includes('INSERT INTO frieren_site_accounts')));
    assert.ok(queries.some(item => item.sql.includes('INSERT INTO frieren_site_discord_accounts')));
    assert.ok(queries.some(item => item.sql === 'COMMIT'));
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Discord OAuth callback rejects a state value not bound to its browser cookie', async () => {
  const res = response();
  await handleSiteAuthRequest({ method: 'GET', url: '/site/discord/callback?code=invalid&state=forged', headers: {} }, res, { db: fakeDb(), sessionSecret: secret, createSession: createPublicSiteSession });
  assert.equal(res.status, 303);
  assert.equal(res.headers.Location, '/login?status=discord_error');
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});

test('password and registration POST endpoints are disabled without database access', async () => {
  for (const path of ['/login','/register','/forgot-password','/reset-password','/verify-email','/resend-verification']) {
    const db = fakeDb();
    const res = response();
    const req = { method: 'POST', url: path, headers: { 'content-type': 'application/x-www-form-urlencoded' }, async *[Symbol.asyncIterator]() { yield Buffer.from('username=legacy&password=unused'); } };
    assert.equal(await handleSiteAuthRequest(req, res, { db, sessionSecret: secret, createSession: createPublicSiteSession }), true, path);
    assert.ok([303,405].includes(res.status), path);
    assert.equal(db.calls.length, 0, path);
  }
});
