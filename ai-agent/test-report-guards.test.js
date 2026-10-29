import test from 'node:test';
import assert from 'node:assert/strict';
import { countNodeTests, hasLiveMemoryPrivacyProof, isMemoryPrivacyTarget, liveMemoryPrivacySummarySuffix } from './test-report-guards.js';

test('recognizes Turkish and English memory privacy targets', () => {
  assert.equal(isMemoryPrivacyTarget('memory privacy'), true);
  assert.equal(isMemoryPrivacyTarget('bellek gizliliği PostgreSQL'), true);
  assert.equal(isMemoryPrivacyTarget('boss damage'), false);
});

test('does not accept unit-test-only output as live privacy proof', () => {
  const unitOnly = 'SEÇİLEN TEST DOSYALARI: ai-agent/memory-store.test.js (2 eşleşme)\n21 test başarılı';
  assert.equal(hasLiveMemoryPrivacyProof('memory privacy', unitOnly), false);
});

test('does not accept a skipped or failed live database test', () => {
  assert.equal(hasLiveMemoryPrivacyProof('memory privacy', 'scripts/test-live-memory.js\nCANLI POSTGRESQL TESTİ: ATLANDI'), false);
  assert.equal(hasLiveMemoryPrivacyProof('memory privacy', 'scripts/test-live-memory.js\nCANLI POSTGRESQL TESTİ: BAŞARISIZ'), false);
});

test('accepts only explicit successful live PostgreSQL test output', () => {
  const passed = '--- scripts/test-live-memory.js | BAŞARILI ---\nCANLI POSTGRESQL TESTİ: BAŞARILI';
  assert.equal(hasLiveMemoryPrivacyProof('memory privacy', passed), true);
});

test('does not require live memory proof for unrelated targets', () => {
  assert.equal(hasLiveMemoryPrivacyProof('boss damage', 'only combat tests'), true);
});

test('formats live memory proof as a real new line, not a literal backslash-n', () => {
  const suffix = liveMemoryPrivacySummarySuffix(true);
  assert.equal(suffix.startsWith('\n'), true);
  assert.equal(suffix.includes('\n'), false);
  assert.match(suffix, /Canlı PostgreSQL bellek gizliliği: BAŞARILI/);
});

test('omits the live memory suffix for unrelated test targets', () => {
  assert.equal(liveMemoryPrivacySummarySuffix(false), '');
});


test('counts real node:test summary totals and rejects selected-file banners without test totals', () => {
  assert.equal(countNodeTests('SEÇİLEN TEST DOSYALARI: scripts/test-boss-combat.js'), 0);
  assert.equal(countNodeTests('ℹ tests 22\nℹ pass 22\nℹ fail 0'), 22);
  assert.equal(countNodeTests('ℹ tests 3\nℹ tests 4'), 7);
  assert.equal(countNodeTests(''), 0);
});
