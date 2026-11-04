import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = name => readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');

test('production command sync is manual-only and pinned to the main guild', async () => {
  const retry = await workflow('retry-production-command-sync.yml');
  const fallback = await workflow('register-production-after-quota-reset.yml');

  assert.ok(!retry.includes('schedule:'), 'production command registration must never run on a schedule');
  assert.ok(retry.includes('workflow_dispatch:'), 'production command registration requires an explicit manual trigger');
  assert.ok(retry.includes('GUILD_IDS: "1539562273197260860"'));
  assert.ok(retry.includes('test -z "${TEST_GUILD_ID:-}"'));
  assert.ok(!fallback.includes('schedule:'), 'the quota-reset workflow must remain manual-only');
  assert.ok(fallback.includes('GUILD_IDS: "1539562273197260860"'));
});

test('Poğaça test-guild registration is isolated and limited to five approved commands', async () => {
  const source = await workflow('register-rpg-test-commands.yml');
  const names = source.match(/TEST_COMMAND_NAMES: "([^"]+)"/)?.[1]?.split(',') || [];

  assert.ok(source.includes('GUILD_IDS: ""'), 'test registration must not include production guild IDs');
  assert.ok(source.includes('TEST_GUILD_ID: "1564945192803639356"'));
  assert.deepEqual(names, ['karakter', 'envanter', 'buyupratik', 'kesif', 'rehber']);
  assert.ok(!source.includes('1539562273197260860'));
});

test('Frieren AI health checks use a six-hour cadence and bounded retries', async () => {
  const source = await workflow('frieren-ai-health.yml');
  assert.ok(source.includes('cron: "0 */6 * * *"'));
  assert.ok(source.includes('timeout-minutes: 2'));
  assert.ok(source.includes('for attempt in {1..3}'));
  assert.ok(source.includes('https://pogaca-frieren-kltd.onrender.com/live'));
});

test('Discord command sync skips unchanged definitions and unnecessary global writes', async () => {
  const source = await readFile(new URL('../deploy-commands.js', import.meta.url), 'utf8');
  assert.ok(source.includes('skipped command write to preserve daily quota'));
  assert.ok(source.includes('No legacy global commands found; skipped unnecessary global command write.'));
});
