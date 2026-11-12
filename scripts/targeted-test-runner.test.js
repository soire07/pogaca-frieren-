import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetedTestPlan } from './targeted-test-runner.js';

test('memory privacy requests always use the isolated request runner', () => {
  const plan = buildTargetedTestPlan('PostgreSQL bellek gizliliği ve veri tabanı');
  assert.deepEqual(plan.testArgs, ['scripts/test-request.js', 'PostgreSQL bellek gizliliği ve veri tabanı']);
  assert.equal(plan.memoryPrivacyCoverage, true);
});

test('broad RPG requests select the known regression suites directly', () => {
  const plan = buildTargetedTestPlan('boss hasarı, görev ödülü ve Discord komut etkileşimleri');
  assert.equal(plan.broadRegression, true);
  assert.deepEqual(plan.testArgs, [
    '--test',
    'scripts/test-boss-combat.js',
    'scripts/check-gameplay-integrity.js',
    'scripts/test-discord-scenarios.js',
    'scripts/test-command-interaction-coverage.js'
  ]);
});

test('command interaction requests do not fall through to fuzzy test matching', () => {
  const plan = buildTargetedTestPlan('komut etkileşim kapsamı');
  assert.equal(plan.commandInteractionCoverage, true);
  assert.deepEqual(plan.testArgs, ['--test', 'scripts/test-command-interaction-coverage.js']);
});

test('ordinary targeted requests use the existing request matcher', () => {
  const plan = buildTargetedTestPlan('balıkçılık seviye ve olta geliştirme');
  assert.deepEqual(plan.testArgs, ['scripts/test-request.js', 'balıkçılık seviye ve olta geliştirme']);
});


test('targeted test runner rejects empty and oversized requests before spawning a process', async () => {
  const { runTargetedTests } = await import('./targeted-test-runner.js');
  let spawned = false;
  await assert.rejects(runTargetedTests('   ', { spawnImpl: () => { spawned = true; } }), /INVALID_TARGETED_TEST_TARGET/);
  await assert.rejects(runTargetedTests('x'.repeat(4001), { spawnImpl: () => { spawned = true; } }), /INVALID_TARGETED_TEST_TARGET/);
  assert.equal(spawned, false);
});
