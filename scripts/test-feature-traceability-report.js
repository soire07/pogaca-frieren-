import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureTraceabilityReport, serializeFeatureTraceabilityReport } from './build-feature-traceability-report.js';

const inventory = {
  targetFeatures: 2,
  features: [
    { id: 'RPG-001', name: 'Profile', category: 'RPG', status: 'implemented_needs_runtime_test', testEvidence: { tests: ['scripts/live-command-test.js'] } },
    { id: 'RPG-002', name: 'Inventory', category: 'RPG', status: 'implemented_needs_runtime_test', testEvidence: { tests: ['scripts/test-inventory.js'] } },
  ]
};
const commandReport = {
  generatedAt: '2026-11-15T00:00:00.000Z',
  testRunId: 'audit-1',
  executionMode: 'synthetic Discord interaction; isolated PostgreSQL schema frieren_test',
  results: [{
    command: 'karakter',
    status: 'PASS',
    behavioralChecks: [
      { name: 'profile fields persisted', passed: true, featureIds: ['RPG-001'] }
    ]
  }]
};

test('only explicitly mapped passing behavioral checks verify a feature', () => {
  const report = buildFeatureTraceabilityReport({ inventory, commandReport });
  assert.equal(report.summary.verifiedByMappedCommandChecks, 1);
  assert.equal(report.features[0].evidenceStatus, 'verified_by_mapped_command_checks');
});

test('a command PASS without feature IDs is association only, not feature proof', () => {
  const report = buildFeatureTraceabilityReport({
    inventory,
    commandReport: { results: [{ command: 'karakter', status: 'PASS', behavioralChecks: [{ name: 'profile', passed: true }] }] }
  });
  assert.equal(report.features[0].evidenceStatus, 'command_association_only_not_feature_proof');
  assert.equal(report.summary.verifiedByMappedCommandChecks, 0);
});

test('a failed mapped check cannot verify a feature', () => {
  const report = buildFeatureTraceabilityReport({
    inventory,
    commandReport: { results: [{ command: 'karakter', status: 'FAIL', behavioralChecks: [{ name: 'profile', passed: true, featureIds: ['RPG-001'] }] }] }
  });
  assert.equal(report.features[0].evidenceStatus, 'mapped_command_check_failed_or_inconclusive');
  assert.equal(report.summary.verifiedByMappedCommandChecks, 0);
});

test('test-file references are reported separately from execution proof', () => {
  const report = buildFeatureTraceabilityReport({ inventory, commandReport: { results: [] } });
  assert.equal(report.features[1].evidenceStatus, 'test_file_reference_only_not_execution_proof');
  assert.equal(report.summary.implementedWithTestFileReferences, 2);
});

test('unknown feature IDs and duplicate inventory IDs are rejected', () => {
  assert.throws(() => buildFeatureTraceabilityReport({
    inventory,
    commandReport: { results: [{ command: 'x', status: 'PASS', behavioralChecks: [{ name: 'bad', passed: true, featureIds: ['NOPE'] }] }] }
  }), /UNKNOWN_FEATURE_ID/);
  assert.throws(() => buildFeatureTraceabilityReport({
    inventory: { features: [inventory.features[0], inventory.features[0]] },
    commandReport: { results: [] }
  }), /DUPLICATE/);
});

test('serialized traceability report is valid JSON with a real trailing newline', () => {
  const serialized = serializeFeatureTraceabilityReport(buildFeatureTraceabilityReport({ inventory, commandReport }));
  assert.equal(serialized.endsWith('\n'), true);
  assert.doesNotThrow(() => JSON.parse(serialized));
});

test('planned roadmap records are rejected from the active inventory', () => {
  assert.throws(() => buildFeatureTraceabilityReport({
    inventory: { features: [{ id: 'ROADMAP-0001', name: 'Future', category: 'RPG', status: 'planned' }] },
    commandReport: { results: [] }
  }), /PLANNED_FEATURES_NOT_ALLOWED/);
});

test('ROADMAP-prefixed IDs are rejected even when their status is not planned', () => {
  assert.throws(() => buildFeatureTraceabilityReport({
    inventory: { features: [{ id: 'ROADMAP-0002', name: 'Legacy candidate', category: 'RPG', status: 'implemented_needs_runtime_test' }] },
    commandReport: { results: [] }
  }), /PLANNED_FEATURES_NOT_ALLOWED/);
});
