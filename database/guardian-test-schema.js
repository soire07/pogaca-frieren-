const GUARDIAN_TEST_TABLES = [
  'owner_error_logs',
  'owner_guardian_incidents',
  'owner_guardian_jobs',
  'owner_guardian_monitor_state',
  'owner_guardian_quality_reports',
  'owner_settings',
  'owner_audit_logs',
];

export async function initializeGuardianTestSchema(db, schema = 'frieren_test') {
  if (!db?.query) throw new TypeError('GUARDIAN_TEST_DATABASE_REQUIRED');
  if (schema !== 'frieren_test') throw new Error('GUARDIAN_TEST_SCHEMA_NOT_ALLOWED');

  await db.query('CREATE SCHEMA IF NOT EXISTS frieren_test');
  for (const table of GUARDIAN_TEST_TABLES) {
    await db.query(
      `CREATE TABLE IF NOT EXISTS frieren_test.${table} (LIKE public.${table} INCLUDING ALL)`
    );
  }

  // Older test schemas may have been created before error_message was added.
  await db.query(
    'ALTER TABLE frieren_test.owner_error_logs ADD COLUMN IF NOT EXISTS error_message text NOT NULL DEFAULT \'\''
  );

  // Recreate the Guardian job relationship inside the isolated schema. LIKE does
  // not copy foreign keys, and referencing public here would leak test state.
  await db.query(`
    DO $guardian_test$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='frieren_test_owner_guardian_jobs_incident_fk'
          AND conrelid='frieren_test.owner_guardian_jobs'::regclass
      ) THEN
        ALTER TABLE frieren_test.owner_guardian_jobs
          ADD CONSTRAINT frieren_test_owner_guardian_jobs_incident_fk
          FOREIGN KEY (incident_id)
          REFERENCES frieren_test.owner_guardian_incidents(id)
          ON DELETE CASCADE;
      END IF;
    END
    $guardian_test$
  `);

  const result = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='frieren_test' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [GUARDIAN_TEST_TABLES]
  );
  const found = new Set((result.rows || []).map(row => row.table_name));
  const missing = GUARDIAN_TEST_TABLES.filter(table => !found.has(table));
  if (missing.length) throw new Error('GUARDIAN_TEST_SCHEMA_INCOMPLETE:' + missing.join(','));
  return { schema: 'frieren_test', tables: [...GUARDIAN_TEST_TABLES] };
}
