import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedTestRunContext } from './isolated-test-run-context.js';

test('each isolated command test run receives distinct guild and player identifiers', () => {
  const first = createIsolatedTestRunContext(3, 'run-a');
  const second = createIsolatedTestRunContext(3, 'run-b');

  assert.equal(first.guildIds.length, 3);
  assert.equal(new Set(first.guildIds).size, 3);
  assert.equal(new Set(second.guildIds).size, 3);
  assert.ok(first.guildIds.every(id => !second.guildIds.includes(id)));
  assert.notEqual(first.userId(1), second.userId(1));
  assert.notEqual(first.coopUserPrefix, second.coopUserPrefix);
});

test('isolated command test run identifiers are stable within one run and reject invalid input', () => {
  const run = createIsolatedTestRunContext(2, 'fixed-run');

  assert.equal(run.guildIds[0], createIsolatedTestRunContext(2, 'fixed-run').guildIds[0]);
  assert.equal(run.userId(1), run.userId(1));
  assert.throws(() => createIsolatedTestRunContext(0, 'fixed-run'), /INVALID_TEST_COMMAND_COUNT/);
  assert.throws(() => createIsolatedTestRunContext(1000, 'fixed-run'), /INVALID_TEST_COMMAND_COUNT/);
  assert.throws(() => createIsolatedTestRunContext(1, ''), /INVALID_TEST_RUN_ID/);
});

test('live command harness uses the generated run identity for guilds, users and co-op fixtures', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./live-command-test.js', import.meta.url), 'utf8');

  assert.match(source, /createIsolatedTestRunContext\(Math\.max\(1, commands\.length\)\)/);
  assert.match(source, /const guildId = runContext\.guildIds\[index - 1\]/);
  assert.match(source, /const userId = runContext\.userId\(index\)/);
  assert.match(source, /buildCoopTestUserIds\(index, userId, runContext\.coopUserPrefix\)/);
  assert.doesNotMatch(source, /const TEST_USER_PREFIX/);
});
