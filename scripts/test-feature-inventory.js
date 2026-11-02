import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectFeatureInventory } from '../feature-inventory-validator.js';

const statuses = ['implemented_needs_runtime_test', 'in_progress', 'planned'];
const feature = (id, name, category = 'RPG', status = 'implemented_needs_runtime_test') => ({ id, name, category, status });
const inventory = (features, overrides = {}) => ({
  count: features.length,
  targetFeatures: 2000,
  auditComplete: false,
  statuses,
  features,
  ...overrides
});

test('current 317-feature inventory has no structural or normalized-name errors', async () => {
  const current = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
  const result = inspectFeatureInventory(current);
  assert.deepEqual(result.errors, []);
  assert.equal(result.featureCount, 317);
  assert.equal(result.byStatus.implemented_needs_runtime_test, 317);
  assert.equal(result.auditComplete, false);
  assert.deepEqual(result.missingRpgIds, Array.from({ length: 19 }, (_, index) => index + 281));
});

test('inventory validator rejects duplicate IDs and normalized duplicate names', () => {
  const result = inspectFeatureInventory(inventory([
    feature('RPG-001', 'Büyü Kitabı'),
    feature('RPG-001', 'Başka özellik'),
    feature('RPG-002', '  BÜYÜ  KİTABI  ')
  ]));
  assert.ok(result.errors.some(error => /duplicate feature ID/i.test(error)));
  assert.ok(result.errors.some(error => /duplicate normalized feature name/i.test(error)));
});

test('inventory validator rejects malformed IDs, missing fields, and unknown statuses', () => {
  const result = inspectFeatureInventory(inventory([
    feature('RPG-1', '', ''),
    feature('BAD-002', 'Unknown prefix', 'RPG', 'verified')
  ]));
  assert.ok(result.errors.some(error => /invalid feature ID/i.test(error)));
  assert.ok(result.errors.some(error => /missing id, name, or category/i.test(error)));
  assert.ok(result.errors.some(error => /invalid status/i.test(error)));
});

test('inventory validator rejects count and target drift without auto-filling gaps', () => {
  const result = inspectFeatureInventory(inventory([
    feature('RPG-001', 'Profile')
  ], { count: 2, targetFeatures: 0 }));
  assert.ok(result.errors.some(error => /count does not match/i.test(error)));
  assert.ok(result.errors.some(error => /targetFeatures/i.test(error)));
  assert.deepEqual(result.missingRpgIds, []);
});
