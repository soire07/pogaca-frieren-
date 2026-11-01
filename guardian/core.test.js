import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuardianIncident,
  classifyGuardianSeverity,
  canRequestGuardianReview,
  evaluateGuardianApprovalGate,
  redactGuardianText,
} from './core.js';

test('incident fingerprints are stable across timestamps and Discord IDs', () => {
  const first = createGuardianIncident({
    system: 'pogaca_frieren', code: 'RPG_ERROR',
    title: 'Boss ödülü verilemedi',
    summary: 'Kullanıcı 123456789012345678 için 2026-11-02 19:30:00 işleminde timeout oluştu.',
  });
  const second = createGuardianIncident({
    system: 'pogaca_frieren', code: 'RPG_ERROR',
    title: 'Boss ödülü verilemedi',
    summary: 'Kullanıcı 987654321098765432 için 2026-11-03 20:45:00 işleminde timeout oluştu.',
  });
  assert.equal(first.fingerprint, second.fingerprint);
});

test('incident evidence redacts secrets and rejects unsafe file paths', () => {
  const incident = createGuardianIncident({
    system: 'frieren_ai',
    title: 'API error',
    summary: 'GROQ_API_KEY=private-value request failed',
    evidence: [
      { file: '../.env', line: 4, message: 'DISCORD_TOKEN=private-token' },
      { file: 'ai-agent/index.js', line: 42, message: 'Authorization: Bearer abcdefghijklmnop' },
    ],
  });
  assert.doesNotMatch(incident.summary, /private-value/);
  assert.equal(incident.evidence.length, 1);
  assert.doesNotMatch(incident.evidence[0].message, /abcdefghijklmnop/);
});

test('severity classification prioritizes data integrity and security incidents', () => {
  assert.equal(classifyGuardianSeverity('duplicate reward caused balance loss'), 'critical');
  assert.equal(classifyGuardianSeverity('uncaught exception in command'), 'high');
  assert.equal(classifyGuardianSeverity('slow response latency'), 'medium');
  assert.equal(classifyGuardianSeverity('minor layout detail'), 'low');
});

test('review queue is bounded by active jobs, cooldown and maximum attempts', () => {
  assert.equal(canRequestGuardianReview({ activeJob: true }).reason, 'REVIEW_ALREADY_RUNNING');
  assert.equal(canRequestGuardianReview({ attempts: 3 }).reason, 'REVIEW_ATTEMPT_LIMIT');
  assert.equal(canRequestGuardianReview({
    attempts: 1, lastReviewAt: new Date(1000).toISOString(), now: 2000, cooldownMs: 5000,
  }).reason, 'REVIEW_COOLDOWN');
  assert.equal(canRequestGuardianReview({ attempts: 1 }).allowed, true);
});

test('merge and deployment remain blocked until checks and separate owner approvals pass', () => {
  assert.deepEqual(evaluateGuardianApprovalGate({
    testsPassed: true, securityPassed: true, dataIntegrityPassed: true,
  }), {
    checksPassed: true, canMerge: false, canDeploy: false, reason: 'OWNER_APPROVAL_REQUIRED',
  });
  assert.equal(evaluateGuardianApprovalGate({
    testsPassed: true, securityPassed: true, dataIntegrityPassed: true, ownerApproved: true,
  }).canDeploy, false);
  assert.equal(evaluateGuardianApprovalGate({
    testsPassed: true, securityPassed: true, dataIntegrityPassed: true,
    ownerApproved: true, deploymentApproved: true,
  }).canDeploy, true);
});

test('incident summaries redact Discord IDs and email addresses before persistence', () => {
  const incident = createGuardianIncident({
    system: 'pogaca_frieren',
    title: 'Command error',
    summary: 'User 1539562273197260860 contact user@example.com failed.',
  });
  assert.doesNotMatch(incident.summary, /1539562273197260860/);
  assert.doesNotMatch(incident.summary, /user@example.com/);
  assert.match(incident.summary, /\[ID\]/);
  assert.match(incident.summary, /\[EMAIL\]/);
});

test('secret redaction never returns the raw credential', () => {
  const value = redactGuardianText('DATABASE_URL=postgres://user:secret@host/db');
  assert.doesNotMatch(value, /postgres:\/\/user:secret/);
});

test('secret redaction covers bearer/basic auth, common credential variables and database URLs', () => {
  const samples = [
    'Authorization: Bearer bearer-secret-123456',
    'Authorization: Basic YWRtaW46c2VjcmV0',
    'SERVICE_TOKEN=service-secret-123456',
    'PRIVATE_API_KEY=api-secret-123456',
    'mysql://dbuser:mysql-secret@db.example.test/app',
    'mongodb+srv://dbuser:mongo-secret@cluster.example.test/app',
    'https://panel-user:panel-secret@example.test/private',
  ];
  for (const sample of samples) {
    const redacted = redactGuardianText(sample);
    assert.notEqual(redacted, sample);
    for (const secret of [
      'bearer-secret-123456',
      'YWRtaW46c2VjcmV0',
      'service-secret-123456',
      'api-secret-123456',
      'mysql-secret',
      'mongo-secret',
      'panel-secret',
    ]) assert.equal(redacted.includes(secret), false, 'credential leaked: ' + secret);
  }
});
