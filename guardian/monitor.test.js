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


test('emergency stop pauses error scanning and persists a visible monitor state', async () => {
  const original = process.env.GUARDIAN_EMERGENCY_STOP;
  process.env.GUARDIAN_EMERGENCY_STOP = 'true';
  const calls = [];
  let timerCallback;
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
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
    assert.ok(calls.some(call => call.sql.includes('INSERT INTO owner_guardian_monitor_state')
      && call.sql.includes('EMERGENCY_STOP_ENABLED')));
    assert.equal(calls.some(call => call.sql.includes('SELECT id,scope,error_type')), false);
    assert.equal(typeof timerCallback, 'function');
  } finally {
    stop?.();
    if (original === undefined) delete process.env.GUARDIAN_EMERGENCY_STOP;
    else process.env.GUARDIAN_EMERGENCY_STOP = original;
  }
});
