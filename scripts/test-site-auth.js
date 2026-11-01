import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiteUsername, validateSiteEmail, hashSitePassword, verifySitePassword,
  createSiteCsrfToken, verifySiteCsrfToken, consumeSmtpBuffer, handleSiteAuthRequest
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

test('SMTP reply parser handles split CRLF chunks and multiline Gmail responses', () => {
  const first = consumeSmtpBuffer('220-smtp.gmail.com ESMTP\r');
  assert.equal(first.buffer, '\r');
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
    assert.match(res.body, /Gmail SMTP ayarlarını tamamlamalı/);
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
