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
  assert.ok(source.includes('vars.FRIEREN_AI_HEALTH_URL'));
  assert.ok(source.includes('FRIEREN_AI_HEALTH_URL is required'));
  assert.ok(source.includes("vars.FRIEREN_AI_HEALTH_URL || 'https://pogaca-frieren-kltd.onrender.com/health'"));
  assert.ok(source.includes('https://pogaca-frieren.onrender.com/ai-bridge-health'));
  assert.ok(source.includes("j.status==='ok' && j.reachable===true"));
  assert.ok(!source.includes('not configured; skipping the production AI health probe'));
  assert.ok(!source.includes('https://pogaca-frieren-kltd.onrender.com/live'));
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


test('Neon backup restore waits for the target database to accept a query', async () => {
  const source = await workflow('neon-production-backup.yml');
  const restore = source.split('Restore into an isolated temporary PostgreSQL instance')[1] || '';
  const readiness = "psql -U postgres -d restore_test -Atqc 'SELECT 1'";

  assert.ok(restore.includes(readiness), 'readiness must verify the target database, not only the PostgreSQL server socket');
  assert.ok(!restore.includes('pg_isready -U postgres -d restore_test'), 'pg_isready can succeed before POSTGRES_DB is created');
  assert.ok(restore.indexOf(readiness) < restore.indexOf('pg_restore --exit-on-error'), 'restore must wait until the target database accepts queries');
});


test('Poğaça external HTTP health probe checks liveness and dependency readiness independently', async () => {
  const source = await workflow('pogaca-external-health.yml');
  const triggerBlock = source.split('permissions:')[0];

  assert.ok(triggerBlock.includes('pull_request:'), 'external probe must run on the PR before merge');
  assert.ok(triggerBlock.includes('schedule:'));
  assert.ok(source.includes("cron: '17 */6 * * *'"), 'scheduled probes run every six hours');
  assert.ok(triggerBlock.includes('workflow_dispatch:'), 'manual diagnostics must remain available');
  assert.ok(source.includes('https://pogaca-frieren.onrender.com'));
  assert.ok(source.includes('check_endpoint /health liveness'));
  assert.ok(source.includes('check_endpoint /ready readiness'));
  assert.ok(source.includes("payload.status === 'alive'"), 'liveness validates the documented payload');
  assert.ok(source.includes("payload.status === 'ok'"), 'readiness validates the documented payload');
  assert.ok(source.includes("payload.checks?.discord === 'ok'"));
  assert.ok(source.includes("payload.checks?.database === 'ok'"));
  assert.ok(source.includes('for attempt in 1 2 3'), 'each endpoint has bounded retries');
  assert.ok(source.includes('--connect-timeout 8 --max-time 15'), 'requests must have bounded network timeouts');
  assert.ok(source.includes('timeout-minutes: 3'));
  assert.ok(!source.includes('FRIEREN_AI_HEALTH_URL'));
  assert.ok(!source.includes('DATABASE_URL'));
});

test('Vercel production smoke runs externally, checks DNS and browser routes, and never writes production data', async () => {
  const source = await workflow('vercel-production-smoke.yml');
  const smoke = await readFile(new URL('./vercel-production-smoke.mjs', import.meta.url), 'utf8');
  const triggerBlock = source.split('permissions:')[0];

  assert.ok(triggerBlock.includes('pull_request:'), 'the PR must validate the external production probe');
  assert.ok(triggerBlock.includes('deployment_status:'), 'successful Vercel deployment statuses must trigger a post-deploy check');
  assert.ok(triggerBlock.includes('schedule:'), 'a scheduled external check must catch later DNS/TLS outages');
  assert.ok(triggerBlock.includes('workflow_dispatch:'), 'manual production diagnostics must remain available');
  assert.ok(source.includes("cron: '41 4 * * *'"), 'the daily probe must avoid unnecessary frequent requests');
  assert.ok(source.includes("github.event.deployment_status.state == 'success'"));
  assert.ok(source.includes('https://frierenbot.vercel.app'));
  assert.ok(source.includes('node scripts/vercel-production-smoke.mjs'));
  assert.ok(source.includes('playwright@1.56.1'));
  assert.ok(smoke.includes("const allowedHost = 'frierenbot.vercel.app'"));
  assert.ok(smoke.includes("await lookup(baseUrl.hostname"));
  assert.ok(smoke.includes("engine: chromium"));
  assert.ok(smoke.includes("engine: webkit"));
  assert.ok(smoke.includes("'/login'"));
  assert.ok(smoke.includes("'/tanitim'"));
  assert.ok(smoke.includes("'/assets/exploration-atlas.js?v=atlas-371-1'"));
  assert.ok(smoke.includes('for (let attempt = 1; attempt <= 3; attempt += 1)'));
  assert.ok(!smoke.includes('DATABASE_URL'));
  assert.ok(!smoke.includes('fetch(') || !smoke.includes('method: \'POST\''), 'the probe must remain read-only');
});


test('browser smoke workflows pin Playwright to a supported Ubuntu LTS runner', async () => {
  const mobile = await workflow('mobile-browser-smoke.yml');
  const production = await workflow('vercel-production-smoke.yml');
  assert.ok(mobile.includes('runs-on: ubuntu-24.04'));
  assert.ok(!mobile.includes('runs-on: ubuntu-latest'), 'mobile WebKit/Chromium installation must not drift to an unsupported image');
  assert.ok(production.includes('runs-on: ubuntu-24.04'));
  assert.ok(!production.includes('runs-on: ubuntu-latest'), 'production WebKit/Chromium installation must use the same supported LTS image');
});


test('additional guild onboarding is manual, explicitly confirmed, and guild-only', async () => {
  const source = await workflow('register-additional-guild-commands.yml');
  const triggerBlock = source.split('permissions:')[0];

  assert.ok(triggerBlock.includes('workflow_dispatch:'), 'additional guild registration must be manually triggered');
  assert.ok(!/schedule:|push:|pull_request:/.test(triggerBlock), 'additional guild registration must never run automatically');
  assert.ok(source.includes('guild_id:'), 'the target guild ID must be an explicit workflow input');
  assert.ok(source.includes('confirm_guild_id:'), 'the target guild ID must be confirmed a second time');
  assert.ok(source.includes('test "$GUILD_ID" = "$CONFIRM_GUILD_ID"'), 'the confirmation must match exactly');
  assert.ok(source.includes('^[0-9]{17,20}$'), 'only Discord snowflake IDs may be accepted');
  assert.ok(source.includes('1539562273197260860') && source.includes('1564945192803639356'), 'main and test guilds must be protected from this onboarding path');
  assert.ok(source.indexOf('npm run check') < source.indexOf('npm run deploy-commands'), 'all checks must pass before any Discord write');
  assert.ok(source.includes('GUILD_IDS: ${{ inputs.guild_id }}'), 'only the explicitly confirmed target guild may receive guild commands');
  assert.ok(source.includes('SKIP_GLOBAL_COMMAND_SYNC: "true"'), 'adding a guild must not rewrite global commands');
  assert.ok(source.includes('group: discord-command-registration'), 'guild registrations must be serialized with other command syncs');
});
