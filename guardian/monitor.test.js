import test from 'node:test';
import assert from 'node:assert/strict';
import { scanNewOwnerErrors, startGuardianMonitor } from './monitor.js';

test('local monitor processes only unseen error rows and advances its cursor', async () => {
  let selectParams;
  const db = {
    query: async (sql, values) => {
      if (sql.includes('SELECT id,scope,error_type')) {
        selectParams = values;
        return { rows: [
          { id: 4, scope: '/frieren-ai', error_type: 'TimeoutError', error_message: 'AI timed out', created_at: '2026-11-02T10:00:00Z' },
          { id: 5, scope: '/owner', error_type: 'PanelError', error_message: 'Panel failed', created_at: '2026-11-02T10:01:00Z' },
        ] };
      }
      return { rows: [] };
    },
  };
  const result = await scanNewOwnerErrors(db, 3);
  assert.deepEqual(selectParams, [3, 50]);
  assert.deepEqual(result, { lastSeenErrorId: 5, recorded: 2 });
});


test('emergency stop does not disable incident monitoring or error-log scanning', async () => {
  const original = process.env.GUARDIAN_EMERGENCY_STOP;
  process.env.GUARDIAN_EMERGENCY_STOP = 'true';
  const calls = [];
  let timerCallback;
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 0 }] };
      return { rows: [], rowCount: 1 };
    },
  };
  let stop;
  try {
    stop = startGuardianMonitor({
      db,
      client: { isReady: () => true },
      setIntervalImpl: callback => {
        timerCallback = callback;
        return { unref() {} };
      },
      clearIntervalImpl: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(calls.some(call => call.sql.includes('SELECT id,scope,error_type')),
      'error scanning must continue while AI review and repair dispatch are stopped');
    assert.ok(calls.some(call => call.sql.includes('SET last_tick_at=NOW(),last_error=NULL')),
      'successful monitor heartbeat must be recorded');
    assert.equal(calls.some(call => call.sql.includes('EMERGENCY_STOP_ENABLED')), false);
    assert.equal(typeof timerCallback, 'function');
  } finally {
    stop?.();
    if (original === undefined) delete process.env.GUARDIAN_EMERGENCY_STOP;
    else process.env.GUARDIAN_EMERGENCY_STOP = original;
  }
});


test('monitor starts before Discord Ready without reporting a false startup outage', async () => {
  const calls = [];
  let ready = false;
  const db = {
    query: async (sql, values) => {
      calls.push({sql,values});
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 0 }] };
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      if (sql.includes('INSERT INTO owner_guardian_incidents')) return { rows: [{ id: 1 }] };
      return { rows: [], rowCount: 1 };
    },
  };
  let stop;
  let tick;
  try {
    stop = startGuardianMonitor({ db, client: { isReady: () => ready }, setIntervalImpl: callback => { tick = callback; return { unref() {} }; }, clearIntervalImpl: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.some(call => call.sql.includes('INSERT INTO owner_guardian_incidents')), false,
      'initial Discord login must not be reported as a failure');
    ready = true;
    await tick();
    ready = false;
    await tick();
    assert.equal(calls.some(call => call.sql.includes('INSERT INTO owner_guardian_incidents')), true,
      'a disconnect after a successful Ready state must be reported');
  } finally { stop?.(); }
});
