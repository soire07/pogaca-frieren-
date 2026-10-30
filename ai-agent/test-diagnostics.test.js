import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDiagnostics, extractFailureLocations } from './test-diagnostics.js';

test('extracts source locations and removes duplicates', () => {
  const output = 'at run (ai-agent/index.js:412:19)\nscripts/example.test.js:27:5\nat run (ai-agent/index.js:412:19)';
  assert.deepEqual(extractFailureLocations(output), [
    { file: 'ai-agent/index.js', line: 412, column: 19 },
    { file: 'scripts/example.test.js', line: 27, column: 5 }
  ]);
});

test('reports each check and the failed stages', () => {
  const report = buildTestDiagnostics({
    syntax: { code: 0 },
    audit: { code: 1, stdout: 'scripts/audit.js:44:8' },
    suite: { code: 0 },
    targeted: { code: 1, stdout: 'scripts/target.test.js:18:3' },
    liveRpg: { ok: true }
  });
  assert.deepEqual(report.checks.map(item => item.status), ['PASS', 'FAIL', 'PASS', 'FAIL', 'PASS']);
  assert.deepEqual(report.failedStages, ['Komut sözleşmeleri', 'Hedefli testler']);
  assert.equal(report.locations.length, 2);
});

test('does not mark missing, failed, or timed out checks as successful', () => {
  const report = buildTestDiagnostics({
    syntax: { code: null },
    audit: { code: 0 },
    suite: { code: null, timedOut: true },
    targeted: { applicable: false },
    liveRpg: { ok: false }
  });
  assert.deepEqual(report.checks.map(item => item.status), ['ERROR', 'PASS', 'TIMEOUT', 'NOT_RUN', 'FAIL']);
  assert.equal(report.overall, 'FAIL');
});
