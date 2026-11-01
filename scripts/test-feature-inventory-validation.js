import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateFeatureInventory } from '../feature-inventory-validation.js';

const base = () => ({
  targetFeatures: 2000,
  auditComplete: false,
  count: 2,
  statuses: ['implemented_needs_runtime_test', 'in_progress', 'planned'],
  features: [
    { id: 'RPG-001', name: 'First feature', category: 'RPG', status: 'implemented_needs_runtime_test' },
    { id: 'RPG-003', name: 'Third feature', category: 'Combat', status: 'planned' }
  ]
});

test('current 317-feature inventory passes structural validation without requiring contiguous IDs', async () => {
  const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
  assert.equal(inventory.features.length, 317);
  assert.deepEqual(validateFeatureInventory(inventory), []);
});

test('feature inventory rejects duplicate IDs', () => {
  const inventory = base();
  inventory.features[1].id = inventory.features[0].id;
  assert.ok(validateFeatureInventory(inventory).some(error => error.includes('kimlikleri benzersiz')));
});

test('feature inventory rejects names duplicated after trimming and case normalization', () => {
  const inventory = base();
  inventory.features[1].name = '  FIRST FEATURE ';
  assert.ok(validateFeatureInventory(inventory).some(error => error.includes('adları büyük/küçük harf')));
});

test('feature inventory rejects count drift, invalid status and blank names', () => {
  const inventory = base();
  inventory.count = 3;
  inventory.features[1].status = 'verified_without_evidence';
  inventory.features[1].name = '   ';
  const errors = validateFeatureInventory(inventory);
  assert.ok(errors.some(error => error.includes('count alanı')));
  assert.ok(errors.some(error => error.includes('Geçersiz durum')));
  assert.ok(errors.some(error => error.includes('adı boş')));
});

test('feature inventory rejects malformed IDs and missing categories', () => {
  const inventory = base();
  inventory.features[1].id = 'RPG-X';
  inventory.features[1].category = '';
  const errors = validateFeatureInventory(inventory);
  assert.ok(errors.some(error => error.includes('Geçersiz özellik kimliği')));
  assert.ok(errors.some(error => error.includes('kategorisi boş')));
});

test('feature inventory rejects malformed top-level data', () => {
  assert.ok(validateFeatureInventory(null).length > 0);
  const inventory = base();
  inventory.features = null;
  assert.ok(validateFeatureInventory(inventory).some(error => error.includes('features bir dizi')));
});
