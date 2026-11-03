import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeGuardianTestSchema } from '../database/guardian-test-schema.js';

test('Guardian test schema is restricted to frieren_test', async () => {
  await assert.rejects(
    initializeGuardianTestSchema({ query: async () => ({ rows: [] }) }, 'public'),
    /GUARDIAN_TEST_SCHEMA_NOT_ALLOWED/,
  );
});

test('Guardian test schema clones every required table and keeps job references isolated', async () => {
  const calls = [];
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('information_schema.tables')) {
        return { rows: [
          { table_name: 'owner_error_logs' },
          { table_name: 'owner_guardian_incidents' },
          { table_name: 'owner_guardian_jobs' },
          { table_name: 'owner_guardian_monitor_state' },
          { table_name: 'owner_guardian_quality_reports' },
          { table_name: 'owner_settings' },
          { table_name: 'owner_audit_logs' },
        ] };
      }
      return { rows: [] };
    },
  };
  const result = await initializeGuardianTestSchema(db);
  assert.equal(result.schema, 'frieren_test');
  assert.equal(result.tables.length, 7);
  assert.ok(calls.some(call => call.sql.includes('ALTER TABLE frieren_test.owner_error_logs')));
  const fk = calls.find(call => call.sql.includes('frieren_test_owner_guardian_jobs_incident_fk'));
  assert.ok(fk);
  assert.match(fk.sql, /REFERENCES frieren_test\.owner_guardian_incidents/);
  assert.doesNotMatch(fk.sql, /REFERENCES public\./);
  assert.ok(calls.filter(call => call.sql.includes('CREATE TABLE IF NOT EXISTS frieren_test.')).length === 7);
});
