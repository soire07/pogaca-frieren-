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

test('legacy standalone bot health diagnostics are manual-only with bounded retries', async () => {
  const source = await workflow('frieren-ai-health.yml');
  assert.ok(!source.includes('schedule:'), 'legacy health checks must not consume scheduled Actions quota');
  assert.ok(source.includes('workflow_dispatch:'), 'legacy health diagnostics remain available manually');
  assert.ok(source.includes('timeout-minutes: 2'));
  assert.ok(source.includes('for attempt in {1..3}'));
  assert.ok(source.includes('vars.FRIEREN_AI_HEALTH_URL'));
  assert.ok(source.includes('FRIEREN_AI_HEALTH_URL is required'));
  assert.ok(source.includes("vars.FRIEREN_AI_HEALTH_URL || 'https://pogaca-frieren-kltd.onrender.com/health'"));
  assert.ok(source.includes('https://pogaca-frieren.onrender.com/ai-bridge-health'));
  assert.ok(source.includes("j.status==='ok' && j.reachable===true"));
  assert.ok(!source.includes('not configured; skipping the production AI health probe'));
  assert.ok(!source.includes('https://pogaca-frieren-kltd.onrender.com/live'));
});

test('Neural evaluation cannot write quality reports to production without explicit opt-in', async () => {
  const source = await workflow('frieren-neural-active-gguf-eval.yml');
  assert.ok(source.includes("vars.FRIEREN_NEURAL_REPORT_UPLOAD_ENABLED == 'true'"));
  assert.ok(source.includes('FRIEREN_NEURAL_REPORT_UPLOAD_ENABLED=true only after production write approval'));
});

test('Neural training workflows install only declared extras and use the CPU wheel', async () => {
  for (const name of ['frieren-neural-train.yml', 'frieren-neural-active-gguf-eval.yml']) {
    const source = await workflow(name);
    assert.ok(!source.includes('[dev,serve,discord]'), name + ' must not install a removed extra');
    assert.ok(source.includes('--only-binary=llama-cpp-python'), name + ' must use the prebuilt CPU wheel');
  }
});

test('Discord command sync skips unchanged definitions and unnecessary global writes', async () => {
  const source = await readFile(new URL('../deploy-commands.js', import.meta.url), 'utf8');
  assert.ok(source.includes('skipped command write to preserve daily quota'));
  assert.ok(source.includes('Global news command allowlist unchanged; skipped write to preserve daily quota.'));
});


test('mobile browser smoke runs once per PR update and cancels superseded runs', async () => {
  const source = await workflow('mobile-browser-smoke.yml');
  const triggerBlock = source.split('permissions:')[0];
  assert.ok(triggerBlock.includes('pull_request:'), 'PR updates must run the mobile smoke');
  assert.ok(triggerBlock.includes('workflow_dispatch:'), 'manual diagnostics must remain available');
  assert.ok(!triggerBlock.includes('push:'), 'the same PR branch push must not duplicate the pull_request run');
  assert.ok(source.includes('group: mobile-browser-smoke-'));
  assert.ok(source.includes('cancel-in-progress: true'));
});


test('only the two approved news setup commands are globally registered', async () => {
  const source = await readFile(new URL('../deploy-commands.js', import.meta.url), 'utf8');
  assert.ok(source.includes("const globalCommandNames = ['haberleri-ayarla', 'haberleri-kapat']"));
  assert.ok(source.includes('const guildCommands = commands.filter(command => !globalCommandNames.includes(command.name))'));
  assert.ok(source.includes('putWithDiagnostics(globalRoute, globalCommands'));
  assert.ok(!source.includes("putWithDiagnostics(globalRoute, [], 'clear legacy global commands')"));
});
