import test from 'node:test';
import assert from 'node:assert/strict';
import { scanNewOwnerErrors, scanPendingGuardianIncidents, scanPendingGuardianRepairDispatches, startGuardianMonitor } from './monitor.js';

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


test('monitor forwards each persisted incident to the autonomous handler before advancing the cursor', async () => {
  const saved = { id: 11, system: 'pogaca_frieren', severity: 'high', code: 'TIMEOUT' };
  const handled = [];
  const progress = [];
  const db = {
    query: async sql => {
      if (sql.includes('SELECT id,scope,error_type')) {
        return { rows: [{ id: 1, scope: '/frieren-ai', error_type: 'TimeoutError', error_message: 'AI timed out', created_at: '2026-11-02T10:00:00Z' }] };
      }
      if (sql.includes('INSERT INTO owner_guardian_incidents')) return { rows: [saved] };
      return { rows: [] };
    },
  };
  const result = await scanNewOwnerErrors(
    db,
    0,
    50,
    async id => progress.push(id),
    async incident => handled.push(incident),
  );
  assert.deepEqual(handled, [saved]);
  assert.deepEqual(progress, [1]);
  assert.equal(result.lastSeenErrorId, 1);
});


test('error and incident scan limits are normalized to whole bounded rows', async () => {
  const limits = [];
  const db = { query: async (sql, values) => {
    if (sql.includes('SELECT id,scope,error_type')) { limits.push(values[1]); return { rows: [] }; }
    if (sql.includes("WHERE status='open'")) { limits.push(values[0]); return { rows: [] }; }
    return { rows: [] };
  } };
  await scanNewOwnerErrors(db, 0, 3.9);
  await scanPendingGuardianIncidents(db, async () => {}, async () => {}, 4.9);
  assert.deepEqual(limits, [3, 4]);
});

test('pending high-severity incidents are retried in a bounded batch', async () => {
  let params;
  const attempted = [];
  const db = {
    query: async (sql, values) => {
      assert.match(sql, /status='open'/);
      assert.match(sql, /severity IN \('critical','high'\)/);
      assert.match(sql, /review_attempts/);
      assert.match(sql, /last_review_at/);
      params = values;
      return { rows: [
        { id: 21, severity: 'critical', status: 'open' },
        { id: 22, severity: 'high', status: 'open' },
      ] };
    },
  };
  const result = await scanPendingGuardianIncidents(db, async incident => attempted.push(incident.id), async () => {}, 100);
  assert.deepEqual(params, [25], 'retry query must enforce its hard upper bound');
  assert.deepEqual(attempted, [21, 22]);
  assert.deepEqual(result, { attempted: 2 });
});

test('pending incident retry isolates handler failures and continues the batch', async () => {
  const failures = [];
  const attempted = [];
  const db = { query: async () => ({ rows: [{ id: 31 }, { id: 32 }] }) };
  const result = await scanPendingGuardianIncidents(
    db,
    async incident => {
      attempted.push(incident.id);
      if (incident.id === 31) throw new Error('temporary AI outage');
    },
    async (error, incident) => failures.push([error.message, incident.id]),
  );
  assert.deepEqual(attempted, [31, 32]);
  assert.deepEqual(failures, [['temporary AI outage', 31]]);
  assert.deepEqual(result, { attempted: 2 });
});


test('monitor automatically retries eligible open incidents on its scheduled scan', async () => {
  const calls = [];
  const handled = [];
  let stop;
  const db = {
    query: async (sql, values) => {
      calls.push(sql);
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 7 }] };
      if (sql.includes('FROM owner_guardian_incidents')) {
        assert.deepEqual(values, [10]);
        return { rows: [{ id: 81, system: 'frieren_ai', severity: 'high', status: 'open' }] };
      }
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
  try {
    stop = startGuardianMonitor({
      db,
      onIncident: async incident => handled.push(incident.id),
      setIntervalImpl: () => ({ unref() {} }),
      clearIntervalImpl: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(handled, [81]);
    assert.ok(calls.some(sql => sql.includes('FROM owner_guardian_incidents')));
    assert.ok(calls.some(sql => sql.includes('SELECT id,scope,error_type')));
  } finally {
    stop?.();
  }
});


test('monitor scans bounded retryable repair dispatches independently of AI incident reviews', async () => {
  let params;
  const handled = [];
  const db = { query: async (sql, values) => {
    assert.match(sql, /repair_dispatch_attempts/);
    params = values;
    return { rows: [{ id: 91, incident_id: 42, result: { status: 'proposal_only' } }] };
  } };
  const result = await scanPendingGuardianRepairDispatches(db, async job => handled.push(job.id), 100);
  assert.deepEqual(params, [25]);
  assert.deepEqual(handled, [91]);
  assert.deepEqual(result, { attempted: 1 });
});


test('repair retry queue failure does not interrupt normal incident log scanning', async () => {
  const calls = [];
  const errors = [];
  let stop;
  const db = {
    query: async sql => {
      calls.push(sql);
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 0 }] };
      if (sql.includes('owner_guardian_jobs')) throw new Error('temporary retry query failure');
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
  try {
    stop = startGuardianMonitor({
      db,
      onError: error => errors.push(error.message),
      setIntervalImpl: () => ({ unref() {} }),
      clearIntervalImpl: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(calls.some(sql => sql.includes('SELECT id,scope,error_type')));
    assert.ok(calls.some(sql => sql.includes('SET last_tick_at=NOW(),last_error=NULL')));
    assert.deepEqual(errors, ['temporary retry query failure']);
  } finally {
    stop?.();
  }
});


test('Guardian monitor defaults to a ten-minute interval for serverless database scale-to-zero', async () => {
  let scheduledInterval;
  let stop;
  const db = {
    query: async sql => {
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 0 }] };
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
  try {
    stop = startGuardianMonitor({
      db,
      client: { isReady: () => true },
      setIntervalImpl: (_callback, intervalMs) => {
        scheduledInterval = intervalMs;
        return { unref() {} };
      },
      clearIntervalImpl: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scheduledInterval, 600_000);
  } finally {
    stop?.();
  }
});
