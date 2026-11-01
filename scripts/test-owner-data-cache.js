import test from 'node:test';
import assert from 'node:assert/strict';
import { clearOwnerDataCacheForTests, getStaleOwnerData } from '../owner-data-cache.js';

test('owner data cache returns immediately and refreshes only once for concurrent requests', async () => {
  clearOwnerDataCacheForTests();
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const loader = async () => { calls += 1; await gate; return { status: 'fresh' }; };

  assert.deepEqual(getStaleOwnerData('status', loader, { status: 'loading' }), { status: 'loading' });
  assert.deepEqual(getStaleOwnerData('status', loader, { status: 'loading' }), { status: 'loading' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(getStaleOwnerData('status', loader, { status: 'loading' }), { status: 'fresh' });
  assert.equal(calls, 1);
});

test('owner data cache retains last good data after a refresh failure', async () => {
  clearOwnerDataCacheForTests();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    if (calls === 1) return 'ready';
    throw new Error('temporary upstream failure');
  };
  assert.equal(getStaleOwnerData('health', loader, 'loading', 1), 'loading');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(getStaleOwnerData('health', loader, 'loading', 1), 'ready');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(getStaleOwnerData('health', loader, 'loading', 1), 'ready');
  assert.equal(calls, 2);
});
