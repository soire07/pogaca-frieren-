import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDependencyAuditEvent,
  requestGithubOidcToken,
  sendGithubGuardEvent,
} from './github-guard-sender.js';

const cleanReport = {
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  vulnerabilities: {},
};
const vulnerableReport = {
  metadata: { vulnerabilities: { info: 0, low: 1, moderate: 1, high: 1, critical: 0, total: 3 } },
  vulnerabilities: {
    'pkg-high': { severity: 'high' },
    'pkg-medium': { severity: 'moderate' },
    'pkg-low': { severity: 'low' },
  },
};

test('clean npm audit creates a heartbeat instead of a fake incident', () => {
  const event = buildDependencyAuditEvent(cleanReport, {
    runId: '123456789',
    sourceSha: 'a'.repeat(40),
    now: '2026-11-12T20:00:00.000Z',
  });
  assert.equal(event.source, 'frieren_guard');
  assert.equal(event.eventType, 'heartbeat');
  assert.equal(event.code, 'DEPENDENCY_AUDIT_CLEAN');
  assert.equal(event.severity, 'low');
  assert.match(event.eventId, /^github-actions-/);
});

test('npm audit findings create a bounded incident with the highest observed severity', () => {
  const event = buildDependencyAuditEvent(vulnerableReport, {
    runId: '123456790',
    sourceSha: 'b'.repeat(40),
    now: '2026-11-12T20:00:00.000Z',
  });
  assert.equal(event.eventType, 'incident');
  assert.equal(event.severity, 'high');
  assert.equal(event.code, 'DEPENDENCY_AUDIT_FINDINGS');
  assert.match(event.summary, /3 vulnerability/);
  assert.equal(event.evidence.filter(item => item.message.startsWith('Affected package:')).length, 3);
});

test('sender rejects malformed npm audit output rather than reporting a clean scan', () => {
  assert.throws(() => buildDependencyAuditEvent({}, { runId: '123456789', sourceSha: 'c'.repeat(40) }), /NPM_AUDIT_REPORT_INVALID/);
  assert.throws(() => buildDependencyAuditEvent(cleanReport, { runId: 'short', sourceSha: 'c'.repeat(40) }), /GUARDIAN_RUN_ID_INVALID/);
});

test('OIDC token request pins the dedicated audience and never falls back to a shared secret', async () => {
  let requested;
  const token = await requestGithubOidcToken({
    env: {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com/request?foo=bar',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-request-token',
    },
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return { ok: true, json: async () => ({ value: 'v'.repeat(200) }) };
    },
  });
  assert.equal(token, 'v'.repeat(200));
  assert.match(requested.url, /audience=frieren-guard-security/);
  assert.equal(requested.options.headers.Authorization, 'Bearer runner-request-token');
});

test('OIDC token request fails closed when GitHub does not provide an identity token', async () => {
  await assert.rejects(requestGithubOidcToken({ env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } }), /GITHUB_ACTIONS_OIDC_UNAVAILABLE/);
});

test('sender posts the exact event body with the OIDC bearer token and validates the receipt', async () => {
  const event = buildDependencyAuditEvent(cleanReport, { runId: '123456791', sourceSha: 'd'.repeat(40) });
  const requests = [];
  const receipt = await sendGithubGuardEvent(event, {
    endpoint: 'https://receiver.invalid/internal/guardian/github-actions-event',
    env: {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com/request',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-token',
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (String(url).includes('token.actions.githubusercontent.com')) return { ok: true, json: async () => ({ value: 'oidc-token'.repeat(30) }) };
      return { ok: true, json: async () => ({ status: 'recorded', eventId: event.eventId }) };
    },
  });
  assert.equal(receipt.status, 'recorded');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer ' + 'oidc-token'.repeat(30));
  assert.deepEqual(JSON.parse(requests[1].options.body), event);
});
