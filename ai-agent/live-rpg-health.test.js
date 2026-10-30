import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLiveRpgHealth } from './live-rpg-health.js';

test('live RPG health passes only when production confirms Discord and PostgreSQL', async () => {
  const result = await checkLiveRpgHealth({
    url: 'https://rpg.invalid/',
    attempts: 1,
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return 'Poğaça Frieren aktif! Discord ve veritabanı bağlantısı sağlıklı. 🥐'; } }),
  });
  assert.equal(result.ok, true);
  assert.match(result.report, /Discord gateway hazır ve SELECT 1 başarılı/);
});

test('live RPG health fails if HTTP success does not confirm dependencies', async () => {
  const result = await checkLiveRpgHealth({
    attempts: 1,
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return 'ok'; } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.report, /FAIL/);
});

test('live RPG health retries and reports readiness failures', async () => {
  let calls = 0;
  const result = await checkLiveRpgHealth({
    attempts: 2, retryDelayMs: 0,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503, async text() { return 'not ready'; } }; },
  });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.match(result.summary, /HTTP 503/);
});

test('live RPG health handles network errors without throwing', async () => {
  const result = await checkLiveRpgHealth({ attempts: 1, fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(result.ok, false);
  assert.match(result.report, /FAIL/);
});
