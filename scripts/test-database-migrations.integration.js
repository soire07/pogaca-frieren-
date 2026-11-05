import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { runDatabaseMigrations } from '../database/migrations.js';

const { Pool } = pg;

function assertDisposableAuditDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/frieren_audit') {
    throw new Error('Migration rehearsal requires the disposable local frieren_audit PostgreSQL database; production URLs are forbidden.');
  }
}

test('versioned migrations apply, remain idempotent, and roll back a failed migration in an isolated schema', async () => {
  assertDisposableAuditDatabase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const schema = 'migration_rehearsal_' + randomUUID().replaceAll('-', '');
  const directory = await mkdtemp(join(tmpdir(), 'frieren-migration-rehearsal-'));
  try {
    await pool.query('CREATE SCHEMA "' + schema + '"');
    const scopedDb = {
      async connect() {
        const client = await pool.connect();
        try {
          await client.query('SET search_path TO "' + schema + '"');
          return client;
        } catch (error) {
          client.release();
          throw error;
        }
      }
    };
    await writeFile(join(directory, '0001_create_rehearsal_table.sql'),
      'CREATE TABLE rehearsal_records(id INTEGER PRIMARY KEY, value TEXT NOT NULL);', 'utf8');
    await writeFile(join(directory, '0002_add_rehearsal_index.sql'),
      'CREATE INDEX rehearsal_records_value_idx ON rehearsal_records(value);', 'utf8');
    const first = await runDatabaseMigrations(scopedDb, { migrationsDir: directory });
    assert.equal(first.currentVersion, 2);
    assert.deepEqual(first.applied, [1, 2]);

    let client = await scopedDb.connect();
    try {
      await client.query("INSERT INTO rehearsal_records(id,value) VALUES(1,'preserved')");
    } finally {
      client.release();
    }

    await writeFile(join(directory, '0003_intentionally_failing.sql'),
      'ALTER TABLE rehearsal_records ADD COLUMN transient_value TEXT; SELECT 1/0;', 'utf8');
    await assert.rejects(
      runDatabaseMigrations(scopedDb, { migrationsDir: directory }),
      /division by zero/i
    );

    client = await scopedDb.connect();
    try {
      const state = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      assert.deepEqual(state.rows.map(row => Number(row.version)), [0, 1, 2]);
      const data = await client.query('SELECT id,value FROM rehearsal_records WHERE id=1');
      assert.deepEqual(data.rows, [{ id: 1, value: 'preserved' }]);
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='rehearsal_records'", [schema]);
      assert.equal(columns.rows.some(row => row.column_name === 'transient_value'), false);
    } finally {
      client.release();
    }

    await writeFile(join(directory, '0003_intentionally_failing.sql'),
      'ALTER TABLE rehearsal_records ADD COLUMN committed_value TEXT;', 'utf8');
    const recovered = await runDatabaseMigrations(scopedDb, { migrationsDir: directory });
    assert.equal(recovered.currentVersion, 3);
    assert.deepEqual(recovered.applied, [3]);
    const repeated = await runDatabaseMigrations(scopedDb, { migrationsDir: directory });
    assert.equal(repeated.currentVersion, 3);
    assert.deepEqual(repeated.applied, []);

    client = await scopedDb.connect();
    try {
      const state = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      assert.deepEqual(state.rows.map(row => Number(row.version)), [0, 1, 2, 3]);
      const data = await client.query('SELECT id,value,committed_value FROM rehearsal_records WHERE id=1');
      assert.deepEqual(data.rows, [{ id: 1, value: 'preserved', committed_value: null }]);
    } finally {
      client.release();
    }
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {});
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});

test('TRUNCATE is rejected by the append-only evidence trigger in disposable PostgreSQL', async () => {
  assertDisposableAuditDatabase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const schema = 'guardian_evidence_rehearsal_' + randomUUID().replaceAll('-', '');
  try {
    await pool.query('CREATE SCHEMA "' + schema + '"');
    const scopedDb = {
      async connect() {
        const client = await pool.connect();
        try {
          await client.query('SET search_path TO "' + schema + '"');
          return client;
        } catch (error) {
          client.release();
          throw error;
        }
      }
    };
    const result = await runDatabaseMigrations(scopedDb);
    assert.equal(result.currentVersion, 1);
    const client = await scopedDb.connect();
    try {
      await client.query("INSERT INTO owner_guardian_evidence_chain(event_id,source,observed_at,severity,ip_source,payload,event_hash,previous_hash) VALUES('event-1','frieren_guard',NOW(),'high','direct_socket','{}'::jsonb,$1,$2)", ['a'.repeat(64), '0'.repeat(64)]);
      await assert.rejects(client.query('UPDATE owner_guardian_evidence_chain SET source=\'tampered\' WHERE event_id=\'event-1\''), /GUARDIAN_EVIDENCE_CHAIN_APPEND_ONLY/);
      await assert.rejects(client.query("DELETE FROM owner_guardian_evidence_chain WHERE event_id='event-1'"), /GUARDIAN_EVIDENCE_CHAIN_APPEND_ONLY/);
      await assert.rejects(client.query('TRUNCATE TABLE owner_guardian_evidence_chain'), /GUARDIAN_EVIDENCE_CHAIN_APPEND_ONLY/);
      const remaining = await client.query('SELECT COUNT(*)::int AS count FROM owner_guardian_evidence_chain');
      assert.equal(remaining.rows[0].count, 1);
    } finally {
      client.release();
    }
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {});
    await pool.end();
  }
});
