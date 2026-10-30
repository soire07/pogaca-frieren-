import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerSessionCookie, clearOwnerCookie, createOwnerSession, verifyOwnerSession, OWNER_PANEL_SECTIONS, renderOwnerNavigation, getDiscordOAuthFailureDiagnostic, renderOwnerBotCards, getFrierenAIReadiness } from '../owner-dashboard.js';

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


test('owner panel navigation exposes all six owner command workflows', () => {
  const commands = OWNER_PANEL_SECTIONS.map(section => section.command).filter(Boolean);
  assert.deepEqual(commands, ['/owner', '/owner-bilgi', '/owner-bellek', '/owner-onay', '/owner-duyuru', '/owner-bakim']);
  const navigation = renderOwnerNavigation();
  for (const id of ['overview', 'system', 'memories', 'approvals', 'announcements', 'maintenance', 'activity']) {
    assert.match(navigation, new RegExp('href="#' + id + '"'));
  }
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


test('Frieren AI readiness is fetched through the local main-service bridge', async () => {
  let requestedUrl = '';
  const expected = { status: 'ok', discordReady: true, memoryDatabaseReady: true, modelConfigured: true };
  const result = await getFrierenAIReadiness({
    baseUrl: 'http://127.0.0.1:3000',
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => expected };
    }
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:3000/ai-ready');
  assert.deepEqual(result, expected);
});

test('Frieren AI readiness fails closed when the local bridge is unavailable', async () => {
  const result = await getFrierenAIReadiness({
    fetchImpl: async () => { throw new Error('bridge unavailable'); }
  });
  assert.equal(result, null);
});
