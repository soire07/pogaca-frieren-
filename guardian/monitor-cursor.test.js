import test from 'node:test';
import assert from 'node:assert/strict';
import { startGuardianMonitor } from './monitor.js';

test('new Guardian monitor starts at zero and scans error rows accumulated before startup', async () => {
  const statements = [];
  let stop;
  const db = {
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT last_seen_error_id')) return { rows: [{ last_seen_error_id: 0 }] };
      if (sql.includes('SELECT id,scope,error_type')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
  };
  try {
    stop = startGuardianMonitor({
      db,
      setIntervalImpl: () => ({ unref() {} }),
      clearIntervalImpl: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    const initialize = statements.find(item => item.sql.includes('INSERT INTO owner_guardian_monitor_state'));
    assert.ok(initialize);
    assert.match(initialize.sql, /VALUES\('owner_error_logs',0\)/);
    assert.doesNotMatch(initialize.sql, /MAX\(id\)/);
    assert.ok(statements.some(item => item.sql.includes('SELECT id,scope,error_type')));
  } finally {
    stop?.();
  }
});
