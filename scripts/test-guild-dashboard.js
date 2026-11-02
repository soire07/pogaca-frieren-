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
function siteRequest(path, method = 'GET', body = '', extraHeaders = {}) {
  const cookie = buildPublicSiteSessionCookie(sessionToken(), 3600).split(';')[0];
  return {
    method, url: path, headers: {
      cookie,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...extraHeaders
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
  assert.equal(calls.length, 3);
  assert.match(calls[0], /CREATE TABLE IF NOT EXISTS frieren_site_discord_links/);
  assert.match(calls[2], /CREATE TABLE IF NOT EXISTS frieren_site_oauth_states/);
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


test('competitor-inspired wishlist, companion home, and guild rewards remain roadmap-only until implemented', () => {
  for (const id of ['characterWishlist', 'companionHome', 'guildRewardStore']) {
    const feature = GUILD_FEATURE_CATALOG.find(item => item.id === id);
    assert.ok(feature, id + ' should be visible in the roadmap');
    assert.equal(feature.status, 'planned');
    assert.equal(feature.key, null, id + ' must not expose a live toggle before implementation');
  }
});


test('Discord OAuth state is consumed atomically once and cannot be replayed', async () => {
  const { consumeGuildOAuthState } = await import('../guild-dashboard.js');
  const state = createGuildOAuthState(owner, secret);
  const calls = [];
  let available = true;
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      assert.match(sql, /DELETE FROM frieren_site_oauth_states/i);
      assert.match(sql, /state_hash=\$1 AND account_id=\$2 AND expires_at>NOW\(\)/i);
      if (available && params[0] && params[1] === owner) {
        available = false;
        return { rows: [{ account_id: owner }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  assert.equal(await consumeGuildOAuthState(db, state, owner, secret), true);
  assert.equal(await consumeGuildOAuthState(db, state, owner, secret), false);
  assert.equal(await consumeGuildOAuthState(db, state, 'site_other-account', secret), false);
  assert.equal(calls.length, 2);
});


test('Discord OAuth callback consumes the stored state before exchanging the code and rejects replay', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  let storedHash = null;
  let consumed = false;
  let tokenExchanges = 0;
  let linkWrites = 0;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('DELETE FROM frieren_site_oauth_states WHERE expires_at')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO frieren_site_oauth_states')) {
        storedHash = params[0];
        assert.match(storedHash, /^[a-f0-9]{64}$/);
        assert.notEqual(params[0], params[1]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM frieren_site_oauth_states WHERE state_hash')) {
        if (!consumed && params[0] === storedHash && params[1] === owner) {
          consumed = true;
          return { rows: [{ account_id: owner }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO frieren_site_discord_links')) {
        linkWrites++;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const connectResponse = response();
  await handleGuildDashboardRequest(siteRequest('/discord/connect'), connectResponse, { db, env });
  assert.equal(connectResponse.status, 302);
  const authorization = new URL(connectResponse.headers.Location);
  const state = authorization.searchParams.get('state');
  assert.ok(state);
  assert.equal(storedHash, (await import('node:crypto')).createHash('sha256').update(state).digest('hex'));

  const fetchImpl = async (url, options) => {
    if (String(url).includes('/oauth2/token')) {
      tokenExchanges++;
      assert.equal(options.method, 'POST');
      return { ok: true, async json() { return { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 }; } };
    }
    if (String(url).includes('/users/@me')) {
      tokenExchanges++;
      return { ok: true, async json() { return { id: '333333333333333333', username: 'GezginDiscord', avatar: null }; } };
    }
    throw new Error('Unexpected Discord endpoint');
  };
  const callbackUrl = '/discord/callback?code=one-time-code&state=' + encodeURIComponent(state);
  const callbackResponse = response();
  await handleGuildDashboardRequest(siteRequest(callbackUrl), callbackResponse, { db, env, fetchImpl });
  assert.equal(callbackResponse.status, 302);
  assert.equal(linkWrites, 1);
  assert.equal(tokenExchanges, 2);

  const replayResponse = response();
  await handleGuildDashboardRequest(siteRequest(callbackUrl), replayResponse, { db, env, fetchImpl });
  assert.equal(replayResponse.status, 400);
  assert.equal(tokenExchanges, 2);
  assert.equal(linkWrites, 1);
});


test('cross-origin guild feature changes are rejected before writing settings', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const db = linkedDb();
  const res = response();
  await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body, {
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site',
    host: 'frierenbot.vercel.app'
  }), res, { db, env, client: discordClient, fetchImpl: discordFetch });
  assert.equal(res.status, 403);
  assert.equal(db.writes.length, 0);
});


test('concurrent guild dashboard requests serialize Discord refresh-token rotation', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  let row = {
    discord_user_id: '111111111111111111',
    discord_username: 'GezginDiscord',
    avatar_hash: null,
    access_token_encrypted: encryptDiscordOAuthToken('expired-access', secret),
    refresh_token_encrypted: encryptDiscordOAuthToken('single-use-refresh', secret),
    expires_at: new Date(Date.now() - 60_000)
  };
  let lockTail = Promise.resolve();
  let refreshExchanges = 0;
  let guildReads = 0;
  const db = {
    async query(sql) {
      if (sql.includes('SELECT discord_user_id')) return { rows: [{ ...row }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      let releaseLock = null;
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            releaseLock?.();
            releaseLock = null;
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes('FOR UPDATE')) {
            const previous = lockTail;
            let unlock;
            lockTail = new Promise(resolve => { unlock = resolve; });
            await previous;
            releaseLock = unlock;
            return { rows: [{ ...row }], rowCount: 1 };
          }
          if (sql.includes('INSERT INTO frieren_site_discord_links')) {
            row = {
              ...row,
              access_token_encrypted: params[4],
              refresh_token_encrypted: params[5],
              expires_at: new Date(Date.now() + Number(params[6]) * 1000)
            };
            return { rows: [], rowCount: 1 };
          }
          throw new Error('Unexpected transaction query: ' + sql);
        },
        release() { releaseLock?.(); releaseLock = null; }
      };
    }
  };
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/oauth2/token')) {
      refreshExchanges++;
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(new URLSearchParams(options.body).get('refresh_token'), 'single-use-refresh');
      return { ok: true, async json() {
        return { access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 };
      } };
    }
    if (String(url).includes('/users/@me/guilds')) {
      guildReads++;
      assert.equal(options.headers.Authorization, 'Bearer rotated-access');
      return { ok: true, async json() { return []; } };
    }
    throw new Error('Unexpected Discord endpoint: ' + url);
  };
  const invoke = async () => {
    const res = response();
    await handleGuildDashboardRequest(siteRequest('/lonca'), res, { db, env, fetchImpl });
    return res;
  };
  const [first, second] = await Promise.all([invoke(), invoke()]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(refreshExchanges, 1, 'the one-time refresh token must be exchanged only once');
  assert.equal(guildReads, 2, 'both requests must use the rotated access token');
  assert.equal(decryptDiscordOAuthToken(row.refresh_token_encrypted, secret), 'rotated-refresh');
});

test('guild feature changes are rejected when Discord membership or management permission has been revoked', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const cases = [
    { name: 'membership revoked', fetchImpl: async () => ({ ok: true, async json() { return []; } }) },
    { name: 'management permission revoked', fetchImpl: async () => ({ ok: true, async json() { return [{
      id: '1539562273197260860', name: 'Goose Goose Duck Türkiye', permissions: '4'
    }]; } }) }
  ];
  for (const scenario of cases) {
    const db = linkedDb();
    const res = response();
    await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body), res, {
      db, env, client: discordClient, fetchImpl: scenario.fetchImpl
    });
    assert.equal(res.status, 403, scenario.name);
    assert.equal(db.writes.length, 0, scenario.name + ' must not write settings');
  }
});

test('guild feature changes are rejected when Poğaça Frieren is no longer installed in the guild', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const db = linkedDb();
  const res = response();
  await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body), res, {
    db, env,
    client: { guilds: { cache: { keys: () => [] } } },
    fetchImpl: discordFetch
  });
  assert.equal(res.status, 403);
  assert.equal(db.writes.length, 0);
});

test('guild feature changes reject a tampered or malformed guild ID without writing', async () => {
  process.env.ADMIN_SESSION_SECRET = secret;
  const csrf = createSiteCsrfToken(secret);
  const body = new URLSearchParams({
    csrf, guildId: '1539562273197260860/attacker', featureKey: 'animeQuiz', enabled: 'false'
  }).toString();
  const db = linkedDb();
  const res = response();
  await handleGuildDashboardRequest(siteRequest('/api/lonca/features', 'POST', body), res, {
    db, env, client: discordClient, fetchImpl: discordFetch
  });
  assert.equal(res.status, 403);
  assert.equal(db.writes.length, 0);
});
