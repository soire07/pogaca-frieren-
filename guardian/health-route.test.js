import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealthRequest } from './health-route.js';

function response() {
  return {
    headers: {},
    statusCode: null,
    body: '',
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('returns false for requests outside GET /health', async () => {
  const res = response();
  assert.equal(await handleHealthRequest({ method: 'GET', url: '/' }, res, {}), false);
  assert.equal(await handleHealthRequest({ method: 'POST', url: '/health' }, res, {}), false);
  assert.equal(res.statusCode, null);
});

test('returns JSON 200 when Discord and PostgreSQL are healthy', async () => {
  const res = response();
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/health' },
    res,
    { client: { isReady: () => true }, db: { query: async sql => ({ rows: [{ '?column?': 1 }] }) } },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /application\/json/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), {
    status: 'ok',
    service: 'pogaca-frieren',
    checks: { discord: 'ok', database: 'ok' },
  });
});

test('returns 503 and dependency status when Discord is not ready', async () => {
  const res = response();
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/health' },
    res,
    { client: { isReady: () => false }, db: { query: async () => ({ rows: [] }) } },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'not_ready',
    service: 'pogaca-frieren',
    checks: { discord: 'not_ready', database: 'ok' },
  });
});

test('returns 503 when PostgreSQL is unavailable without leaking the error', async () => {
  const res = response();
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/health' },
    res,
    { client: { isReady: () => true }, db: { query: async () => { throw new Error('private connection detail'); } } },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'not_ready',
    service: 'pogaca-frieren',
    checks: { discord: 'ok', database: 'error' },
  });
  assert.equal(res.body.includes('private connection detail'), false);
});
