import test from 'node:test';
import assert from 'node:assert/strict';
import { clearOwnerDataCacheForTests, getOwnerData, getStaleOwnerData } from '../owner-data-cache.js';

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

test('owner data cache coalesces the first load and returns the cached result', async () => {
  clearOwnerDataCacheForTests();
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const loader = async () => { calls += 1; await gate; return { rows: [1, 2, 3] }; };

  const first = getOwnerData('dashboard:rpg', loader, 60_000);
  const second = getOwnerData('dashboard:rpg', loader, 60_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();

  assert.deepEqual(await first, { rows: [1, 2, 3] });
  assert.deepEqual(await second, { rows: [1, 2, 3] });
  assert.deepEqual(await getOwnerData('dashboard:rpg', async () => {
    calls += 1;
    return { rows: ['unexpected'] };
  }, 60_000), { rows: [1, 2, 3] });
  assert.equal(calls, 1);
});

test('owner data cache serves stale data while one expired entry refreshes in background', async () => {
  clearOwnerDataCacheForTests();
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const loader = async () => {
    calls += 1;
    if (calls === 1) return 'first';
    await gate;
    return 'second';
  };

  try {
    assert.equal(await getOwnerData('dashboard:activity', loader, 1), 'first');
    now += 2;
    assert.equal(await getOwnerData('dashboard:activity', loader, 1), 'first');
    assert.equal(await getOwnerData('dashboard:activity', loader, 1), 'first');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 2);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await getOwnerData('dashboard:activity', loader, 1), 'second');
    assert.equal(calls, 2);
  } finally {
    Date.now = realNow;
    clearOwnerDataCacheForTests();
  }
});
