import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasManageGuildPermission,
  filterManageableGuilds,
  createGuildOAuthState,
  verifyGuildOAuthState,
  encryptDiscordOAuthToken,
  decryptDiscordOAuthToken,
  GUILD_FEATURE_CATALOG,
  initGuildDashboardSchema,
  handleGuildDashboardRequest,
} from '../guild-dashboard.js';
import { createPublicSiteSession, buildPublicSiteSessionCookie } from '../owner-dashboard.js';
import { createSiteCsrfToken } from '../site-auth.js';

const secret = 'frieren-guild-dashboard-test-secret-at-least-32-characters';
const owner = 'site_123e4567-e89b-12d3-a456-426614174000';

test('Discord guild permission checks accept Manage Guild and Administrator only', () => {
  assert.equal(hasManageGuildPermission('32'), true);
  assert.equal(hasManageGuildPermission('8'), true);
  assert.equal(hasManageGuildPermission('40'), true);
  assert.equal(hasManageGuildPermission('0'), false);
  assert.equal(hasManageGuildPermission('4'), false);
  assert.equal(hasManageGuildPermission('not-a-number'), false);
  assert.equal(hasManageGuildPermission(null), false);
});

test('guild list filters inaccessible guilds and marks whether Frieren bot is present', () => {
  const result = filterManageableGuilds([
    { id: '1539562273197260860', name: 'Main', permissions: '32', icon: 'abc' },
    { id: '1564945192803639356', name: 'Test', permissions: '8', icon: null },
    { id: '1564945192803639357', name: 'No access', permissions: '4' },
    { id: 'invalid', name: 'Invalid', permissions: '32' },
  ], new Set(['1539562273197260860']));
  assert.deepEqual(result.map(g => [g.id, g.botPresent]), [
    ['1539562273197260860', true],
    ['1564945192803639356', false],
  ]);
});

test('Discord OAuth state is account-bound, signed, and expires', () => {
  const now = 1_800_000_000_000;
  const state = createGuildOAuthState(owner, secret, now);
  assert.equal(verifyGuildOAuthState(state, owner, secret, now + 1000), true);
  assert.equal(verifyGuildOAuthState(state, 'site_other-account', secret, now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, owner, 'another-secret-that-is-long-enough', now + 1000), false);
  assert.equal(verifyGuildOAuthState(state, owner, secret, now + 11 * 60 * 1000), false);
  assert.equal(verifyGuildOAuthState(state + 'x', owner, secret, now + 1000), false);
});

test('Discord OAuth tokens are encrypted at rest and authenticated on decrypt', () => {
  const encrypted = encryptDiscordOAuthToken('discord-access-token', secret);
  assert.notEqual(encrypted, 'discord-access-token');
  assert.equal(decryptDiscordOAuthToken(encrypted, secret), 'discord-access-token');
  assert.throws(() => decryptDiscordOAuthToken(encrypted, 'another-secret-that-is-long-enough'), /INVALID_DISCORD_TOKEN_CIPHERTEXT/);
  assert.throws(() => decryptDiscordOAuthToken(encrypted + 'x', secret), /INVALID_DISCORD_TOKEN_CIPHERTEXT/);
});

test('guild dashboard catalog only exposes working toggles and labels future entertainment modules as planned', () => {
  const active = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'ready');
  const planned = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'planned');
  assert.ok(active.some(feature => feature.key === 'animeQuiz'));
  assert.ok(active.some(feature => feature.key === 'collection'));
  assert.ok(active.some(feature => feature.key === 'dailyRewards'));
  assert.ok(planned.some(feature => feature.id === 'pets'));
  assert.ok(planned.some(feature => feature.id === 'fishing'));
  assert.ok(planned.some(feature => feature.id === 'miniGames'));
  assert.ok(planned.every(feature => !feature.key));
});

const sessionToken = () => createPublicSiteSession(secret, {
  id: owner, username: 'Gezgin'
}, Math.floor(Date.now() / 1000) + 3600);
function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}
function siteRequest(path, method = 'GET', body = '') {
  const cookie = buildPublicSiteSessionCookie(sessionToken(), 3600).split(';')[0];
  return {
    method, url: path, headers: {
      cookie,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); }
  };
}
function linkedDb({ writes = [] } = {}) {
  const access = encryptDiscordOAuthToken('access-token', secret);
  const refresh = encryptDiscordOAuthToken('refresh-token', secret);
  return {
    writes,
    async query(sql, params = []) {
      if (sql.includes('SELECT discord_user_id')) return { rows: [{
        discord_user_id: '111111111111111111', discord_username: 'GezginDiscord',
        avatar_hash: null, access_token_encrypted: access, refresh_token_encrypted: refresh,
        expires_at: new Date(Date.now() + 3600_000)
      }], rowCount: 1 };
      if (sql.includes('INSERT INTO guild_feature_settings')) {
        writes.push({ sql, params });
        return { rows: [{ guild_id: params[0], feature_key: params[1], enabled: params[2] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}
const env = {
  ADMIN_SESSION_SECRET: secret,
  CLIENT_ID: '222222222222222222',
  DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
  GUILD_DASHBOARD_REDIRECT_URI: 'https://frierenbot.vercel.app/discord/callback'
};
const discordFetch = async () => ({
  ok: true,
  async json() { return [{
    id: '1539562273197260860', name: 'Goose Goose Duck Türkiye',
    permissions: '32', icon: null
  }]; }
});
const discordClient = { guilds: { cache: { keys: () => ['1539562273197260860'] } } };

test('guild dashboard schema is additive and does not touch RPG tables', async () => {
  const calls = [];
  await initGuildDashboardSchema({ async query(sql) { calls.push(sql); return { rows: [], rowCount: 0 }; } });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /CREATE TABLE IF NOT EXISTS frieren_site_discord_links/);
  assert.doesNotMatch(calls.join(' '), /DROP TABLE|DELETE FROM users|ALTER TABLE users/i);
});

test('guild dashboard redirects anonymous users to the existing site login', async () => {
  const res = response();
  assert.equal(await handleGuildDashboardRequest({ method: 'GET', url: '/lonca', headers: {} }, res, { db: { query: async () => ({ rows: [] }) }, env }), true);
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, '/login');
});

test('guild dashboard asks an authenticated site member to link Discord before listing servers', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const res = response();
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  assert.equal(await handleGuildDashboardRequest(siteRequest('/lonca'), res, { db, env }), true);
  assert.equal(res.status, 200);
  assert.match(res.body, /Sunucunu loncaya bağla/);
  assert.match(res.body, /Discord hesabını bağla/);
});

test('guild dashboard lists only manageable servers where the bot is installed', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const res = response();
  assert.equal(await handleGuildDashboardRequest(siteRequest('/lonca'), res, {
    db: linkedDb(), env, client: discordClient, fetchImpl: discordFetch
  }), true);
  assert.equal(res.status, 200);
  assert.match(res.body, /Goose Goose Duck Türkiye/);
  assert.match(res.body, /Poğaça Frieren bağlı/);
  assert.match(res.body, /Lonca panelini aç/);
});

test('guild dashboard writes a feature override only after Discord permission and CSRF checks', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const db = linkedDb();
  const res = response();
  assert.equal(await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body), res, {
    db, env, client: discordClient, fetchImpl: discordFetch
  }), true);
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, '/lonca/1539562273197260860?saved=1');
  assert.equal(db.writes.length, 1);
  assert.deepEqual(db.writes[0].params, ['1539562273197260860', 'animeQuiz', false, '111111111111111111']);
});

test('guild dashboard rejects feature changes from a Discord member without Manage Guild', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const db = linkedDb();
  const noPermissionFetch = async () => ({
    ok: true,
    async json() { return [{
      id: '1539562273197260860', name: 'Goose Goose Duck Türkiye', permissions: '4'
    }]; }
  });
  const res = response();
  await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body), res, {
    db, env, client: discordClient, fetchImpl: noPermissionFetch
  });
  assert.equal(res.status, 403);
  assert.equal(db.writes.length, 0);
});

test('guild dashboard refuses to expose planned entertainment modules as active toggles', async () => {
  assert.equal(GUILD_FEATURE_CATALOG.find(feature => feature.id === 'pets').status, 'planned');
  assert.equal(GUILD_FEATURE_CATALOG.find(feature => feature.id === 'pets').key, null);
  assert.equal(GUILD_FEATURE_CATALOG.find(feature => feature.id === 'miniGames').key, null);
});


test('guild settings explain that disabling a module blocks new sessions but lets active encounters settle safely', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const res = response();
  await handleGuildDashboardRequest(siteRequest('/lonca/1539562273197260860'), res, {
    db: linkedDb(), env, client: discordClient, fetchImpl: discordFetch
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /Yeni oturumları engeller/i);
  assert.match(res.body, /devam eden.*tamamlanır/i);
});
