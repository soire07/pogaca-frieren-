import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptGuildOAuthToken, decryptGuildOAuthToken,
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

test('feature setting changes require a freshly verified Discord-managed guild', async () => {
  const db = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT account_key,discord_user_id,access_token_enc,refresh_token_enc,expires_at')) {
        return { rows: [{
          account_key: accountId,
          discord_user_id: '123456789012345678',
          access_token_enc: encryptGuildOAuthToken('valid-access-token', secret),
          refresh_token_enc: encryptGuildOAuthToken('valid-refresh-token', secret),
          expires_at: new Date(Date.now() + 60 * 60 * 1000)
        }], rowCount: 1 };
      }
      if (String(sql).includes('INSERT INTO guild_feature_settings')) {
        return { rows: [{ guild_id: guildA, feature_key: 'rpg', enabled: false }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  const csrf = createGuildDashboardCsrf(secret, accountId);
  const fetchImpl = async () => ({ ok: true, async json() {
    return [{ id: guildA, name: 'Frieren Test Loncası', owner: true, permissions: '0' }];
  } });
  await handleGuildDashboardRequest(request('POST', '/guilds/settings', {
    csrf, guildId: guildA, featureKey: 'rpg', enabled: 'no'
  }), res, { db, user, sessionSecret: secret, client: { guilds: { cache: new Map([[guildA, {}]]) } }, fetchImpl });
  assert.equal(res.status, 303);
  assert.equal(res.headers.Location, '/guilds/' + guildA + '?status=saved');
  const write = db.calls.find(call => call.sql.includes('INSERT INTO guild_feature_settings'));
  assert.ok(write);
  assert.deepEqual(write.params, [guildA, 'rpg', false, '123456789012345678']);
});

test('feature settings cannot be changed for a server without the bot or Manage Guild permission', async () => {
  const db = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT account_key,discord_user_id,access_token_enc,refresh_token_enc,expires_at')) {
        return { rows: [{
          account_key: accountId,
          discord_user_id: '123456789012345678',
          access_token_enc: encryptGuildOAuthToken('valid-access-token', secret),
          refresh_token_enc: encryptGuildOAuthToken('valid-refresh-token', secret),
          expires_at: new Date(Date.now() + 60 * 60 * 1000)
        }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  const csrf = createGuildDashboardCsrf(secret, accountId);
  const fetchImpl = async () => ({ ok: true, async json() {
    return [{ id: guildB, name: 'Yetkisiz Lonca', owner: false, permissions: '0' }];
  } });
  await handleGuildDashboardRequest(request('POST', '/guilds/settings', {
    csrf, guildId: guildB, featureKey: 'rpg', enabled: 'no'
  }), res, { db, user, sessionSecret: secret, client: { guilds: { cache: new Map([[guildA, {}]]) } }, fetchImpl });
  assert.equal(res.status, 403);
  assert.equal(db.calls.some(call => call.sql.includes('INSERT INTO guild_feature_settings')), false);
});

test('Discord account connection redirects through the existing owner OAuth callback', async () => {
  const res = response();
  const user = { id: accountId, username: 'Gezgin' };
  await handleGuildDashboardRequest(request('GET', '/guilds/connect'), res, {
    db: fakeDb(), user, sessionSecret: secret
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, '/owner/login?flow=guilds');
  assert.match(res.headers['Cache-Control'], /no-store/);
});
