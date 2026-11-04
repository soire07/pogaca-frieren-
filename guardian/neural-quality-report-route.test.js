import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNeuralQualityReportRequest } from './neural-quality-report-route.js';

const OIDC = 'test-only-oidc-token-with-more-than-100-characters-'.padEnd(120, 'x');
const TOKEN = 'test-only-github-token-with-more-than-32-chars';
const SOURCE_SHA = 'd'.repeat(40);
const ARTIFACT_SHA = '6a06fbffe77b8c70ee084ce8901edaaaeec4c23fd7360296259a78111facdf5e';

function validReport() {
  const dimensions = ['correctness', 'instruction_adherence', 'turkish_quality', 'grounding', 'safety_privacy', 'conversation_consistency'];
  return {
    decision: 'READY FOR STAGED TEST',
    prompt_set_version: 'tr-conversation-v1',
    checkpoint_sha256: ARTIFACT_SHA,
    artifact_sha256: ARTIFACT_SHA,
    model_backend: 'ufakzeka',
    pretrained_provenance: {
      model_id: 'ufakai/ufakzeka-1', model_repository: 'ufakai/ufakzeka-1-GGUF',
      model_filename: 'ufakzeka-1-q8_0.gguf', license: 'Apache-2.0', model_sha256: ARTIFACT_SHA,
    },
    source_commit_sha: SOURCE_SHA,
    outputs: Array.from({ length: 24 }, (_, i) => ({ id: 'TR-' + String(i + 1).padStart(3, '0'), output: 'test output ' + i })),
    blocking_reasons: [],
    human_review: { completed: true, reviewers_required: 2 },
    review_template: { reviewers: ['reviewer_1', 'reviewer_2'] },
    training_provenance: { manifest_sha256: 'b'.repeat(64), licenses: ['Apache-2.0'] },
    heldout_metrics: { loss: 1.2, perplexity: 3.2, dataset_sha256: 'e'.repeat(64), sample_count: 10, split: 'heldout', evaluation_version: 'test-v1' },
    baseline_comparison: { available: true, improved: true, baseline_checkpoint_sha256: 'c'.repeat(64) },
    metrics: {
      dimension_averages: Object.fromEntries(dimensions.map(key => [key, 3.8])),
      overall_average: 3.8, instruction_adherence_3_or_4_rate: 0.95,
      turkish_quality_3_or_4_rate: 0.95, critical_safety_failures: [], fabricated_claims: [], multi_turn_failures: [],
    },
  };
}

function validEvolutionPlan(report) {
  return {
    schema_version: 1,
    status: 'eligible_for_guard_review',
    mode: 'guardian_supervised',
    gates: {
      ci_passed: true,
      quality_ready: true,
      quality_thresholds_passed: true,
      benchmark_outputs_complete: true,
      baseline_improved: true,
      review_policy_valid: true,
      provenance_valid: true,
    },
    tasks: [],
    requires_guard_review: true,
    apply_changes: false,
    source_commit_sha: report.source_commit_sha,
    artifact_sha256: report.artifact_sha256,
  };
}

function request(body, { authorization = 'Bearer ' + OIDC, githubToken = TOKEN, contentType = 'application/json', url = '/internal/neural-quality-report' } = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    method: 'POST', url, headers: { authorization, 'content-type': contentType, 'x-github-token': githubToken },
    async *[Symbol.asyncIterator]() { yield bytes; },
  };
}

function dependencies(overrides = {}) {
  const saved = [];
  return {
    saved,
    options: {
      env: {},
      verifyToken: async token => {
        if (token !== OIDC) throw new Error('invalid test token');
        return { sha: SOURCE_SHA };
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ workflow_runs: [{
          id: 123, head_sha: SOURCE_SHA, path: '.github/workflows/frieren-neural-ci.yml',
          status: 'completed', conclusion: 'success', html_url: 'https://github.com/soire07/pogaca-frieren-/actions/runs/123',
        }] }),
      }),
      saveReport: async value => { saved.push(value); return { report_sha256: value.reportSha256, artifact_sha256: value.report.artifact_sha256, decision: value.report.decision }; },
      ...overrides,
    },
  };
}

test('Neural report endpoint rejects unauthorized requests before reading or storing payload', async () => {
  const deps = dependencies();
  const result = await handleNeuralQualityReportRequest(request(validReport(), { authorization: 'Bearer invalid' }), deps.options);
  assert.equal(result.status, 401);
  assert.equal(deps.saved.length, 0);
});

test('Neural report endpoint rejects a valid OIDC identity when its commit differs from the report', async () => {
  const deps = dependencies({ verifyToken: async () => ({ sha: 'e'.repeat(40) }) });
  const result = await handleNeuralQualityReportRequest(request(validReport()), deps.options);
  assert.equal(result.status, 401);
  assert.equal(result.payload.error, 'oidc_commit_mismatch');
  assert.equal(deps.saved.length, 0);
});

test('Neural report endpoint requires JSON content type', async () => {
  const deps = dependencies();
  const result = await handleNeuralQualityReportRequest(request(validReport(), { contentType: 'text/plain' }), deps.options);
  assert.equal(result.status, 415);
  assert.equal(deps.saved.length, 0);
});

test('Neural report endpoint rejects payloads over 1 MiB without storing', async () => {
  const deps = dependencies();
  const oversized = Buffer.alloc(1_048_577, 32);
  const result = await handleNeuralQualityReportRequest(request(oversized), deps.options);
  assert.equal(result.status, 413);
  assert.equal(deps.saved.length, 0);
});

test('Neural report endpoint rejects invalid report contracts without querying GitHub or storing', async () => {
  let fetched = false;
  const deps = dependencies({ fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); } });
  const result = await handleNeuralQualityReportRequest(request({ model_backend: 'scratch' }), deps.options);
  assert.equal(result.status, 422);
  assert.equal(fetched, false);
  assert.equal(deps.saved.length, 0);
});

test('Neural report endpoint verifies exact successful workflow and stores report once', async () => {
  const deps = dependencies();
  const result = await handleNeuralQualityReportRequest(request(validReport()), deps.options);
  assert.equal(result.status, 202);
  assert.equal(result.payload.status, 'stored');
  assert.equal(deps.saved.length, 1);
  assert.equal(deps.saved[0].report.ci_evidence.verified, true);
  assert.equal(deps.saved[0].report.decision, 'READY FOR STAGED TEST');
  assert.match(deps.saved[0].reportSha256, /^[a-f0-9]{64}$/);
});

test('Neural report endpoint forces NOT READY when exact CI evidence is unavailable', async () => {
  const deps = dependencies({ fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: [{
    id: 124, head_sha: SOURCE_SHA, path: '.github/workflows/untrusted.yml',
    status: 'completed', conclusion: 'success',
  }] }) }) });
  const result = await handleNeuralQualityReportRequest(request(validReport()), deps.options);
  assert.equal(result.status, 202);
  assert.equal(deps.saved[0].report.decision, 'NOT READY');
  assert.ok(deps.saved[0].report.blocking_reasons.includes('NEURAL_CI_EVIDENCE_NOT_VERIFIED'));
});

test('Neural report endpoint fails closed when Guardian storage is unavailable', async () => {
  const deps = dependencies({ saveReport: async () => { throw new Error('database unavailable'); } });
  const result = await handleNeuralQualityReportRequest(request(validReport()), deps.options);
  assert.equal(result.status, 500);
  assert.equal(result.payload.error, 'guardian_report_storage_failed');
});

test('Guardian accepts a bounded proposal-only evolution plan with matching provenance', async () => {
  const deps = dependencies();
  const report = validReport();
  report.evolution_plan = validEvolutionPlan(report);
  const result = await handleNeuralQualityReportRequest(request(report), deps.options);
  assert.equal(result.status, 202);
  assert.equal(deps.saved.length, 1);
  assert.equal(deps.saved[0].report.evolution_plan.apply_changes, false);
  assert.equal(deps.saved[0].report.evolution_plan.requires_guard_review, true);
});

test('Guardian rejects an evolution plan that authorizes automatic changes', async () => {
  const deps = dependencies();
  const report = validReport();
  report.evolution_plan = validEvolutionPlan(report);
  report.evolution_plan.apply_changes = true;
  const result = await handleNeuralQualityReportRequest(request(report), deps.options);
  assert.equal(result.status, 422);
  assert.ok(result.payload.reasons.includes('EVOLUTION_PLAN_AUTOMATIC_APPLY_FORBIDDEN'));
  assert.equal(deps.saved.length, 0);
});

test('Guardian rejects evolution plans with mismatched commit or artifact fingerprints', async () => {
  for (const field of ['source_commit_sha', 'artifact_sha256']) {
    const deps = dependencies();
    const report = validReport();
    report.evolution_plan = validEvolutionPlan(report);
    report.evolution_plan[field] = field === 'source_commit_sha' ? 'e'.repeat(40) : 'f'.repeat(64);
    const result = await handleNeuralQualityReportRequest(request(report), deps.options);
    assert.equal(result.status, 422);
    assert.equal(deps.saved.length, 0);
  }
});

test('Guardian rejects an eligible plan when the quality report is not ready', async () => {
  const deps = dependencies();
  const report = validReport();
  report.decision = 'NOT READY';
  report.blocking_reasons = ['human_review_missing'];
  report.evolution_plan = validEvolutionPlan(report);
  const result = await handleNeuralQualityReportRequest(request(report), deps.options);
  assert.equal(result.status, 422);
  assert.ok(result.payload.reasons.includes('EVOLUTION_PLAN_ELIGIBILITY_NOT_SUPPORTED'));
  assert.equal(deps.saved.length, 0);
});

test('Guardian refuses to store a plan claiming CI success when matching CI evidence is unavailable', async () => {
  const deps = dependencies({
    fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: [] }) }),
  });
  const report = validReport();
  report.evolution_plan = validEvolutionPlan(report);
  const result = await handleNeuralQualityReportRequest(request(report), deps.options);
  assert.equal(result.status, 422);
  assert.equal(result.payload.error, 'evolution_plan_ci_evidence_unverified');
  assert.equal(deps.saved.length, 0);
});
