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

test('planned roadmap records remain preserved and are excluded from implemented traceability', () => {
  const report = buildFeatureTraceabilityReport({
    inventory: {
      targetFeatures: 3,
      features: [
        ...inventory.features,
        { id: 'ROADMAP-0001', name: 'Preview a future capability', category: 'RPG', status: 'planned', planningNote: 'Candidate only; not implemented or tested.' }
      ]
    },
    commandReport: { results: [] }
  });
  assert.equal(report.summary.totalFeatures, 3);
  assert.equal(report.summary.implementedFeatures, 2);
  assert.equal(report.summary.plannedFeatures, 1);
  assert.equal(report.features.some(feature => feature.id === 'ROADMAP-0001'), false);
});

test('planned roadmap records cannot be verified by command evidence', () => {
  assert.throws(() => buildFeatureTraceabilityReport({
    inventory: {
      targetFeatures: 1,
      features: [{ id: 'ROADMAP-0001', name: 'Preview a future capability', category: 'RPG', status: 'planned' }]
    },
    commandReport: {
      results: [{ command: 'future', status: 'PASS', behavioralChecks: [{ name: 'future', passed: true, featureIds: ['ROADMAP-0001'] }] }]
    }
  }), /UNKNOWN_FEATURE_ID_IN_COMMAND_EVIDENCE/);
});
