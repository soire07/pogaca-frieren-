import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  probeReadiness, buildReadinessFailureEvent, sendSignedGuardianEvent, runExternalHealthMonitor,
} from './external-health-sender.js';

const secret = 'test-only-guardian-event-secret-at-least-32-chars';

test('readiness probe accepts only HTTP 200 with status ok', async () => {
  const healthy = await probeReadiness('https://example.test/ready', {
    fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'ok', checks: { database: 'ok' } }) }),
  });
  assert.equal(healthy.healthy, true);
  const unhealthy = await probeReadiness('https://example.test/ready', {
    fetchImpl: async () => ({ status: 503, json: async () => ({ status: 'not_ready' }) }),
  });
  assert.equal(unhealthy.healthy, false);
});

test('network failures become real monitor observations without exposing exception text', async () => {
  const result = await probeReadiness('https://example.test/ready', {
    fetchImpl: async () => { throw new Error('private-token-must-not-leak'); },
  });
  assert.equal(result.healthy, false);
  assert.equal(result.readiness, 'network_error');
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
});

test('failure event has a stable daily id for receiver-side idempotency', () => {
  const first = buildReadinessFailureEvent({ statusCode: 503, readiness: 'not_ready', checks: { discord: 'not_ready' } }, {
    now: new Date('2026-11-12T10:00:00.000Z'),
  });
  const second = buildReadinessFailureEvent({ statusCode: 503, readiness: 'not_ready' }, {
    now: new Date('2026-11-12T11:00:00.000Z'),
  });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.source, 'frieren_guard');
  assert.equal(first.code, 'POGACA_READINESS_FAILED');
  assert.equal(first.severity, 'high');
});

test('signed sender signs the exact body and accepts only receiver success statuses', async () => {
  let request;
  const result = await sendSignedGuardianEvent({ eventId: 'guard-health-pogaca-20261112' }, {
    secret,
    now: 1794484800000,
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return { status: 201 };
    },
  });
  const expected = createHmac('sha256', secret)
    .update(request.headers['x-frieren-timestamp'] + '.' + request.body)
    .digest('hex');
  assert.equal(request.headers['x-frieren-signature'], 'sha256=' + expected);
  assert.equal(result.delivered, true);
  await assert.rejects(() => sendSignedGuardianEvent({}, {
    secret: 'weak', fetchImpl: async () => ({ status: 201 }),
  }), /SECRET_MISSING_OR_WEAK/);
  await assert.rejects(() => sendSignedGuardianEvent({}, {
    secret, fetchImpl: async () => ({ status: 401 }),
  }), /DELIVERY_FAILED_401/);
});

test('healthy probe never emits an external Guardian event', async () => {
  const result = await runExternalHealthMonitor({
    probeUrl: 'https://example.test/ready',
    secret,
    fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'ok' }) }),
  });
  assert.equal(result.healthy, true);
  assert.equal(result.delivered, false);
});