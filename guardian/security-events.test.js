import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { resolveVerifiedClientIp } from '../security/client-ip.js';
import {
  verifyGuardianEventSignature, normalizeGuardianSecurityEvent,
  recordGuardianSecurityEvent, verifyGuardianEvidenceChain,
  handleGuardianSecurityEventRequest
} from './security-events.js';

const secret = 'guardian-event-test-secret-at-least-32-characters';
const payload = JSON.stringify({
  eventId: 'guard-event-0001', source: 'frieren_guard', system: 'guardian',
  code: 'WAF_BLOCK', severity: 'high', title: 'Suspicious request blocked',
  summary: 'Rate threshold exceeded', observedAt: '2026-11-05T12:00:00.000Z',
  evidence: [{ message: 'Rule threshold 20 requests/minute' }]
});
function signature(body, timestamp) {
  return createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
}
function response() {
  return { status: 0, headers: {}, body: '', writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
}
function request(body, timestamp, sig) {
  return { method: 'POST', url: '/internal/guardian/security-event', headers: {
    'content-type': 'application/json', 'x-frieren-timestamp': timestamp,
    'x-frieren-signature': 'sha256=' + sig, 'x-forwarded-for': '198.51.100.42',
  }, socket: { remoteAddress: '10.0.0.8' }, socket: { remoteAddress: '192.0.2.123' }, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } };
}

test('client IP resolution ignores spoofed forwarding headers from an untrusted peer', () => {
  const result = resolveVerifiedClientIp({
    headers: { 'x-forwarded-for': '203.0.113.99' },
    socket: { remoteAddress: '198.51.100.7' },
  }, { trustedProxyIps: ['10.0.0.8', '10.0.0.9'] });
  assert.deepEqual(result, { clientIp: '198.51.100.7', source: 'socket_peer' });
});

test('client IP resolution accepts the rightmost untrusted hop only behind an explicitly trusted proxy', () => {
  const result = resolveVerifiedClientIp({
    headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.42' },
    socket: { remoteAddress: '10.0.0.8' },
  }, { trustedProxyIps: ['10.0.0.8'] });
  assert.deepEqual(result, { clientIp: '198.51.100.42', source: 'trusted_proxy' });
});

test('client IP resolution walks trusted proxy hops from right to left and normalizes IPv4-mapped peers', () => {
  const result = resolveVerifiedClientIp({
    headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.9' },
    socket: { remoteAddress: '::ffff:10.0.0.8' },
  }, { trustedProxyIps: ['10.0.0.8', '10.0.0.9'] });
  assert.deepEqual(result, { clientIp: '203.0.113.5', source: 'trusted_proxy' });
});

test('client IP resolver refuses malformed and private forwarding chain values', () => {
  const result = resolveVerifiedClientIp({
    headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.9' },
    socket: { remoteAddress: '10.0.0.8' },
  }, { trustedProxyIps: ['10.0.0.8'] });
  assert.deepEqual(result, { clientIp: null, source: 'unverified_proxy' });
});

test('Guardian event HMAC binds the raw body and a short timestamp window', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = signature(payload, timestamp);
  assert.equal(verifyGuardianEventSignature({ rawBody: payload, timestamp, signature: sig, secret }), true);
  assert.equal(verifyGuardianEventSignature({ rawBody: payload + ' ', timestamp, signature: sig, secret }), false);
  assert.equal(verifyGuardianEventSignature({ rawBody: payload, timestamp: '1', signature: sig, secret }), false);
  assert.equal(verifyGuardianEventSignature({ rawBody: payload, timestamp, signature: sig, secret, now: Date.now() + 600_000 }), false);
});

test('Guardian security event normalization validates source, event ID, severity and redacts secrets', () => {
  const normalized = normalizeGuardianSecurityEvent({
    eventId: 'guard-event-0001', source: 'frieren_guard', system: 'guardian',
    code: 'waf_block', severity: 'high', title: 'WAF blocked request',
    summary: 'Authorization: Bearer token-secret-123456',
    evidence: [{ message: 'Blocked path /login' }],
  });
  assert.equal(normalized.code, 'WAF_BLOCK');
  assert.doesNotMatch(normalized.summary, /token-secret-123456/);
  assert.throws(() => normalizeGuardianSecurityEvent({ ...normalized, source: 'unknown' }), /GUARDIAN_EVENT_SOURCE_INVALID/);
  assert.throws(() => normalizeGuardianSecurityEvent({ ...normalized, severity: 'urgent' }), /GUARDIAN_EVENT_SEVERITY_INVALID/);
});

test('Guardian evidence chain appends with a previous hash and deduplicates event IDs atomically', async () => {
  const statements = [];
  let prior = null;
  let existing = false;
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT event_hash FROM owner_guardian_evidence_chain')) return { rows: prior ? [{ event_hash: prior }] : [] };
      if (sql.includes('SELECT event_hash FROM owner_guardian_evidence_chain WHERE event_id')) return { rows: existing ? [{ event_hash: prior }] : [] };
      if (sql.includes('INSERT INTO owner_guardian_evidence_chain')) { prior = params[7]; existing = true; return { rows: [{ sequence_no: 1, event_hash: prior }] }; }
      if (sql.includes('INSERT INTO owner_guardian_incidents')) return { rows: [{ id: 22 }] };
      throw new Error('Unexpected SQL: ' + sql);
    },
    release() {},
  };
  const db = { async connect() { return client; } };
  const event = normalizeGuardianSecurityEvent(JSON.parse(payload));
  const first = await recordGuardianSecurityEvent(db, event, { clientIp: '198.51.100.42', ipSource: 'trusted_proxy' });
  assert.equal(first.duplicate, false);
  assert.equal(first.incident.id, 22);
  assert.match(prior, /^[a-f0-9]{64}$/);
  assert.ok(statements.some(x => x.sql.includes('pg_advisory_xact_lock')));
  const second = await recordGuardianSecurityEvent(db, event, { clientIp: '198.51.100.42', ipSource: 'trusted_proxy' });
  assert.equal(second.duplicate, true);
  assert.equal(statements.filter(x => x.sql.includes('INSERT INTO owner_guardian_evidence_chain')).length, 1);
});

test('Guardian evidence-chain verifier detects a modified payload or broken link', async () => {
  const payloadObject = { eventId: 'one', severity: 'high' };
  const canonical = JSON.stringify(payloadObject);
  const firstHash = createHash('sha256').update('GENESIS\n' + canonical).digest('hex');
  const rows = [
    { sequence_no: 1, event_id: 'one', payload: payloadObject, previous_hash: 'GENESIS', event_hash: firstHash },
    { sequence_no: 2, event_id: 'two', payload: { eventId: 'two' }, previous_hash: 'wrong', event_hash: 'f'.repeat(64) },
  ];
  const result = await verifyGuardianEvidenceChain({ query: async () => ({ rows }) });
  assert.equal(result.valid, false);
  assert.equal(result.checked, 2);
  assert.equal(result.firstInvalidSequence, 2);
});

test('Guardian event endpoint rejects invalid HMAC before database access', async () => {
  const db = { calls: 0, async connect() { this.calls++; throw new Error('must not connect'); } };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = response();
  assert.equal(await handleGuardianSecurityEventRequest(request(payload, timestamp, '0'.repeat(64)), res, { db, secret }), true);
  assert.equal(res.status, 401);
  assert.equal(db.calls, 0);
});

test('Guardian event endpoint stores a valid signed event and returns only a bounded receipt', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = signature(payload, timestamp);
  const statements = [];
  const client = { async query(sql, params = []) {
    statements.push(sql);
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('SELECT event_hash FROM owner_guardian_evidence_chain')) return { rows: [] };
    if (sql.includes('SELECT event_hash FROM owner_guardian_evidence_chain WHERE event_id')) return { rows: [] };
    if (sql.includes('INSERT INTO owner_guardian_evidence_chain')) return { rows: [{ sequence_no: 1, event_hash: params[7] }] };
    if (sql.includes('INSERT INTO owner_guardian_incidents')) return { rows: [{ id: 22 }] };
    throw new Error('Unexpected SQL: ' + sql);
  }, release() {} };
  const db = { async connect() { return client; } };
  const res = response();
  assert.equal(await handleGuardianSecurityEventRequest(request(payload, timestamp, sig), res, { db, secret }), true);
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).incidentId, 22);
  assert.doesNotMatch(res.body, /198\.51\.100\.42/);
  assert.ok(statements.includes('COMMIT'));
});
