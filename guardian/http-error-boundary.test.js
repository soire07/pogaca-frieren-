import test from 'node:test';
import assert from 'node:assert/strict';
import { withHttpErrorBoundary } from './http-error-boundary.js';

function makeResponse(overrides = {}) {
  return { headersSent: false, writableEnded: false, destroyed: false, status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(body = '') { this.body = body; this.writableEnded = true; }, ...overrides };
}

test('records async request failures and returns a generic 500 response', async () => {
  const res = makeResponse();
  const seen = [];
  await withHttpErrorBoundary(async () => { throw new Error('route exploded'); }, {
    onError: async (error, req, response) => seen.push([error.message, req.url, response === res]),
  })({ url: '/test' }, res);
  assert.deepEqual(seen, [['route exploded', '/test', true]]);
  assert.equal(res.status, 500);
  assert.equal(res.body, JSON.stringify({ error: 'internal_server_error' }));
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('never writes a second status after headers have been sent', async () => {
  let writes = 0; let ends = 0;
  const res = makeResponse({ headersSent: true, writeHead() { writes += 1; }, end() { ends += 1; this.writableEnded = true; } });
  await withHttpErrorBoundary(async () => { throw new Error('late failure'); })({}, res);
  assert.equal(writes, 0);
  assert.equal(ends, 1);
});

test('does not touch an ended or destroyed response', async () => {
  for (const state of [{ writableEnded: true }, { destroyed: true }]) {
    const res = makeResponse({ ...state, writeHead() { assert.fail('must not write'); }, end() { assert.fail('must not end'); } });
    await withHttpErrorBoundary(async () => { throw new Error('late failure'); })({}, res);
  }
});

test('contains error-reporter failures and still returns a safe response', async () => {
  const res = makeResponse();
  await withHttpErrorBoundary(async () => { throw new Error('route failure'); }, {
    onError: async () => { throw new Error('database logging failed'); },
  })({}, res);
  assert.equal(res.status, 500);
  assert.equal(res.writableEnded, true);
});
