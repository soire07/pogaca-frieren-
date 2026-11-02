import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNeuralQualityReportRequest } from './neural-quality-report-route.js';

const SECRET = 'test-only-guardian-secret-with-more-than-32-chars';
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

function request(body, { authorization = 'Bearer ' + SECRET, contentType = 'application/json', url = '/internal/neural-quality-report' } = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    method: 'POST', url, headers: { authorization, 'content-type': contentType },
    async *[Symbol.asyncIterator]() { yield bytes; },
  };
}

function dependencies(overrides = {}) {
  const saved = [];
  return {
    saved,
    options: {
      env: { FRIEREN_NEURAL_GUARDIAN_SECRET: SECRET, FRIEREN_GITHUB_TOKEN: TOKEN },
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
  const result = await handleNeuralQualityReportRequest(request(validReport(), { authorization: 'Bearer wrong' }), deps.options);
  assert.equal(result.status, 401);
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
  assert.equal(result.status, 400);
  assert.equal(result.payload.error, 'invalid_quality_report_payload');
});
