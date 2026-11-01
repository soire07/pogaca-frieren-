import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerScenarioReport } from './owner-scenario-report.js';

test('scenario reports distinguish a proven pass from an unmatched request', () => {
  const passed = buildOwnerScenarioReport('boss hasarı', {
    code: 0,
    stdout: 'SEÇİLEN TEST DOSYALARI: scripts/test-boss-combat.js (3 eşleşme)\n# tests 8\n# pass 8\n# fail 0'
  });
  assert.equal(passed.status, 'PASS');
  assert.deepEqual(passed.summary, { total: 8, pass: 8, fail: 0, skipped: 0 });
  assert.deepEqual(passed.testFiles, ['scripts/test-boss-combat.js']);
  const missing = buildOwnerScenarioReport('bilinmeyen yeni davranış', {
    code: 3,
    stdout: 'HEDEFE ÖZEL TEST: BULUNAMADI'
  });
  assert.equal(missing.status, 'NOT_TESTED');
  assert.equal(missing.testFiles.length, 0);
});

test('memory privacy scenarios require explicit live PostgreSQL proof', () => {
  const report = buildOwnerScenarioReport('bellek gizliliği', {
    code: 0,
    stdout: 'SEÇİLEN TEST DOSYALARI: ai-agent/memory-store.test.js (2 eşleşme)\n# tests 2\n# pass 2\n# fail 0'
  });
  assert.equal(report.status, 'FAIL');
  assert.match(report.failedStages[0], /PostgreSQL/);
});

test('scenario report stores only bounded summaries and does not expose raw output', () => {
  const report = buildOwnerScenarioReport('komut testi', {
    code: 1,
    stdout: 'SEÇİLEN TEST DOSYALARI: scripts/test-discord-scenarios.js (1 eşleşme)\n# tests 4\n# pass 3\n# fail 1\nprivate-token-value',
    stderr: 'private-token-value'
  });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.summary.fail, 1);
  assert.doesNotMatch(JSON.stringify(report), /private-token-value/);
});

test('memory privacy scenarios pass only when the live PostgreSQL test file reports success', () => {
  const report = buildOwnerScenarioReport('bellek gizliliği', {
    code: 0,
    stdout: 'SEÇİLEN TEST DOSYALARI: ai-agent/memory-store.test.js (2 eşleşme)\n# tests 2\n# pass 2\n# fail 0\n--- scripts/test-live-memory.js | BAŞARILI ---\nCANLI POSTGRESQL TESTİ: BAŞARILI'
  });
  assert.equal(report.status, 'PASS');
});
