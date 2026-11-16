import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachFeatureIdsToBehavioralChecks, getCommandFeatureMap } from './command-feature-map.js';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const inventoryById = new Map(inventory.features.map(feature => [feature.id, feature]));

test('mapped command checks carry only explicit feature IDs', () => {
  const checks = attachFeatureIdsToBehavioralChecks('balik', [
    { name: 'Balıkçılık slash komutu yakalama kaydı', passed: true },
    { name: 'unmapped assertion', passed: true }
  ]);
  assert.deepEqual(checks[0].featureIds, ['ENT-032']);
  assert.equal(Object.hasOwn(checks[1], 'featureIds'), false);
});

test('every declared command mapping points to an implemented inventory feature', () => {
  const map = getCommandFeatureMap();
  const invalid = Object.entries(map).flatMap(([command, checks]) =>
    Object.entries(checks).flatMap(([name, ids]) => ids.filter(id => {
      const feature = inventoryById.get(id);
      return !feature || feature.status === 'planned';
    }).map(id => ({ command, name, id })))
  );
  assert.deepEqual(invalid, []);
});

test('unmapped command checks are retained unchanged and never inferred from command name', () => {
  const input = [{ name: 'not mapped', passed: true }];
  const result = attachFeatureIdsToBehavioralChecks('balik', input);
  assert.deepEqual(result, input);
});
