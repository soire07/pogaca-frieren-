import { readFile, writeFile } from 'node:fs/promises';

export function serializeFeatureTraceabilityReport(report) {
  return JSON.stringify(report, null, 2) + '\n';
}

export function buildFeatureTraceabilityReport({ inventory, commandReport }) {
  if (!Array.isArray(inventory?.features)) throw new Error('FEATURE_INVENTORY_INVALID');
  if (!Array.isArray(commandReport?.results)) throw new Error('COMMAND_AUDIT_REPORT_INVALID');

  const plannedFeatures = inventory.features.filter(feature => feature?.status === 'planned' || String(feature?.id || '').startsWith('ROADMAP-'));
  const implementedInventoryFeatures = inventory.features.filter(feature => feature?.status !== 'planned' && !String(feature?.id || '').startsWith('ROADMAP-'));
  if (Number(inventory.plannedFeatureCount ?? plannedFeatures.length) !== plannedFeatures.length) {
    throw new Error('PLANNED_FEATURE_COUNT_MISMATCH');
  }
  if (plannedFeatures.some(feature => feature?.status !== 'planned' || !String(feature?.id || '').startsWith('ROADMAP-'))) {
    throw new Error('INVALID_PLANNED_ROADMAP_RECORD');
  }

  const featureIds = new Set();
  for (const feature of implementedInventoryFeatures) {
    if (!feature?.id || featureIds.has(feature.id)) throw new Error('FEATURE_ID_MISSING_OR_DUPLICATE: ' + feature?.id);
    featureIds.add(feature.id);
  }

  const commandResults = new Map(commandReport.results.map(result => [result.command, result]));
  const mappedChecks = new Map();
  for (const result of commandReport.results) {
    for (const check of result.behavioralChecks || []) {
      for (const featureId of check.featureIds || []) {
        if (!featureIds.has(featureId)) throw new Error('UNKNOWN_FEATURE_ID_IN_COMMAND_EVIDENCE: ' + featureId);
        if (!mappedChecks.has(featureId)) mappedChecks.set(featureId, []);
        mappedChecks.get(featureId).push({
          command: result.command,
          commandStatus: result.status,
          checkName: check.name,
          passed: check.passed === true
        });
      }
    }
  }

  const features = implementedInventoryFeatures.map(feature => {
    const testPaths = [...new Set(feature.testEvidence?.tests || [])];
    const commandAuditReferenced = testPaths.includes('scripts/live-command-test.js');
    const checks = mappedChecks.get(feature.id) || [];
    const commandNames = [...new Set(checks.map(check => check.command))];
    const allChecksPassed = checks.length > 0
      && checks.every(check => check.passed && check.commandStatus === 'PASS');
    let evidenceStatus = 'missing_test_reference';
    {
      if (checks.length) evidenceStatus = allChecksPassed ? 'verified_by_mapped_command_checks' : 'mapped_command_check_failed_or_inconclusive';
      else if (commandAuditReferenced) evidenceStatus = 'command_association_only_not_feature_proof';
      else if (testPaths.length) evidenceStatus = 'test_file_reference_only_not_execution_proof';
      else evidenceStatus = 'missing_test_reference';
    }
    return {
      id: feature.id,
      name: feature.name,
      category: feature.category,
      inventoryStatus: feature.status,
      evidenceStatus,
      testPaths,
      commandAuditReferenced,
      mappedCommandChecks: checks,
      associatedCommands: commandNames
    };
  });

  const implemented = features;
  const count = status => implemented.filter(feature => feature.evidenceStatus === status).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      inventoryTargetFeatures: inventory.targetFeatures,
      commandAuditGeneratedAt: commandReport.generatedAt || null,
      commandAuditTestRunId: commandReport.testRunId || null,
      executionMode: commandReport.executionMode || null
    },
    rules: [
      'A command PASS is not a feature PASS unless a behavioral check explicitly lists that feature ID in featureIds.',
      'A referenced test file is not proof that the feature passed in this run.',
      'Only mapped checks that all pass under a PASS command count as feature-level verified evidence.',
      'Planned ROADMAP records remain in the inventory as planned and are excluded from implemented feature evidence.',
      'This report does not modify feature-inventory.json or promote inventory statuses.',
      'Synthetic Discord interactions with isolated PostgreSQL are not live Discord user E2E.'
    ],
    summary: {
      totalFeatures: inventory.features.length,
      implementedFeatures: implemented.length,
      plannedFeatures: plannedFeatures.length,
      implementedWithTestFileReferences: implemented.filter(feature => feature.testPaths.length > 0).length,
      implementedReferencedByCommandAudit: implemented.filter(feature => feature.commandAuditReferenced).length,
      implementedWithExplicitMappedChecks: implemented.filter(feature => feature.mappedCommandChecks.length > 0).length,
      verifiedByMappedCommandChecks: count('verified_by_mapped_command_checks'),
      mappedCommandCheckFailedOrInconclusive: count('mapped_command_check_failed_or_inconclusive'),
      commandAssociationOnly: count('command_association_only_not_feature_proof'),
      testFileReferenceOnly: count('test_file_reference_only_not_execution_proof'),
      missingTestReference: count('missing_test_reference')
    },
    features
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
  const commandReport = JSON.parse(await readFile('command-audit-report.json', 'utf8'));
  const report = buildFeatureTraceabilityReport({ inventory, commandReport });
  await writeFile('feature-traceability-report.json', serializeFeatureTraceabilityReport(report));
  console.log(JSON.stringify(report.summary, null, 2));
}
