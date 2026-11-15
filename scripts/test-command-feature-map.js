import test from 'node:test';
import assert from 'node:assert/strict';
import { attachFeatureIdsToBehavioralChecks, getCommandFeatureMap } from './command-feature-map.js';

const inventoryIds = new Set([
  'RPG-005','RPG-006','RPG-007','RPG-010','RPG-011','RPG-012','RPG-013','RPG-016','RPG-017','RPG-018','RPG-019','RPG-020','RPG-021','RPG-022','RPG-024','RPG-025','RPG-027','RPG-028','RPG-029','RPG-030','RPG-032','RPG-033','RPG-035','RPG-036','RPG-037','RPG-039','RPG-041','RPG-043','RPG-044','RPG-047','RPG-048','RPG-050','RPG-053','RPG-058','RPG-059','RPG-060','RPG-061','RPG-062','RPG-063','RPG-064','RPG-065','RPG-068','RPG-070','RPG-071','RPG-075','RPG-080','RPG-081','RPG-090','RPG-091','RPG-092','RPG-096','RPG-097','RPG-098','RPG-113','RPG-119','RPG-120','RPG-121','RPG-123','RPG-124','RPG-125','RPG-131','RPG-143','RPG-145','RPG-147','RPG-148','RPG-155','RPG-158','RPG-160','RPG-178','RPG-181','RPG-182','RPG-183','RPG-184','RPG-185','RPG-186','RPG-187','RPG-188','RPG-206','RPG-207','RPG-221','RPG-237','RPG-238','RPG-239','RPG-240','RPG-241','RPG-242','RPG-244','RPG-245','RPG-249','RPG-258','RPG-271','RPG-318','SRV-003','FUN-003','SOC-002','SOC-004','SOC-005','SOC-007','SOC-009','ARENA-001','ARENA-002','EVENT-001','SITE-001','ENT-031','ENT-032','ENT-033','ENT-034','ENT-035','ENT-036','ENT-038','ENT-039','ENT-041','SOCIAL-001','SOCIAL-002','SOCIAL-003','SOCIAL-004'
]);

test('mapped command checks carry only explicit feature IDs', () => {
  const checks = attachFeatureIdsToBehavioralChecks('balik', [
    { name: 'Balıkçılık slash komutu yakalama kaydı', passed: true },
    { name: 'unmapped assertion', passed: true }
  ]);
  assert.deepEqual(checks[0].featureIds, ['ENT-032']);
  assert.equal(Object.hasOwn(checks[1], 'featureIds'), false);
});

test('every declared command mapping points to an existing implemented inventory ID', () => {
  const map = getCommandFeatureMap();
  const invalid = Object.entries(map).flatMap(([command, checks]) =>
    Object.entries(checks).flatMap(([name, ids]) => ids.filter(id => !inventoryIds.has(id)).map(id => ({ command, name, id })))
  );
  assert.deepEqual(invalid, []);
});

test('unmapped command checks are retained unchanged and never inferred from command name', () => {
  const input = [{ name: 'not mapped', passed: true }];
  const result = attachFeatureIdsToBehavioralChecks('balik', input);
  assert.deepEqual(result, input);
});
