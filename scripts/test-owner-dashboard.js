import test from 'node:test';
import { GUARDIAN_REPAIR_BRANCH, buildGuardianRepairTrackingUrls } from '../guardian/automation.js';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { buildOwnerSessionCookie, clearOwnerCookie, createOwnerSession, verifyOwnerSession, OWNER_PANEL_SECTIONS, renderOwnerNavigation, renderOwnerActivityWorkspace, renderRenderMetrics, getFrierenAiScenarioEndpoint, getFrierenAiGuardianEndpoint, renderOwnerGuardianWorkspace, renderOwnerSecurityWorkspace, assertGuardianAutomationEnabled, getDiscordOAuthFailureDiagnostic, createOwnerOAuthState, renderOwnerBotCards, renderOwnerControlCenter, getFrierenAIReadiness, handleOwnerDashboardRequest } from '../owner-dashboard.js';



test('Guardian repair status polling tracks the same isolated branch used for workflow dispatch', () => {
  assert.equal(GUARDIAN_REPAIR_BRANCH, 'guardian-isolated-repair-test-v2');
  const urls = buildGuardianRepairTrackingUrls('https://api.github.com/', 990053);
  const runs = new URL(urls.runsUrl);
  const pulls = new URL(urls.pullRequestsUrl);
  assert.equal(runs.searchParams.get('branch'), GUARDIAN_REPAIR_BRANCH);
  assert.equal(runs.searchParams.get('event'), 'workflow_dispatch');
  assert.equal(pulls.searchParams.get('base'), GUARDIAN_REPAIR_BRANCH);
  assert.equal(pulls.searchParams.get('head'), 'soire07:ai-repair/guardian-990053');
  assert.equal(urls.branchName, 'ai-repair/guardian-990053');
  assert.throws(() => buildGuardianRepairTrackingUrls('http://api.github.com', 1), { message: 'INVALID_GUARDIAN_REPAIR_TRACKING_INPUT' });
  assert.throws(() => buildGuardianRepairTrackingUrls('https://api.github.com', 0), { message: 'INVALID_GUARDIAN_REPAIR_TRACKING_INPUT' });
});

test('Guardian has a dedicated private Owner Panel section', () => {
  assert.ok(OWNER_PANEL_SECTIONS.some(section => section.id === 'guardian'));
  assert.match(renderOwnerNavigation(), /href="\/owner\/guardian"/);
});


test('Frieren Security is an independent first navigation tab without changing existing sections', () => {
  const navigation = renderOwnerNavigation();
  assert.ok(navigation.indexOf('FRIEREN SECURITY') < navigation.indexOf('GENEL'));
  assert.ok(navigation.includes('href="/owner/security"'));
  for (const id of ['overview', 'system', 'guardian', 'memories', 'approvals', 'rpg']) {
    assert.ok(OWNER_PANEL_SECTIONS.some(section => section.id === id));
  }
});

test('Frieren Security workspace clearly distinguishes active platform protection from integrations not yet connected', () => {
  const html = renderOwnerSecurityWorkspace();
  assert.match(html, /Güvenlik merkezi/);
  assert.match(html, /Otomatik DDoS azaltma/);
  assert.match(html, /Anahtar eksik/);
  assert.match(html, /Kontrol edilemedi/);
  assert.match(html, /SHA-256/);
  assert.doesNotMatch(html, /gerçek zamanlı saldırı algılandı/i);
});

test('Guardian AI bridge endpoint requires HTTPS and targets the private review route', () => {
  assert.equal(getFrierenAiGuardianEndpoint({ FRIEREN_AI_PUBLIC_URL: 'https://frieren-ai.example/' }), 'https://frieren-ai.example/internal/guardian-review');
  assert.throws(() => getFrierenAiGuardianEndpoint({ FRIEREN_AI_PUBLIC_URL: 'http://frieren-ai.example' }), { message: 'INVALID_FRIEREN_AI_PUBLIC_URL' });
});

test('Guardian emergency stop is enforced server-side', async () => {
  await assert.rejects(() => assertGuardianAutomationEnabled({ query: async () => ({ rows: [{ setting_value: { enabled: true } }] }) }), { message: 'GUARDIAN_EMERGENCY_STOP_ENABLED' });
  assert.equal(await assertGuardianAutomationEnabled({ query: async () => ({ rows: [{ setting_value: { enabled: false } }] }) }), undefined);
});

test('Guardian repair approval is explicit and disappears after approval is persisted', () => {
  const previousToken = process.env.FRIEREN_GITHUB_TOKEN;
  process.env.FRIEREN_GITHUB_TOKEN = 'test-github-token-long-enough-for-render';
  const base = {
    csrf: 'csrf-test',
    incidents: [],
    jobs: [{
      id: 9, incident_id: 7, incident_title: 'RPG timeout', agent: 'frieren_ai',
      system: 'pogaca_frieren', status: 'completed', created_at: '2026-11-02T10:01:00Z',
      repair_dispatch_status: 'not_requested',
      result: { status: 'proposal_only', rootCause: 'Timeout guard missing', confidence: 'high', affectedFiles: ['commands/example.js'], proposedPatch: 'diff --git a/file.js b/file.js', tests: ['timeout regression'] },
    }],
  };
  try {
    const pending = renderOwnerGuardianWorkspace(base);
    assert.match(pending, /Bu öneri için izole düzeltme ve test sürecini başlatmayı onaylıyorum/);
    assert.match(pending, /Sorunu Çöz/);
    assert.match(pending, /guardian-create-pr/);
    const approved = renderOwnerGuardianWorkspace({
      ...base,
      jobs: [{ ...base.jobs[0], repair_approved_by: ownerId, repair_approved_at: '2026-11-02T10:02:00Z', repair_approval_fingerprint: 'a'.repeat(64) }],
    });
    assert.doesNotMatch(approved, /Sorunu Çöz/);
    assert.match(approved, /Owner onayı kayıtlı/);
  } finally {
    if (previousToken === undefined) delete process.env.FRIEREN_GITHUB_TOKEN;
    else process.env.FRIEREN_GITHUB_TOKEN = previousToken;
  }
});

test('Guardian workspace renders incidents and review proposals as unapplied', () => {
  const html = renderOwnerGuardianWorkspace({
    csrf: 'csrf-test',
    monitorState: { last_tick_at: '2026-11-02T10:00:00Z', last_error: null },
    incidents: [{ id: 7, title: 'RPG timeout', severity: 'high', system: 'pogaca_frieren', code: 'TIMEOUT', status: 'open', occurrence_count: 2, last_seen: '2026-11-02T10:00:00Z', summary: 'Boss test timeout', evidence: [] }],
    jobs: [{ id: 9, incident_title: 'RPG timeout', agent: 'frieren_ai', system: 'pogaca_frieren', status: 'completed', created_at: '2026-11-02T10:01:00Z', result: { rootCause: 'A missing timeout guard.', confidence: 'medium', suggestedFix: 'Add a bounded timeout.', proposedPatch: 'diff --git a/file b/file', applied: false, tests: ['Add regression test.'], risks: [] } }],
  });
  assert.match(html, /Neural Guardian/);
  assert.match(html, /A missing timeout guard/);
  assert.match(html, /Önerilen yama taslağı \(uygulanmadı\)/);
  assert.match(html, /İnsan incelemesi gerekli/);
  assert.match(html, /guardian-review/);
  assert.match(html, /Sorunu Çöz/);
});

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
  assert.equal(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).ownerOAuth, true);
});

test('owner session rejects legacy TOTP-marked sessions after OAuth-only migration', () => {
  const payload = Buffer.from(JSON.stringify({
    sub: ownerId,
    mfa: true,
    exp: 2_000,
    csrf: 'legacy-csrf-token-value-that-is-long-enough'
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  assert.equal(verifyOwnerSession(payload + '.' + signature, secret, 1_000), false);
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


async function runOwnerGet(url, { cookie = true } = {}) {
  const token = createOwnerSession(secret, Math.floor(Date.now() / 1000) + 3600);
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = url;
  req.headers = { cookie: cookie ? 'frieren_owner_session=' + encodeURIComponent(token) : '' };
  const response = { status: 0, headers: {}, body: '', writeHead(status, headers = {}) {
    this.status = status; this.headers = headers;
  }, end(body = '') { this.body = body; } };
  const previous = {
    CLIENT_ID: process.env.CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET
  };
  process.env.CLIENT_ID = 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET = 'test-discord-secret';
  process.env.ADMIN_SESSION_SECRET = secret;
  try {
    await handleOwnerDashboardRequest(req, response, {
      client: {},
      db: { query: async sql => {
        if (String(sql).includes('FROM owner_guardian_incidents') || String(sql).includes('FROM owner_guardian_evidence_chain')) return { rows: [] };
        throw new Error('security workspace must not query unrelated data');
      } }
    });
    return response;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Frieren Security route requires the existing signed Owner session', async () => {
  const response = await runOwnerGet('/owner/security', { cookie: false });
  assert.equal(response.status, 200);
  assert.match(response.body, /Discord ile devam et/);
  assert.doesNotMatch(response.body, /PRIVATE SECURITY CENTER/);
});

test('authenticated Frieren Security route renders independently without querying bot or RPG data', async () => {
  const response = await runOwnerGet('/owner/security');
  assert.equal(response.status, 200);
  assert.match(response.body, /PRIVATE SECURITY CENTER/);
  assert.match(response.body, /FRIEREN SECURITY/);
  assert.match(response.body, /Anahtar eksik/);
});

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