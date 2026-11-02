import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuildOAuthState, verifyGuildOAuthState, encryptGuildOAuthToken, decryptGuildOAuthToken,
  filterManageableBotGuilds, handleGuildDashboardRequest, createGuildDashboardCsrf,
  verifyGuildDashboardCsrf, saveGuildDiscordConnection
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
  assert.throws(() => createGuildOAuthState(secret, 'not-an-account', now));
});

test('Discord OAuth tokens use authenticated encryption and reject tampering', () => {
  const encrypted = encryptGuildOAuthToken('discord-access-token', secret, Buffer.alloc(12, 9));
  assert.equal(decryptGuildOAuthToken(encrypted, secret), 'discord-access-token');
  assert.notEqual(encrypted, 'discord-access-token');
  assert.throws(() => decryptGuildOAuthToken(encrypted, 'wrong-secret-with-at-least-32-characters'));
  const parts = encrypted.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => decryptGuildOAuthToken(parts.join('.'), secret));
});

test('guild dashboard CSRF tokens are account-bound and expire', () => {
  const now = 1_800_000_000_000;
  const token = createGuildDashboardCsrf(secret, accountId, now, 'csrf-token-nonce-with-valid-length');
  assert.equal(verifyGuildDashboardCsrf(token, secret, accountId, now + 1000), true);
  assert.equal(verifyGuildDashboardCsrf(token, secret, 'site_223e4567-e89b-12d3-a456-426614174000', now + 1000), false);
  assert.equal(verifyGuildDashboardCsrf(token, secret, accountId, now + 3 * 60 * 60 * 1000), false);
  assert.equal(verifyGuildDashboardCsrf(token + 'x', secret, accountId, now + 1000), false);
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

test('Discord connection tokens are encrypted before being persisted', async () => {
  const db = fakeDb();
  const result = await saveGuildDiscordConnection(db, {
    accountId, discordUserId: '123456789012345678',
    accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresIn: 3600
  }, secret);
  assert.equal(result.discordUserId, '123456789012345678');
  const insert = db.calls.find(call => call.sql.includes('INSERT INTO frieren_site_discord_connections'));
  assert.ok(insert);
  assert.notEqual(insert.params[2], 'access-secret');
  assert.notEqual(insert.params[3], 'refresh-secret');
  assert.equal(decryptGuildOAuthToken(insert.params[2], secret), 'access-secret');
  assert.equal(decryptGuildOAuthToken(insert.params[3], secret), 'refresh-secret');
});

test('invalid site accounts and Discord identities cannot persist OAuth credentials', async () => {
  const db = fakeDb();
  await assert.rejects(saveGuildDiscordConnection(db, {
    accountId: 'someone-else', discordUserId: '123456789012345678',
    accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600
  }, secret), /INVALID_GUILD_DASHBOARD_ACCOUNT/);
  await assert.rejects(saveGuildDiscordConnection(db, {
    accountId, discordUserId: 'not-a-snowflake',
    accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600
  }, secret), /INVALID_GUILD_DISCORD_CONNECTION/);
  assert.equal(db.calls.length, 0);
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
  const csrf = createGuildDashboardCsrf(secret, accountId);
  assert.equal(await handleGuildDashboardRequest(request('POST', '/guilds/settings', {
    csrf, guildId: 'not-a-snowflake', featureKey: 'commands', enabled: 'yes'
  }), res, { db, user, sessionSecret: secret }), true);
  assert.equal(res.status, 400);
  assert.equal(db.calls.length, 0);
});

test('guild dashboard refuses oversized form bodies', async () => {
  const db = fakeDb();
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  const req = { method: 'POST', url: '/guilds/disconnect', headers: { 'content-type': 'application/x-www-form-urlencoded' }, async *[Symbol.asyncIterator]() { yield Buffer.alloc(9000, 65); } };
  assert.equal(await handleGuildDashboardRequest(req, res, { db, user, sessionSecret: secret }), true);
  assert.equal(res.status, 413);
  assert.equal(db.calls.length, 0);
});

test('OAuth callback stores encrypted tokens and is bound to the active site account', async () => {
  const db = fakeDb();
  const connectResponse = response();
  const user = { id: accountId, username: 'Gezgin' };
  const oldClient = process.env.CLIENT_ID;
  const oldSecret = process.env.DISCORD_CLIENT_SECRET;
  process.env.CLIENT_ID = '123456789012345678';
  process.env.DISCORD_CLIENT_SECRET = 'discord-oauth-client-secret';
  try {
    await handleGuildDashboardRequest(request('GET', '/guilds/connect'), connectResponse, { db, user, sessionSecret: secret });
    assert.equal(connectResponse.status, 302);
    const authorization = new URL(connectResponse.headers.Location);
    assert.equal(authorization.searchParams.get('scope'), 'identify guilds');
    const state = authorization.searchParams.get('state');
    assert.equal(verifyGuildOAuthState(state, secret, accountId), true);
    const cookieHeader = connectResponse.headers['Set-Cookie'].split(';')[0];
    const callback = response();
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes('/oauth2/token')) return { ok: true, async json() {
        return { access_token: 'discord-access-secret', refresh_token: 'discord-refresh-secret', expires_in: 3600 };
      } };
      return { ok: true, async json() { return { id: '123456789012345678' }; } };
    };
    await handleGuildDashboardRequest(request('GET', '/guilds/callback?code=oauth-code&state=' + encodeURIComponent(state), {}, cookieHeader), callback, {
      db, user, sessionSecret: secret, fetchImpl
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.Location, '/guilds');
    assert.equal(calls.length, 2);
    const insert = db.calls.find(call => call.sql.includes('INSERT INTO frieren_site_discord_connections'));
    assert.ok(insert);
    assert.equal(decryptGuildOAuthToken(insert.params[2], secret), 'discord-access-secret');
    assert.equal(decryptGuildOAuthToken(insert.params[3], secret), 'discord-refresh-secret');
  } finally {
    if (oldClient === undefined) delete process.env.CLIENT_ID; else process.env.CLIENT_ID = oldClient;
    if (oldSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = oldSecret;
  }
});

test('OAuth callback rejects another account state before contacting Discord', async () => {
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  const other = 'site_223e4567-e89b-12d3-a456-426614174000';
  const state = createGuildOAuthState(secret, other);
  let called = false;
  await handleGuildDashboardRequest(request('GET', '/guilds/callback?code=oauth-code&state=' + encodeURIComponent(state), {}, 'frieren_guild_oauth_state=' + encodeURIComponent(state)), res, {
    db: fakeDb(), user, sessionSecret: secret, fetchImpl: async () => { called = true; throw new Error('unexpected network request'); }
  });
  assert.equal(res.status, 400);
  assert.equal(called, false);
});
