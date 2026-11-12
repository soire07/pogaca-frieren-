import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGithubActionsOidcToken } from './github-oidc.js';
import { handleGithubGuardSecurityEventRequest } from './github-guard-events.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'guard-test-key', alg: 'RS256', use: 'sig' };
const now = Date.now();
const identity = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'frieren-guard-security',
  iat: Math.floor(now / 1000) - 5,
  nbf: Math.floor(now / 1000) - 5,
  exp: Math.floor(now / 1000) + 300,
  repository: 'soire07/pogaca-frieren-',
  repository_owner: 'soire07',
  ref: 'refs/heads/main',
  workflow_ref: 'soire07/pogaca-frieren-/.github/workflows/frieren-guard-external.yml@refs/heads/main',
  sha: 'e'.repeat(40),
};

function makeToken(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'guard-test-key' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ ...identity, ...overrides })).toString('base64url');
  const input = header + '.' + claims;
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}

function response() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body = '') { this.body = body; },
  };
}

function request(event, token = makeToken()) {
  const body = JSON.stringify(event);
  return {
    method: 'POST',
    url: '/internal/guardian/github-actions-event',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
  };
}

function fakeJwksFetch() {
  return async url => {
    assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks');
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
}

function makeDb() {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('WHERE event_id=$1')) return { rows: [] };
      if (sql.includes('ORDER BY sequence_no DESC')) return { rows: [] };
      if (sql.includes('INSERT INTO owner_guardian_evidence_chain')) return { rows: [{ sequence_no: 1, event_hash: params[7] }] };
      if (sql.includes('INSERT INTO owner_guardian_incidents')) return { rows: [{ id: 77 }] };
      throw new Error('Unexpected SQL: ' + sql);
    },
    release() {},
  };
  return { statements, db: { async connect() { return client; } } };
}

function event(eventType = 'heartbeat') {
  return {
    eventId: 'github-actions-123456789',
    source: 'frieren_guard',
    sourceSha: identity.sha,
    eventType,
    code: eventType === 'heartbeat' ? 'DEPENDENCY_AUDIT_CLEAN' : 'DEPENDENCY_AUDIT_FINDINGS',
    severity: eventType === 'heartbeat' ? 'low' : 'high',
    title: 'Production dependency audit',
    summary: 'Real GitHub Actions dependency audit result.',
    observedAt: new Date().toISOString(),
    evidence: [{ message: 'npm audit --omit=dev' }],
  };
}

test('OIDC verifier accepts only the pinned Guard workflow identity', async () => {
  const claims = await verifyGithubActionsOidcToken(makeToken(), {
    audience: 'frieren-guard-security',
    expectedIdentity: {
      repository: identity.repository,
      repository_owner: identity.repository_owner,
      ref: identity.ref,
      workflow_ref: identity.workflow_ref,
    },
    fetchImpl: fakeJwksFetch(),
    now,
  });
  assert.equal(claims.sha, identity.sha);
  await assert.rejects(verifyGithubActionsOidcToken(makeToken({ workflow_ref: 'attacker/workflow' }), {
    audience: 'frieren-guard-security',
    expectedIdentity: { repository: identity.repository, repository_owner: identity.repository_owner, ref: identity.ref, workflow_ref: identity.workflow_ref },
    fetchImpl: fakeJwksFetch(),
    now,
  }));
});

test('valid OIDC heartbeat is recorded as external evidence without creating an incident', async () => {
  const { db, statements } = makeDb();
  const req = request(event());
  const res = response();
  const handled = await handleGithubGuardSecurityEventRequest(req, res, {
    db,
    fetchImpl: fakeJwksFetch(),
  });
  assert.equal(handled, true);
  assert.equal(res.status, 201);
  const receipt = JSON.parse(res.body);
  assert.equal(receipt.sender, 'github_actions');
  assert.equal(receipt.eventType, 'heartbeat');
  assert.equal(receipt.incidentId, null);
  const insert = statements.find(item => item.sql.includes('INSERT INTO owner_guardian_evidence_chain'));
  assert.equal(JSON.parse(insert.params[6]).sender, 'github_actions');
  assert.equal(JSON.parse(insert.params[6]).eventType, 'heartbeat');
  assert.equal(statements.some(item => item.sql.includes('INSERT INTO owner_guardian_incidents')), false);
});

test('valid OIDC vulnerability finding creates a Guardian incident and evidence', async () => {
  const { db, statements } = makeDb();
  const res = response();
  await handleGithubGuardSecurityEventRequest(request(event('incident')), res, {
    db,
    fetchImpl: fakeJwksFetch(),
  });
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).incidentId, 77);
  assert.equal(statements.some(item => item.sql.includes('INSERT INTO owner_guardian_incidents')), true);
});

test('OIDC event endpoint rejects a wrong commit before touching the database', async () => {
  const { db } = makeDb();
  const bad = { ...event(), sourceSha: 'f'.repeat(40) };
  const res = response();
  await handleGithubGuardSecurityEventRequest(request(bad), res, { db, fetchImpl: fakeJwksFetch() });
  assert.equal(res.status, 401);
});

test('OIDC event endpoint rejects missing or forged identity before database access', async () => {
  let calls = 0;
  const db = { async connect() { calls++; throw new Error('must not connect'); } };
  const res = response();
  await handleGithubGuardSecurityEventRequest(request(event(), makeToken({ repository: 'attacker/repo' })), res, {
    db,
    fetchImpl: fakeJwksFetch(),
  });
  assert.equal(res.status, 401);
  assert.equal(calls, 0);
});

test('OIDC event endpoint rejects non-POST requests and non-JSON bodies', async () => {
  const res = response();
  assert.equal(await handleGithubGuardSecurityEventRequest({ method: 'GET', url: '/internal/guardian/github-actions-event' }, res, {}), true);
  assert.equal(res.status, 405);
  const second = response();
  assert.equal(await handleGithubGuardSecurityEventRequest({ method: 'POST', url: '/internal/guardian/github-actions-event', headers: { 'content-type': 'text/plain' } }, second, {}), true);
  assert.equal(second.status, 415);
});
