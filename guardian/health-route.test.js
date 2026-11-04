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

test('returns false for requests outside GET /health and GET /ready', async () => {
  const res = response();
  assert.equal(await handleHealthRequest({ method: 'GET', url: '/' }, res, {}), false);
  assert.equal(await handleHealthRequest({ method: 'POST', url: '/health' }, res, {}), false);
  assert.equal(await handleHealthRequest({ method: 'POST', url: '/ready' }, res, {}), false);
  assert.equal(res.statusCode, null);
});

test('/health is a lightweight liveness probe and never queries PostgreSQL', async () => {
  const res = response();
  let databaseQueries = 0;
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/health' },
    res,
    {
      client: { isReady: () => true },
      db: { query: async () => { databaseQueries += 1; throw new Error('database should not be queried'); } },
    },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /application\/json/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), {
    status: 'ok',
    service: 'pogaca-frieren',
    checks: { discord: 'ok', database: 'not_checked' },
  });
  assert.equal(databaseQueries, 0);
});

test('/health returns 503 when the Discord client is not ready without querying PostgreSQL', async () => {
  const res = response();
  let databaseQueries = 0;
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/health' },
    res,
    {
      client: { isReady: () => false },
      db: { query: async () => { databaseQueries += 1; return { rows: [] }; } },
    },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'not_ready',
    service: 'pogaca-frieren',
    checks: { discord: 'not_ready', database: 'not_checked' },
  });
  assert.equal(databaseQueries, 0);
});

test('/ready returns JSON 200 when Discord and PostgreSQL are healthy', async () => {
  const res = response();
  let databaseQueries = 0;
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/ready' },
    res,
    {
      client: { isReady: () => true },
      db: { query: async sql => { databaseQueries += 1; assert.equal(sql, 'SELECT 1'); return { rows: [{ '?column?': 1 }] }; },
    },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'ok',
    service: 'pogaca-frieren',
    checks: { discord: 'ok', database: 'ok' },
  });
  assert.equal(databaseQueries, 1);
});

test('/ready returns 503 and hides database errors when PostgreSQL is unavailable', async () => {
  const res = response();
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/ready' },
    res,
    {
      client: { isReady: () => true },
      db: { query: async () => { throw new Error('private connection detail'); } },
    },
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

test('/ready reports Discord and PostgreSQL independently when Discord is not ready', async () => {
  const res = response();
  const handled = await handleHealthRequest(
    { method: 'GET', url: '/ready' },
    res,
    {
      client: { isReady: () => false },
      db: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
    },
  );

  assert.equal(handled, true);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'not_ready',
    service: 'pogaca-frieren',
    checks: { discord: 'not_ready', database: 'ok' },
  });
});
