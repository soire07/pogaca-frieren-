import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLiveMemoryPrivacyProof, isMemoryPrivacyTarget } from './test-report-guards.js';

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
