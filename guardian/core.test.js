import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGuardianIncident,
  classifyGuardianSeverity,
  canRequestGuardianReview,
  evaluateGuardianApprovalGate,
  evaluateNeuralQualityGate,
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
    assert.doesNotMatch(redacted, /\$1\[REDACTED\]/, 'replacement backreference leaked into sanitized text');
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


function readyNeuralReport() {
  const dimensions = ['correctness', 'instruction_adherence', 'turkish_quality', 'grounding', 'safety_privacy', 'conversation_consistency'];
  return {
    decision: 'READY FOR STAGED TEST',
    prompt_set_version: 'tr-conversation-v1',
    checkpoint_sha256: 'a'.repeat(64),
    model_backend: 'ufakzeka',
    artifact_sha256: 'a'.repeat(64),
    outputs: Array.from({ length: 24 }, (_, index) => ({ id: 'TR-' + String(index + 1).padStart(3, '0'), output: 'Yanıt ' + index })),
    blocking_reasons: [],
    human_review: { completed: true, reviewers_required: 2 },
    review_template: { reviewers: ['reviewer_1', 'reviewer_2'] },
    checkpoint_metadata: { loss_objective_version: 2 },
    training_provenance: { manifest_sha256: 'b'.repeat(64), licenses: ['Apache-2.0'] },
    heldout_metrics: { loss: 1.2, perplexity: 3.32, loss_objective_version: 2, checkpoint_training_loss_objective_version: 2 },
    baseline_comparison: { available: true, improved: true, baseline_checkpoint_sha256: 'c'.repeat(64) },
    metrics: {
      dimension_averages: Object.fromEntries(dimensions.map(key => [key, 3.8])),
      overall_average: 3.8,
      instruction_adherence_3_or_4_rate: 0.96,
      turkish_quality_3_or_4_rate: 0.96,
      critical_safety_failures: [],
      fabricated_claims: [],
      multi_turn_failures: [],
    },
  };
}

test('Neural Guardian fails closed when complete independent quality evidence is absent', () => {
  const result = evaluateNeuralQualityGate();
  assert.equal(result.canStage, false);
  assert.equal(result.canMerge, false);
  assert.equal(result.canDeploy, false);
  assert.ok(result.reasons.includes('NEURAL_QUALITY_REPORT_NOT_READY'));
  assert.ok(result.reasons.includes('NEURAL_MEMORY_ISOLATION_NOT_PASSED'));
});

test('Neural Guardian requires all quality and operational gates plus separate approvals', () => {
  const input = {
    qualityReport: readyNeuralReport(),
    stagedTestsPassed: true,
    memoryIsolationPassed: true,
    securityChecksPassed: true,
    resourceChecksPassed: true,
  };
  const staged = evaluateNeuralQualityGate(input);
  assert.equal(staged.canStage, true);
  assert.equal(staged.canMerge, false);
  assert.equal(staged.canDeploy, false);
  assert.equal(staged.decision, 'READY_FOR_OWNER_APPROVAL');

  const approved = evaluateNeuralQualityGate({ ...input, ownerApproved: true });
  assert.equal(approved.canMerge, true);
  assert.equal(approved.canDeploy, false);

  const deployed = evaluateNeuralQualityGate({ ...input, ownerApproved: true, deploymentApproved: true });
  assert.equal(deployed.canDeploy, true);
  assert.equal(deployed.decision, 'APPROVED_FOR_DEPLOYMENT');
});

test('Neural Guardian blocks empty benchmark outputs, missing reviewers and fabricated claims', () => {
  const report = readyNeuralReport();
  report.outputs[7].output = '   ';
  report.human_review.reviewers_required = 1;
  report.metrics.fabricated_claims = ['TR-019:reviewer_1'];
  const result = evaluateNeuralQualityGate({
    qualityReport: report,
    stagedTestsPassed: true,
    memoryIsolationPassed: true,
    securityChecksPassed: true,
    resourceChecksPassed: true,
    ownerApproved: true,
    deploymentApproved: true,
  });
  assert.equal(result.canStage, false);
  assert.equal(result.canMerge, false);
  assert.equal(result.canDeploy, false);
  assert.ok(result.reasons.includes('NEURAL_BENCHMARK_OUTPUTS_INCOMPLETE'));
  assert.ok(result.reasons.includes('NEURAL_INDEPENDENT_HUMAN_REVIEW_REQUIRED'));
  assert.ok(result.reasons.includes('NEURAL_FABRICATED_CLAIMS'));
});

test('Neural Guardian blocks safety failures, low dimensions and baseline regressions', () => {
  const report = readyNeuralReport();
  report.metrics.critical_safety_failures = ['TR-011:reviewer_2'];
  report.metrics.dimension_averages.correctness = 2.9;
  report.baseline_comparison.improved = false;
  const result = evaluateNeuralQualityGate({
    qualityReport: report,
    stagedTestsPassed: true,
    memoryIsolationPassed: true,
    securityChecksPassed: true,
    resourceChecksPassed: true,
    ownerApproved: true,
    deploymentApproved: true,
  });
  assert.equal(result.canDeploy, false);
  assert.ok(result.reasons.includes('NEURAL_CRITICAL_SAFETY_FAILURE'));
  assert.ok(result.reasons.includes('NEURAL_DIMENSION_THRESHOLD_FAILED'));
  assert.ok(result.reasons.includes('NEURAL_COMPARABLE_IMPROVED_BASELINE_REQUIRED'));
});

test('Neural Guardian requires the exact ordered benchmark IDs and objective provenance', () => {
  const report = readyNeuralReport();
  report.outputs[0].id = 'TR-002';
  report.outputs[1].id = 'TR-001';
  report.checkpoint_metadata.loss_objective_version = 1;
  const result = evaluateNeuralQualityGate({
    qualityReport: report,
    stagedTestsPassed: true,
    memoryIsolationPassed: true,
    securityChecksPassed: true,
    resourceChecksPassed: true,
    ownerApproved: true,
    deploymentApproved: true,
  });
  assert.equal(result.canDeploy, false);
  assert.ok(result.reasons.includes('NEURAL_BENCHMARK_OUTPUTS_INCOMPLETE'));
  assert.ok(result.reasons.includes('NEURAL_EVALUATION_OBJECTIVE_MISMATCH'));
});

test('Neural Guardian rejects incomplete reviewer identities and invalid training provenance', () => {
  const report = readyNeuralReport();
  report.review_template.reviewers = ['reviewer_1', 'reviewer_1'];
  report.training_provenance.manifest_sha256 = 'not-a-sha256';
  const result = evaluateNeuralQualityGate({ qualityReport: report });
  assert.equal(result.canStage, false);
  assert.ok(result.reasons.includes('NEURAL_INDEPENDENT_HUMAN_REVIEW_REQUIRED'));
  assert.ok(result.reasons.includes('NEURAL_TRAINING_PROVENANCE_MISSING'));
});


test('Neural Guardian rejects scratch reports even when every other quality metric looks ready', () => {
  const report = readyNeuralReport();
  report.model_backend = 'scratch';
  const result = evaluateNeuralQualityGate({ qualityReport: report, stagedTestsPassed: true, memoryIsolationPassed: true, securityChecksPassed: true, resourceChecksPassed: true, ownerApproved: true, deploymentApproved: true });
  assert.equal(result.canStage, false);
  assert.equal(result.canMerge, false);
  assert.equal(result.canDeploy, false);
  assert.ok(result.reasons.includes('NEURAL_ACTIVE_BACKEND_NOT_EVALUATED'));
});
