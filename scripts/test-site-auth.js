import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiteUsername, validateSiteEmail, hashSitePassword, verifySitePassword,
  createSiteCsrfToken, verifySiteCsrfToken, consumeSmtpBuffer, smtpFailureDetails, sendGmailApi, handleSiteAuthRequest
} from '../site-auth.js';
import { createPublicSiteSession, readPublicSiteSession } from '../owner-dashboard.js';

const secret = 'site-auth-test-secret-with-at-least-32-characters';

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
    name: 'Error', code: 'ECONNRESET', syscall: 'connect', message: 'connect failed for [redacted-email]'
  });
  assert.deepEqual(smtpFailureDetails('unexpected transport failure'), {
    name: 'NonErrorThrow', code: null, syscall: null, message: 'unexpected transport failure'
  });
  assert.deepEqual(smtpFailureDetails(undefined), {
    name: 'NonErrorThrow', code: null, syscall: null, message: 'Unknown SMTP failure'
  });
});

test('Gmail HTTPS API refreshes OAuth credentials and sends MIME content without SMTP', async () => {
  const keys = ['SITE_SMTP_USER','SITE_GMAIL_CLIENT_ID','SITE_GMAIL_CLIENT_SECRET','SITE_GMAIL_REFRESH_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.SITE_SMTP_USER = 'frieren.portal@gmail.com';
  process.env.SITE_GMAIL_CLIENT_ID = 'test-client-id';
  process.env.SITE_GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.SITE_GMAIL_REFRESH_TOKEN = 'test-refresh-token';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.match(String(options.body), /grant_type=refresh_token/);
      return { ok: true, async json() { return { access_token: 'test-access-token' }; } };
    }
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(options.headers.authorization, 'Bearer test-access-token');
    const payload = JSON.parse(options.body);
    assert.match(payload.raw, /^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(payload.raw, 'base64url').toString('utf8');
    assert.match(decoded, /To: receiver@example.com/);
    assert.match(decoded, new RegExp(Buffer.from('Frieren doğrulama').toString('base64')));
    return { ok: true, async json() { return { id: 'gmail-message-id' }; } };
  };
  try {
    assert.equal(await sendGmailApi('receiver@example.com','Frieren doğrulama','<p>Doğrula</p>','Doğrula'),'gmail-message-id');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('Gmail HTTPS API reports HTTP failures without exposing response bodies', async () => {
  const keys = ['SITE_SMTP_USER','SITE_GMAIL_CLIENT_ID','SITE_GMAIL_CLIENT_SECRET','SITE_GMAIL_REFRESH_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.SITE_SMTP_USER = 'frieren.portal@gmail.com';
  process.env.SITE_GMAIL_CLIENT_ID = 'test-client-id';
  process.env.SITE_GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.SITE_GMAIL_REFRESH_TOKEN = 'test-refresh-token';
  globalThis.fetch = async () => ({ ok: false, status: 401, async json() { return { error: 'invalid_grant', secret: 'must-not-log' }; } });
  try {
    await assert.rejects(() => sendGmailApi('receiver@example.com','Subject','<p>HTML</p>','Text'), /GMAIL_OAUTH_HTTP_401/);
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
  assert.equal(validateSiteEmail('  User@Example.com '), 'user@example.com');
  assert.equal(validateSiteEmail('not-an-email'), null);
});

test('password hashing uses salted scrypt and verifies only the matching password', async () => {
  const stored = await hashSitePassword('correct horse battery staple');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifySitePassword('correct horse battery staple', stored), true);
  assert.equal(await verifySitePassword('incorrect password', stored), false);
  await assert.rejects(() => hashSitePassword('short'), /INVALID_PASSWORD_LENGTH/);
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

test('login and registration pages are served by the password account handler', async () => {
  const db = fakeDb();
  for (const [path, field] of [['/login', 'current-password'], ['/register', 'new-password']]) {
    const res = response();
    assert.equal(await handleSiteAuthRequest({ method: 'GET', url: path, headers: {} }, res, { db, sessionSecret: secret }), true);
    assert.equal(res.status, 200);
    assert.match(res.body, /Frieren/);
    assert.match(res.body, new RegExp(field));
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
