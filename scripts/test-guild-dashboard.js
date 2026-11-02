import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuildOAuthState, verifyGuildOAuthState, encryptGuildOAuthToken,
  decryptGuildOAuthToken, filterManageableBotGuilds, handleGuildDashboardRequest
} from '../guild-dashboard.js';

const secret = 'frieren-guild-dashboard-test-secret-with-at-least-32-characters';
const accountId = 'site_123e4567-e89b-12d3-a456-426614174000';
const guildA = '1539562273197260860';
const guildB = '1564945192803639356';

function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
function request(method, url, fields = {}, cookie = '') {
  const body = new URLSearchParams(fields).toString();
  return {
    method, url, headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    async *[Symbol.asyncIterator]() { if (method === 'POST') yield Buffer.from(body); }
  };
}
function fakeDb() {
  const calls = [];
  return { calls, async query(sql, params = []) { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
}

test('guild OAuth state is signed, account-bound and expires after ten minutes', () => {
  const now = 1_800_000_000_000;
  const state = createGuildOAuthState(secret, accountId, now, 'nonce-for-guild-oauth-state');
  assert.equal(verifyGuildOAuthState(state, secret, accountId, now + 1000), true);
  assert.equal(verifyGuildOAuthState(state, secret, 'site_223e4567-e89b-12d3-a456-426614174000', now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, 'another-secret-with-at-least-32-characters', accountId, now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, secret, accountId, now + 11 * 60 * 1000), false);
  assert.equal(verifyGuildOAuthState(state + 'x', secret, accountId, now + 1000), false);
});

test('Discord OAuth tokens are encrypted with authenticated encryption and reject tampering', () => {
  const encrypted = encryptGuildOAuthToken('discord-access-token', secret, Buffer.alloc(12, 9));
  assert.equal(decryptGuildOAuthToken(encrypted, secret), 'discord-access-token');
  assert.notEqual(encrypted, 'discord-access-token');
  assert.throws(() => decryptGuildOAuthToken(encrypted, 'wrong-secret-with-at-least-32-characters'));
  const parts = encrypted.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => decryptGuildOAuthToken(parts.join('.'), secret));
});

test('guild selector only returns servers where the bot is installed and user can manage them', () => {
  const guilds = [
    { id: guildA, name: 'Owner Guild', owner: true, permissions: '0' },
    { id: guildB, name: 'Manage Guild', owner: false, permissions: '32' },
    { id: '1564945192803639357', name: 'Administrator', owner: false, permissions: '8' },
    { id: '1564945192803639358', name: 'No permission', owner: false, permissions: '0' },
    { id: '1564945192803639359', name: 'Bot absent', owner: true, permissions: '0' }
  ];
  const result = filterManageableBotGuilds(guilds, new Set([guildA, guildB, '1564945192803639357', '1564945192803639358']));
  assert.deepEqual(result.map(guild => guild.id), [guildA, guildB, '1564945192803639357']);
});

test('guild selector rejects malformed identifiers and permission values', () => {
  const result = filterManageableBotGuilds([
    { id: 'bad-id', name: 'Malformed', owner: true },
    { id: '1564945192803639357', name: 'Bad permissions', owner: false, permissions: 'not-a-number' }
  ], new Set(['bad-id', '1564945192803639357']));
  assert.deepEqual(result, []);
});

test('anonymous users cannot view the guild dashboard', async () => {
  const res = response();
  assert.equal(await handleGuildDashboardRequest(request('GET', '/guilds'), res, { db: fakeDb(), sessionSecret: secret }), true);
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, '/login');
});

test('forged CSRF token cannot disconnect a Discord account or write settings', async () => {
  const db = fakeDb();
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  assert.equal(await handleGuildDashboardRequest(request('POST', '/guilds/disconnect', { csrf: 'forged' }), res, { db, user, sessionSecret: secret }), true);
  assert.equal(res.status, 403);
  assert.equal(db.calls.length, 0);
});

test('invalid guild IDs and feature keys are rejected before database writes', async () => {
  const db = fakeDb();
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  assert.equal(await handleGuildDashboardRequest(request('POST', '/guilds/settings', {
    csrf: 'forged', guildId: 'not-a-snowflake', featureKey: 'commands', enabled: 'yes'
  }), res, { db, user, sessionSecret: secret }), true);
  assert.equal(res.status, 403);
  assert.equal(db.calls.length, 0);
});

test('guild dashboard refuses oversized form bodies', async () => {
  const db = fakeDb();
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  const req = { method: 'POST', url: '/guilds/disconnect', headers: { 'content-type': 'application/x-www-form-urlencoded' }, async *[Symbol.asyncIterator]() { yield Buffer.alloc(9000, 65); } };
  assert.equal(await handleGuildDashboardRequest(req, res, { db, user, sessionSecret: secret }), true);
  assert.equal(res.status, 400);
  assert.equal(db.calls.length, 0);
});
