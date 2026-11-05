import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiteUsername, validateSiteEmail, validateSiteLoginIdentifier, hashSitePassword, verifySitePassword,
  createSiteCsrfToken, verifySiteCsrfToken, consumeSmtpBuffer, smtpFailureDetails, sendGmailApi, handleSiteAuthRequest, isSameOriginRequest
} from '../site-auth.js';
import { createPublicSiteSession, readPublicSiteSession } from '../owner-dashboard.js';

const secret = 'site-auth-test-secret-with-at-least-32-characters';

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
  assert.equal(isSameOriginRequest({ headers: {} }, 'https://site.example'), true);
});


function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
}
function post(path, fields) {
  const body = new URLSearchParams(fields).toString();
  return { method: 'POST', url: path, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.10' }, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } };
}
function fakeDb() {
  const calls = [];
  return { calls, async query(sql, params = []) { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
}


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

test('registration form does not write account data before Gmail SMTP is configured', async () => {
  const previousUser = process.env.SITE_SMTP_USER;
  const previousPassword = process.env.SITE_SMTP_APP_PASSWORD;
  delete process.env.SITE_SMTP_USER;
  delete process.env.SITE_SMTP_APP_PASSWORD;
  const db = fakeDb();
  const csrf = createSiteCsrfToken(secret);
  const req = post('/register', {
    csrf, username: 'Gezgin01', email: 'gezgin@example.com',
    password: 'a-secure-password', confirmPassword: 'a-secure-password'
  });
  const res = response();
  try {
    assert.equal(await handleSiteAuthRequest(req, res, {
      db, sessionSecret: secret,
      createSession: createPublicSiteSession
    }), true);
    assert.equal(res.status, 503);
    assert.match(res.body, /Gmail API bağlantısını tamamlamalı/);
    assert.equal(db.calls.filter(call => call.sql.includes('INSERT INTO frieren_site_accounts')).length, 0);
  } finally {
    if (previousUser === undefined) delete process.env.SITE_SMTP_USER;
    else process.env.SITE_SMTP_USER = previousUser;
    if (previousPassword === undefined) delete process.env.SITE_SMTP_APP_PASSWORD;
    else process.env.SITE_SMTP_APP_PASSWORD = previousPassword;
  }
});

test('login and registration pages enforce 48px auth controls with a high-specificity cross-engine rule', async () => {
  const db = fakeDb();
  for (const path of ['/login', '/register']) {
    const res = response();
    assert.equal(await handleSiteAuthRequest({ method: 'GET', url: path, headers: {} }, res, { db, sessionSecret: secret }), true);
    assert.equal(res.status, 200);
    assert.match(res.body, /\.auth-wrap \.auth-card input:not\(\[type="hidden"\]\)/);
    assert.match(res.body, /min-height:48px!important;height:48px!important/);
    assert.match(res.body, /\.auth-wrap \.auth-card button/);
  }
});

test('login and registration pages are served by the password account handler', async () => {
  const db = fakeDb();
  for (const [path, field] of [['/login', 'current-password'], ['/register', 'new-password']]) {
    const res = response();
    assert.equal(await handleSiteAuthRequest({ method: 'GET', url: path, headers: {} }, res, { db, sessionSecret: secret }), true);
    assert.equal(res.status, 200);
    assert.match(res.body, /Frieren/);
    assert.match(res.body, new RegExp(field));
    if (path === '/login') assert.match(res.body, /Kullanıcı adı veya e-mail/);
  }
});

test('invalid CSRF token blocks account registration before database writes', async () => {
  const db = fakeDb();
  const req = post('/register', {
    csrf: 'forged-token', username: 'Gezgin02', email: 'gezgin2@example.com',
    password: 'a-secure-password', confirmPassword: 'a-secure-password'
  });
  const res = response();
  assert.equal(await handleSiteAuthRequest(req, res, { db, sessionSecret: secret, createSession: createPublicSiteSession }), true);
  assert.equal(res.status, 403);
  assert.match(res.body, /Formun süresi doldu/);
  assert.equal(db.calls.filter(call => call.sql.includes('INSERT INTO frieren_site_accounts')).length, 0);
});

test('cross-origin account POST is rejected before schema or account database queries', async () => {
  const db = fakeDb();
  const req = post('/register', {
    csrf: createSiteCsrfToken(secret), username: 'Gezgin03', email: 'gezgin3@example.com',
    password: 'a-secure-password', confirmPassword: 'a-secure-password'
  });
  req.headers.origin = 'https://attacker.example';
  req.headers.host = 'frierenbot.vercel.app';
  req.headers['x-forwarded-proto'] = 'https';
  req.headers['sec-fetch-site'] = 'cross-site';
  const res = response();
  assert.equal(await handleSiteAuthRequest(req, res, { db, sessionSecret: secret, createSession: createPublicSiteSession }), true);
  assert.equal(res.status, 403);
  assert.equal(db.calls.length, 0, 'cross-origin requests must be rejected before schema queries or writes');
});

test('password reset request returns the same generic response without exposing account existence', async () => {
  const db = fakeDb();
  const req = post('/forgot-password', { csrf: createSiteCsrfToken(secret), email: 'unknown@example.com' });
  const res = response();
  const previousUser = process.env.SITE_SMTP_USER;
  const previousPassword = process.env.SITE_SMTP_APP_PASSWORD;
  delete process.env.SITE_SMTP_USER;
  delete process.env.SITE_SMTP_APP_PASSWORD;
  try {
    assert.equal(await handleSiteAuthRequest(req, res, { db, sessionSecret: secret, createSession: createPublicSiteSession }), true);
    assert.equal(res.status, 200);
    assert.match(res.body, /Adres sistemde kayıtlıysa gerekli bağlantı gönderildi/);
    assert.doesNotMatch(res.body, /unknown@example\.com/);
  } finally {
    if (previousUser === undefined) delete process.env.SITE_SMTP_USER;
    else process.env.SITE_SMTP_USER = previousUser;
    if (previousPassword === undefined) delete process.env.SITE_SMTP_APP_PASSWORD;
    else process.env.SITE_SMTP_APP_PASSWORD = previousPassword;
  }
});


test('site account required notice is shown when a Discord-only session opens the player portal', async () => {
  const res = response();
  assert.equal(await handleSiteAuthRequest({ method: 'GET', url: '/login?status=site_account_required', headers: {} }, res, {
    db: fakeDb(), sessionSecret: secret, createSession: createPublicSiteSession
  }), true);
  assert.equal(res.status, 200);
  assert.match(res.body, /Maceracı paneli için önce Frieren web hesabınla giriş yap/);
  assert.match(res.body, /href="\/register"/);
});
