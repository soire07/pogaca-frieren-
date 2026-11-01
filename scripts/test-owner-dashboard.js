import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { buildOwnerSessionCookie, clearOwnerCookie, createOwnerSession, verifyOwnerSession, OWNER_PANEL_SECTIONS, renderOwnerNavigation, renderCommandHelpManager, renderOwnerLayout, renderOwnerActivityWorkspace, getFrierenAiScenarioEndpoint, getDiscordOAuthFailureDiagnostic, renderOwnerBotCards, renderOwnerControlCenter, getFrierenAIReadiness, handleOwnerDashboardRequest } from '../owner-dashboard.js';

const secret = 'test-session-secret-that-is-at-least-32-characters-long';
const ownerId = '1553794496234262641';

test('Discord OAuth diagnostics expose only safe status and error codes', () => {
  assert.equal(getDiscordOAuthFailureDiagnostic(401, { error: 'invalid_client', error_description: 'private detail' }), 'HTTP 401; invalid_client');
  assert.equal(getDiscordOAuthFailureDiagnostic(400, { error: 'invalid_grant' }), 'HTTP 400; invalid_grant');
  assert.equal(getDiscordOAuthFailureDiagnostic(502, { error: 'bad code; secret=hidden' }), 'HTTP 502; unknown_error');
  assert.doesNotMatch(getDiscordOAuthFailureDiagnostic(401, { error: 'invalid_client', error_description: 'private detail' }), /private detail/);
});

test('Discord OAuth state is self-verifying without a browser cookie', async () => {
  const { createOwnerOAuthState, verifyOwnerOAuthState } = await import('../owner-dashboard.js');
  const now = 1_800_000_000_000;
  const state = createOwnerOAuthState(secret, now);
  assert.equal(verifyOwnerOAuthState(state, secret, now + 1000), true);
  assert.equal(verifyOwnerOAuthState(state, secret, now + 11 * 60 * 1000), false);
  assert.equal(verifyOwnerOAuthState(state + 'tampered', secret, now + 1000), false);
  assert.equal(verifyOwnerOAuthState(state, 'another-secret-that-is-at-least-32-characters', now + 1000), false);
});

test('owner session accepts a valid signed session for the configured owner', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, secret, 1_000), true);
});

test('owner session rejects expired sessions', () => {
  const token = createOwnerSession(secret, 999);
  assert.equal(verifyOwnerSession(token, secret, 1_000), false);
});

test('owner session rejects tampered signatures', () => {
  const token = createOwnerSession(secret, 2_000);
  const [payload, signature] = token.split('.');
  const changedSignature = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
  const tampered = payload + '.' + changedSignature;
  assert.equal(verifyOwnerSession(tampered, secret, 1_000), false);
});

test('owner session rejects tokens signed with another secret', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, 'different-secret-that-is-also-long-enough', 1_000), false);
});

test('owner session rejects an invalid or short signing secret', () => {
  const token = createOwnerSession(secret, 2_000);
  assert.equal(verifyOwnerSession(token, 'short', 1_000), false);
});


test('owner session cookie survives the cross-site Discord OAuth redirect', () => {
  const cookie = buildOwnerSessionCookie('signed-session', 28_800);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /SameSite=Strict/);
  assert.ok(cookie.includes('Path=/owner'));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test('owner OAuth state cookie is cleared using the same path it was created with', () => {
  const cookie = clearOwnerCookie('frieren_owner_oauth_state', '/owner');
  assert.ok(cookie.includes('Path=/owner'));
  assert.match(cookie, /Max-Age=0/);
});


test('owner panel navigation exposes command workflows and the new activity center', () => {
  const commands = OWNER_PANEL_SECTIONS.map(section => section.command).filter(Boolean);
  assert.deepEqual(commands, ['/owner', '/owner-bilgi', '/owner-bellek', '/owner-onay', '/owner-duyuru', '/owner-bakim']);
  const navigation = renderOwnerNavigation();
  for (const id of ['overview', 'system', 'bot-control', 'memories', 'approvals', 'announcements', 'maintenance']) {
    assert.match(navigation, new RegExp('href="/owner#' + id + '"'));
  }
  assert.match(navigation, /Denetim ve test geçmişi/);
});


test('Render metrics stay disabled without an API key and do not make network requests', async () => {
  const { getRenderServiceMetrics } = await import('../owner-metrics.js');
  let calls = 0;
  const result = await getRenderServiceMetrics({
    apiKey: '',
    resourceId: 'srv-test',
    fetchImpl: async () => { calls += 1; throw new Error('unexpected request'); }
  });
  assert.equal(result.status, 'not_configured');
  assert.equal(calls, 0);
});

test('Render metrics aggregate CPU and RAM against their limits', async () => {
  const { getRenderServiceMetrics } = await import('../owner-metrics.js');
  const timestamp = '2026-10-30T08:45:00.000Z';
  const responses = {
    cpu: [{ labels: [{ field: 'instance', value: 'srv-test-one' }], values: [{ timestamp, value: 0.05 }], unit: 'cpu' }],
    'cpu-limit': [{ labels: [{ field: 'instance', value: 'srv-test-one' }], values: [{ timestamp, value: 0.15 }], unit: 'cpu' }],
    memory: [{ labels: [{ field: 'instance', value: 'srv-test-one' }], values: [{ timestamp, value: 256 * 1024 * 1024 }], unit: 'bytes' }],
    'memory-limit': [{ labels: [{ field: 'instance', value: 'srv-test-one' }], values: [{ timestamp, value: 512 * 1024 * 1024 }], unit: 'bytes' }]
  };
  const result = await getRenderServiceMetrics({
    apiKey: 'test-render-key',
    resourceId: 'srv-test',
    now: Date.parse(timestamp),
    fetchImpl: async url => ({
      ok: true,
      json: async () => responses[new URL(url).pathname.split('/').pop()]
    })
  });
  assert.equal(result.status, 'available');
  assert.equal(result.source, 'render');
  assert.ok(Math.abs(result.cpuPercent - 33.3333) < 0.01);
  assert.equal(result.memoryPercent, 50);
  assert.equal(result.memoryUsedBytes, 256 * 1024 * 1024);
  assert.equal(result.points.length, 1);
  assert.equal(result.updatedAt, timestamp);
});

test('Render metrics hide credentials and return a safe status when the API rejects a request', async () => {
  const { getRenderServiceMetrics } = await import('../owner-metrics.js');
  const result = await getRenderServiceMetrics({
    apiKey: 'do-not-leak-this-secret',
    resourceId: 'srv-test',
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.message, /401/);
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak-this-secret/);
});

test('Render metric bars render bounded percentages without executable markup', async () => {
  const { renderMetricBars } = await import('../owner-metrics.js');
  const html = renderMetricBars([{ cpuPercent: -5 }, { cpuPercent: 125 }], 'cpuPercent', 'CPU');
  assert.match(html, /height:2\.0%/);
  assert.match(html, /height:100\.0%/);
  assert.doesNotMatch(html, /<script/i);
});


test('Render metrics only compare usage with limits from the same instance', async () => {
  const { getRenderServiceMetrics } = await import('../owner-metrics.js');
  const timestamp = '2026-10-30T08:54:00.000Z';
  const series = (instance, value) => ({
    labels: [{ field: 'instance', value: instance }],
    values: [{ timestamp, value }]
  });
  const responses = {
    cpu: [series('instance-a', 0.05), series('instance-b', 0.09)],
    'cpu-limit': [series('instance-a', 0.15)],
    memory: [series('instance-a', 256 * 1024 * 1024), series('instance-b', 100 * 1024 * 1024)],
    'memory-limit': [series('instance-a', 512 * 1024 * 1024)]
  };
  const result = await getRenderServiceMetrics({
    apiKey: 'test-render-key',
    resourceId: 'srv-test',
    now: Date.parse(timestamp),
    fetchImpl: async url => ({
      ok: true,
      json: async () => responses[new URL(url).pathname.split('/').pop()]
    })
  });
  assert.equal(result.status, 'available');
  assert.ok(Math.abs(result.cpuPercent - 33.3333) < 0.01);
  assert.equal(result.memoryPercent, 50);
  assert.equal(result.memoryUsedBytes, 256 * 1024 * 1024);
});


test('owner dashboard displays both Frieren bots with independently grounded status', () => {
  const html = renderOwnerBotCards({ ready: true }, {
    status: 'ok', discordReady: true, memoryDatabaseReady: true, modelConfigured: true
  });
  assert.match(html, /Frieren AI/);
  assert.match(html, /Frieren Poğaça/);
  assert.equal((html.match(/Çevrimiçi/g) || []).length, 2);
});

test('owner dashboard does not label the AI bot online when readiness is incomplete', () => {
  const html = renderOwnerBotCards({ ready: true }, {
    status: 'ok', discordReady: true, memoryDatabaseReady: false, modelConfigured: true
  });
  assert.match(html, /Frieren AI/);
  assert.match(html, /Kontrol gerekli/);
  assert.match(html, /Frieren Poğaça/);
});


test('Frieren AI readiness uses public liveness endpoint and extracts dependency readiness', async () => {
  let requestedUrl = '';
  const expected = { status: 'ok', discordReady: true, memoryDatabaseReady: true, modelConfigured: true, bridgeConfigured: true };
  const livePayload = { status: 'alive', ready: true, readiness: expected };
  const result = await getFrierenAIReadiness({
    serviceUrl: 'https://frieren-ai.example',
    healthPath: '/live',
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => livePayload };
    }
  });
  assert.equal(requestedUrl, 'https://frieren-ai.example/live');
  assert.deepEqual(result, expected);
});
test('Frieren AI readiness fails closed when its separate Render health endpoint is unavailable', async () => {
  const result = await getFrierenAIReadiness({
    serviceUrl: 'https://frieren-ai.example',
    healthPath: '/health',
    fetchImpl: async () => { throw new Error('AI service unavailable'); }
  });
  assert.equal(result, null);
});


function makeOwnerRequest({ action, csrf, id, confirm, cookie = true }) {
  const token = createOwnerSession(secret, Math.floor(Date.now() / 1000) + 3600);
  const sessionCsrf = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).csrf;
  const form = new URLSearchParams();
  if (action) form.set('action', action);
  if (csrf !== undefined) form.set('csrf', csrf === 'session' ? sessionCsrf : csrf);
  if (id !== undefined) form.set('id', String(id));
  if (confirm !== undefined) form.set('confirm', confirm);
  for (const [key, value] of Object.entries(arguments[0] || {})) {
    if (!['action','csrf','id','confirm','cookie'].includes(key) && value !== undefined) form.set(key, String(value));
  }
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/owner/action';
  req.headers = { cookie: cookie ? 'frieren_owner_session=' + encodeURIComponent(token) : '' };
  const response = { status: 0, headers: {}, body: '', writeHead(status, headers = {}) {
    this.status = status; this.headers = headers;
  }, end(body = '') { this.body = body; } };
  return { req, response, body: form.toString(), sessionCsrf };
}

async function runOwnerPost(options, db, client = {}) {
  const previous = {
    CLIENT_ID: process.env.CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET
  };
  process.env.CLIENT_ID = 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.ADMIN_SESSION_SECRET = secret;
  const { req, response, body, sessionCsrf } = makeOwnerRequest(options);
  const pending = handleOwnerDashboardRequest(req, response, { client, db });
  req.emit('data', Buffer.from(body));
  req.emit('end');
  try {
    await pending;
    return { response, sessionCsrf };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('owner action endpoint rejects requests without an authenticated owner session', async () => {
  const db = { query: async () => { throw new Error('database must not be touched'); } };
  const { response } = await runOwnerPost({ action: 'maintenance-on', csrf: 'invalid', cookie: false }, db);
  assert.equal(response.status, 401);
  assert.match(response.body, /Oturum süresi doldu/);
});

test('owner action endpoint rejects invalid CSRF tokens without changing state', async () => {
  let calls = 0;
  const db = { query: async () => { calls += 1; return { rows: [], rowCount: 1 }; } };
  const { response } = await runOwnerPost({ action: 'maintenance-on', csrf: 'wrong-token', confirm: 'yes' }, db);
  assert.equal(response.status, 403);
  assert.match(response.body, /CSRF doğrulaması başarısız/);
  assert.equal(calls, 0);
});

test('owner maintenance action uses the atomic database operation and redirects on success', async () => {
  let query = '';
  const db = { query: async sql => { query = sql; return { rows: [], rowCount: 1 }; } };
  const { response, sessionCsrf } = await runOwnerPost({ action: 'maintenance-on', csrf: 'session', confirm: 'yes' }, db);
  assert.ok(sessionCsrf.length >= 32);
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner?notice=maintenance_on');
  assert.match(query, /WITH changed AS/);
  assert.match(query, /INSERT INTO owner_audit_logs/);
});


test('owner navigation groups bot workspaces and preserves the no-log policy', () => {
  const navigation = renderOwnerNavigation();
  assert.match(navigation, /nav-group/);
  assert.match(navigation, /Frieren Poğaça/);
  assert.match(navigation, /Frieren AI/);
  assert.match(navigation, /Komut ve davranışlar/);
  assert.ok(navigation.includes('href="/owner#behavior"'));
  assert.ok(navigation.includes('href="/owner#rpg"'));
  assert.ok(!navigation.includes('href="/owner#activity"'));
});

test('bot cards expose direct paths into their own management areas', () => {
  const html = renderOwnerBotCards({ ready: true }, {
    status: 'ok', discordReady: true, memoryDatabaseReady: true, modelConfigured: true
  });
  assert.match(html, /href="#rpg"/);
  assert.match(html, /href="#behavior"/);
  assert.match(html, /href="#memories"/);
  assert.match(html, /href="#approvals"/);
});


test('RPG owner adjustment requires a guild currently connected to this bot', async () => {
  let connected = false;
  const db = { connect: async () => { connected = true; throw new Error('must not connect'); } };
  const client = { guilds: { cache: new Map() } };
  const { response } = await runOwnerPost({
    action: 'rpg-resource-adjust', csrf: 'session', confirm: 'yes',
    guildId: '1539562273197260860', userId: '123456789012345678',
    coinsDelta: '10', xpDelta: '0', reason: 'test'
  }, db, client);
  assert.equal(response.status, 303);
  assert.match(response.headers.Location, /notice=invalid/);
  assert.equal(connected, false);
});

test('RPG owner adjustment reaches audited transaction only for connected guilds', async () => {
  const calls = [];
  const clientDb = {
    query: async (sql, params) => {
      calls.push({sql,params});
      if (sql.includes('SELECT coins,xp')) return { rows: [{ coins: 20, xp: 10 }] };
      if (sql.includes('UPDATE users')) return { rows: [{ coins: 30, xp: 10 }] };
      return { rows: [] };
    },
    release() {}
  };
  const db = { connect: async () => clientDb };
  const client = { guilds: { cache: new Map([['1539562273197260860', { id: '1539562273197260860' }]]) } };
  const { response } = await runOwnerPost({
    action: 'rpg-resource-adjust', csrf: 'session', confirm: 'yes',
    guildId: '1539562273197260860', userId: '123456789012345678',
    coinsDelta: '10', xpDelta: '0', reason: 'test adjustment'
  }, db, client);
  assert.equal(response.status, 303);
  assert.match(response.headers.Location, /notice=rpg_saved/);
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});


test('Owner can save validated Frieren chat preferences with CSRF protection and audit', async () => {
  let query = '';
  const db = { query: async sql => { query = sql; return { rows: [{ setting_value: { enabled: true, style: 'warm', responseLength: 'balanced', loreFocus: false } }] }; } };
  const { response } = await runOwnerPost({
    action: 'frieren-chat-settings', csrf: 'session',
    enabled: 'yes', style: 'warm', responseLength: 'balanced', loreFocus: 'no'
  }, db);
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner/frieren-ai?notice=chat_settings_saved');
  assert.match(query, /owner_settings/);
  assert.match(query, /owner_audit_logs/);
});


test('owner daily quest save is guild-scoped, confirmed and audited before redirect', async () => {
  const guildId = '1539562273197260860';
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO guild_daily_quests')) return { rows: [{ quest_key: 'northern_trial' }] };
    return { rows: [] };
  }, release() { calls.push({ sql: 'RELEASE' }); } };
  const db = { connect: async () => client };
  const discordClient = { guilds: { cache: new Map([[guildId, {}]]) } };
  const { response } = await runOwnerPost({
    action: 'rpg-daily-quest-save', csrf: 'session', confirm: 'yes', guildId,
    questKey: 'northern_trial', title: 'Kuzey sınavı',
    description: 'Bugün bir keşif tamamla.', objectiveType: 'explore',
    className: '', rewardCoins: '250', active: 'yes', reason: 'Yeni sezon görevi'
  }, db, discordClient);
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner/pogaca?guildId=' + guildId + '&notice=quest_saved');
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('owner daily quest save rejects a guild that the bot is not connected to', async () => {
  let connected = false;
  const db = { connect: async () => { connected = true; throw new Error('must not connect'); } };
  const { response } = await runOwnerPost({
    action: 'rpg-daily-quest-save', csrf: 'session', confirm: 'yes',
    guildId: '1539562273197260860', questKey: 'northern_trial',
    title: 'Kuzey sınavı', description: 'Bugün bir keşif tamamla.',
    objectiveType: 'explore', rewardCoins: '250', active: 'yes', reason: 'Yeni sezon görevi'
  }, db, { guilds: { cache: new Map() } });
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner?notice=invalid');
  assert.equal(connected, false);
});


test('owner dungeon and boss content save is confirmed, guild-scoped and audited', async () => {
  const guildId = '1539562273197260860';
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO guild_rpg_content_overrides')) return { rows: [{ content_key: 'level_1', active: true }] };
    if (sql.includes('SELECT content_key,active')) return { rows: [{ content_key: 'level_1', active: true }] };
    return { rows: [] };
  }, release() { calls.push({ sql: 'RELEASE' }); } };
  const db = { connect: async () => client };
  const discordClient = { guilds: { cache: new Map([[guildId, {}]]) } };
  const { response } = await runOwnerPost({
    action: 'rpg-content-save', csrf: 'session', confirm: 'yes', guildId,
    contentType: 'dungeon', contentKey: 'level_1',
    name: 'Merkez Mahzen', hp: '180', damage: '9', xp: '50', coins: '60',
    lootChance: '0.12', loot: 'Mahzen Anahtarı', active: 'yes', reason: 'Denge ayarı'
  }, db, discordClient);
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner/pogaca?guildId=' + guildId + '&notice=content_saved');
  assert.ok(calls.some(call => call.sql.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});

test('owner dungeon and boss content disable is reversible and keeps at least one active tier', async () => {
  const guildId = '1539562273197260860';
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO guild_rpg_content_overrides')) return { rows: [{ content_key: 'level_5', active: false }] };
    if (sql.includes('SELECT content_key,active')) return { rows: [{ content_key: 'level_5', active: false }] };
    return { rows: [] };
  }, release() { calls.push({ sql: 'RELEASE' }); } };
  const db = { connect: async () => client };
  const discordClient = { guilds: { cache: new Map([[guildId, {}]]) } };
  const { response } = await runOwnerPost({
    action: 'rpg-content-disable', csrf: 'session', confirm: 'yes', guildId,
    contentType: 'dungeon', contentKey: 'level_5', reason: 'Denge için geçici kapatma'
  }, db, discordClient);
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, '/owner/pogaca?guildId=' + guildId + '&notice=content_disabled');
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});


test('bot control center separates the main bot from the suspended AI service', () => {
  const html = renderOwnerControlCenter({
    apiConfigured: true,
    services: {
      pogaca: { key: 'pogaca', apiConfigured: true, name: 'Poğaça Frieren', id: 'srv-main', url: 'https://pogaca-frieren.onrender.com', dashboardUrl: 'https://dashboard.render.com/web/srv-main', plan: 'free', status: 'running', health: 'healthy', suspended: false, suspenders: [], allowedActions: ['restart'] },
      frieren_ai: { key: 'frieren_ai', apiConfigured: true, name: 'Frieren AI', id: 'srv-ai', url: 'https://frieren-ai-agent.onrender.com', dashboardUrl: 'https://dashboard.render.com/web/srv-ai', plan: 'free', status: 'suspended', health: 'suspended', suspended: true, suspenders: ['user'], allowedActions: ['restart','suspend','resume'] }
    }
  }, { maintenance: false }, 'csrf-token',
  { status: 'available', cpuPercent: 12.3, memoryPercent: 45.6 },
  { status: 'available', cpuPercent: 5.5, memoryPercent: 30.1 });
  assert.match(html, /Bot Kontrol Merkezi/);
  assert.match(html, /CPU 12\.3% · RAM 45\.6%/);
  assert.match(html, /CPU 5\.5% · RAM 30\.1%/);
  assert.match(html, /Poğaça Frieren/);
  assert.match(html, /Frieren AI/);
  assert.match(html, /Askıya alınmış/);
  assert.match(html, /Askıya alma kaynağı: user/);
  assert.match(html, /value="resume"/);
  assert.match(html, /value="restart"/);
  assert.doesNotMatch(html.slice(html.indexOf('<h3>Poğaça Frieren</h3>'), html.indexOf('<h3>Frieren AI</h3>')), /value="suspend"/);
  assert.match(html, /Owner Panel bu servis üzerinde çalışıyor/);
  assert.match(html, /csrf-token/);
});

test('bot control center hides lifecycle controls until a server-side Render API key is configured', () => {
  const html = renderOwnerControlCenter({
    apiConfigured: false,
    services: {
      pogaca: { key: 'pogaca', status: 'running', health: 'healthy', suspended: null },
      frieren_ai: { key: 'frieren_ai', status: 'unknown', health: 'unavailable', suspended: null }
    }
  }, {}, 'csrf-token');
  assert.match(html, /RENDER_POGACA_API_KEY/);
  assert.match(html, /RENDER_FRIEREN_AI_API_KEY/);
  assert.match(html, /RENDER_POGACA_SERVICE_ID/);
  assert.match(html, /RENDER_FRIEREN_AI_SERVICE_ID/);
  assert.doesNotMatch(html, /name="action" value="render-service-action"/);
  assert.doesNotMatch(html, /test-token|server-only-token/);
});

test('owner Render action route resumes Frieren AI through the server-side API and audits it', async () => {
  const previousKey = process.env.RENDER_FRIEREN_AI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RENDER_FRIEREN_AI_API_KEY = 'server-only-test-token';
  let request = null;
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO owner_audit_logs')) return { rows: [{ id: 77 }] };
      if (sql.includes('SELECT id FROM owner_audit_logs')) return { rows: [] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  const db = { connect: async () => client };
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, status: 202, json: async () => ({ message: 'Service resumed' }) };
  };
  try {
    const { response } = await runOwnerPost({
      action: 'render-service-action', serviceKey: 'frieren_ai', serviceAction: 'resume',
      csrf: 'session', confirm: 'yes', reason: 'AI testlerini çalıştıracağım'
    }, db);
    assert.equal(response.status, 303);
    assert.equal(response.headers.Location, '/owner?notice=service_action_accepted&serviceAction=resume');
    assert.ok(request.url.endsWith('/resume'));
    assert.equal(request.options.headers.Authorization, 'Bearer server-only-test-token');
    assert.ok(calls.some(call => call.sql.includes('INSERT INTO owner_audit_logs')));
    assert.ok(calls.some(call => call.sql.includes('UPDATE owner_audit_logs')));
    assert.ok(calls.some(call => call.sql === 'COMMIT'));
  } finally {
    if (previousKey === undefined) delete process.env.RENDER_FRIEREN_AI_API_KEY;
    else process.env.RENDER_FRIEREN_AI_API_KEY = previousKey;
    globalThis.fetch = previousFetch;
  }
});

test('owner Render action route refuses to suspend the service that hosts its own panel', async () => {
  const previousKey = process.env.RENDER_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RENDER_API_KEY = 'server-only-test-token';
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error('must not fetch'); };
  try {
    const db = { connect: async () => { throw new Error('database must not be touched'); } };
    const { response } = await runOwnerPost({
      action: 'render-service-action', serviceKey: 'pogaca', serviceAction: 'suspend',
      csrf: 'session', confirm: 'yes', reason: 'Paneli durdurma testi'
    }, db);
    assert.equal(response.status, 303);
    assert.equal(response.headers.Location, '/owner?notice=invalid');
    assert.equal(fetched, false);
  } finally {
    if (previousKey === undefined) delete process.env.RENDER_API_KEY;
    else process.env.RENDER_API_KEY = previousKey;
    globalThis.fetch = previousFetch;
  }
});


test('site OAuth state supports separate registration and login modes', async () => {
  const { createOwnerOAuthState, getOwnerOAuthFlow } = await import('../owner-dashboard.js');
  const now = 1800000000000;
  for (const flow of ['register', 'login', 'owner']) {
    const state = createOwnerOAuthState(secret, now, flow);
    assert.equal(getOwnerOAuthFlow(state, secret, now + 1000), flow);
  }
});

test('site registration callback creates a valid member table and session', async () => {
  const { createOwnerOAuthState } = await import('../owner-dashboard.js');
  const previous = {
    CLIENT_ID: process.env.CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    OWNER_DASHBOARD_REDIRECT_URI: process.env.OWNER_DASHBOARD_REDIRECT_URI,
    fetch: globalThis.fetch
  };
  process.env.CLIENT_ID = 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.ADMIN_SESSION_SECRET = secret;
  process.env.OWNER_DASHBOARD_REDIRECT_URI = 'https://pogaca-frieren.onrender.com/owner/callback';
  const state = createOwnerOAuthState(secret, Date.now(), 'register');
  const user = { id: '123456789012345678', username: 'Gezgin', avatar: 'avatar_hash_123' };
  const queries = [];
  const db = { async query(sql, params) {
    queries.push({ sql: String(sql), params });
    return { rowCount: 1, rows: [{ discord_user_id: user.id }] };
  } };
  globalThis.fetch = async (url) => url.includes('/oauth2/token')
    ? { ok: true, json: async () => ({ access_token: 'test-access-token' }) }
    : { ok: true, json: async () => user };
  const req = { method: 'GET', url: '/owner/callback?code=test-code&state=' + encodeURIComponent(state), headers: {} };
  const response = { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
  try {
    assert.equal(await handleOwnerDashboardRequest(req, response, { client: {}, db }), true);
    assert.equal(response.status, 302);
    assert.equal(response.headers.Location, '/');
    assert.match(String(response.headers['Set-Cookie']), /frieren_site_session=/);
    assert.match(queries[0].sql, /CREATE TABLE IF NOT EXISTS frieren_site_members/);
    assert.ok(queries[0].sql.includes("17,20"));
    assert.match(queries[1].sql, /INSERT INTO frieren_site_members/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (key === 'fetch') globalThis.fetch = value;
      else if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('owner activity workspace renders paginated audit and test history safely', () => {
  const html = renderOwnerActivityWorkspace({
    action: 'memory.update',
    target: '123',
    audit: { page: 2, limit: 20, total: 24, rows: [{ id: 12, actor_id: '1553794496234262641', action: 'memory.update', target: '<script>', created_at: '2026-11-01T00:00:00Z' }] },
    errors: { page: 1, limit: 20, total: 1, rows: [{ id: 4, scope: 'discord', error_type: 'GatewayError', error_message: '<script>alert(1)</script>', created_at: '2026-11-01T00:00:00Z' }] },
    errorScope: 'discord',
    testRuns: { page: 2, limit: 10, total: 21, rows: [{ id: 3, target: '<img src=x>', status: 'FAIL', summary: { total: 4, pass: 3, fail: 1 }, details: { testFiles: ['scripts/test-request.js'], failedStages: ['<script>alert(1)</script>'] }, created_at: '2026-11-01T00:00:00Z' }] }
  });
  assert.match(html, /Denetim ve test geçmişi/);
  assert.match(html, /Önceki/);
  assert.match(html, /Önceki testler/);
  assert.match(html, /memory.update/);
  assert.match(html, /Hata kayıtları/);
  assert.match(html, /GatewayError/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /name="errorScope"/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
});

test('owner scenario tests target the separately hosted Frieren AI service over HTTPS', () => {
  assert.equal(
    getFrierenAiScenarioEndpoint({}),
    'https://pogaca-frieren-kltd.onrender.com/internal/test-scenario'
  );
  assert.equal(
    getFrierenAiScenarioEndpoint({ FRIEREN_AI_PUBLIC_URL: 'https://ai.example.test/base/' }),
    'https://ai.example.test/internal/test-scenario'
  );
  assert.throws(() => getFrierenAiScenarioEndpoint({ FRIEREN_AI_PUBLIC_URL: 'http://127.0.0.1:10001' }), /INVALID_FRIEREN_AI_PUBLIC_URL/);
});

test('owner navigation provides a safe public-site preview shortcut', () => {
  assert.match(renderOwnerNavigation(), /Ana siteyi önizle/);
  assert.match(renderOwnerNavigation(), /href="\/" target="_blank" rel="noopener"/);
});


test('owner workspace layout places navigation and content in one balanced shell', () => {
  const html = renderOwnerLayout('<nav class="nav">navigation</nav>', '<section class="owner-content">content</section>');
  assert.ok(html.startsWith('<div class="owner-shell">'));
  assert.ok(html.includes('<nav class="nav">navigation</nav>'));
  assert.ok(html.endsWith('<div class="owner-content"><section class="owner-content">content</section></div></div>'));
});


test('command help manager lists loaded commands with bounded editable descriptions', () => {
  const commands = new Map([
    ['karakter', { data: { name: 'karakter', description: 'Karakter profilini görüntüle.' } }],
    ['zindan', { data: { name: 'zindan', description: 'Zindan macerası başlat.' } }]
  ]);
  const html = renderCommandHelpManager(commands, [{
    command_name: 'karakter', short_description: 'Özel kısa açıklama.',
    long_description: 'Karakterinin ilerlemesini görüntüle.',
    updated_at: '2026-11-01T12:00:00.000Z', version_count: 3, version_history: []
  }], 'csrf-token');
  assert.match(html, /\/karakter/);
  assert.match(html, /\/zindan/);
  assert.match(html, /maxlength="100"/);
  assert.match(html, /maxlength="2000"/);
  assert.match(html, /Özel kısa açıklama/);
  assert.match(html, /3 sürüm/);
  assert.match(html, /csrf-token/);
});

test('command help manager escapes stored owner content before rendering', () => {
  const commands = new Map([['karakter', { data: { name: 'karakter', description: 'Kısa açıklama.' } }]]);
  const html = renderCommandHelpManager(commands, [{
    command_name: 'karakter', short_description: '<script>alert(1)</script>',
    long_description: '<img src=x onerror=alert(1)>', version_count: 1, version_history: []
  }], 'csrf');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
