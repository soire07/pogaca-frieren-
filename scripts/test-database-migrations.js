import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDatabaseMigrations } from '../database/migrations.js';

function fakeDatabase(seed = []) {
  const applied = seed.map(row => ({ ...row }));
  const statements = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).trim();
      statements.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT version, name, checksum')) {
        return { rows: [...applied].sort((a, b) => Number(a.version) - Number(b.version)), rowCount: applied.length };
      }
      if (normalized.startsWith('INSERT INTO schema_migrations')) {
        const [version, name, checksum] = params;
        if (applied.some(row => Number(row.version) === Number(version))) throw new Error('duplicate migration');
        applied.push({ version, name, checksum });
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('FORCED_MIGRATION_FAILURE')) throw new Error('forced migration failure');
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; }
  };
  return {
    applied,
    statements,
    get released() { return released; },
    async connect() { return client; }
  };
}

async function migrationDirectory(files) {
  const directory = await mkdtemp(join(tmpdir(), 'frieren-migrations-'));
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(directory, name), source, 'utf8');
  }
  return directory;
}

test('migration runner applies ordered migrations and records the legacy baseline', async () => {
  const directory = await migrationDirectory({
    '0002_add_social_index.sql': 'CREATE INDEX social_test_idx ON social_relationships(guild_id);',
    '0001_create_social_table.sql': 'CREATE TABLE social_test(id INTEGER PRIMARY KEY);'
  });
  const db = fakeDatabase();
  try {
    const result = await runDatabaseMigrations(db, { migrationsDir: directory });
    assert.deepEqual(db.applied.map(row => Number(row.version)).sort((a, b) => a - b), [0, 1, 2]);
    assert.equal(db.applied.find(row => Number(row.version) === 0).name, 'legacy_schema_baseline');
    assert.equal(result.currentVersion, 2);
    assert.deepEqual(result.applied, [1, 2]);
    assert.ok(db.statements.some(row => row.sql.startsWith('SELECT pg_advisory_lock')));
    assert.ok(db.statements.some(row => row.sql.startsWith('SELECT pg_advisory_unlock')));
    assert.equal(db.released, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration runner is idempotent and does not reapply completed SQL', async () => {
  const directory = await migrationDirectory({ '0001_initial.sql': 'CREATE TABLE migration_once(id INTEGER);' });
  const db = fakeDatabase();
  try {
    await runDatabaseMigrations(db, { migrationsDir: directory });
    const before = db.statements.filter(row => row.sql.includes('CREATE TABLE migration_once')).length;
    await runDatabaseMigrations(db, { migrationsDir: directory });
    const after = db.statements.filter(row => row.sql.includes('CREATE TABLE migration_once')).length;
    assert.equal(before, 1);
    assert.equal(after, 1);
    assert.equal(db.applied.filter(row => Number(row.version) === 1).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration runner rejects a changed checksum for an applied migration', async () => {
  const directory = await migrationDirectory({ '0001_initial.sql': 'CREATE TABLE checksum_test(id INTEGER);' });
  const db = fakeDatabase();
  try {
    await runDatabaseMigrations(db, { migrationsDir: directory });
    await writeFile(join(directory, '0001_initial.sql'), 'CREATE TABLE checksum_test(id BIGINT);', 'utf8');
    await assert.rejects(
      runDatabaseMigrations(db, { migrationsDir: directory }),
      /DB_MIGRATION_CHECKSUM_MISMATCH:1/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed migration rolls back, is not recorded and releases the advisory lock', async () => {
  const directory = await migrationDirectory({ '0001_failing.sql': 'SELECT FORCED_MIGRATION_FAILURE;' });
  const db = fakeDatabase();
  try {
    await assert.rejects(runDatabaseMigrations(db, { migrationsDir: directory }), /forced migration failure/);
    assert.equal(db.applied.some(row => Number(row.version) === 1), false);
    assert.ok(db.statements.some(row => row.sql === 'ROLLBACK'));
    assert.ok(db.statements.some(row => row.sql.startsWith('SELECT pg_advisory_unlock')));
    assert.equal(db.released, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration runner rejects gaps, unsafe filenames and transaction control', async () => {
  const gapDir = await migrationDirectory({ '0002_gap.sql': 'SELECT 2;' });
  const unsafeDir = await migrationDirectory({ '0001 Bad Name.sql': 'SELECT 1;' });
  const txDir = await migrationDirectory({ '0001_manual_transaction.sql': 'BEGIN; SELECT 1;' });
  try {
    await assert.rejects(runDatabaseMigrations(fakeDatabase(), { migrationsDir: gapDir }), /DB_MIGRATION_SEQUENCE_GAP:1/);
    await assert.rejects(runDatabaseMigrations(fakeDatabase(), { migrationsDir: unsafeDir }), /DB_MIGRATION_FILENAME_INVALID/);
    await assert.rejects(runDatabaseMigrations(fakeDatabase(), { migrationsDir: txDir }), /DB_MIGRATION_TRANSACTION_CONTROL_FORBIDDEN/);
  } finally {
    await Promise.all([gapDir, unsafeDir, txDir].map(directory => rm(directory, { recursive: true, force: true })));
  }
});

test('migration runner allows transaction keywords inside dollar-quoted PL/pgSQL bodies', async () => {
  const directory = await migrationDirectory({
    '0001_guardian_trigger.sql': "CREATE OR REPLACE FUNCTION reject_change()\nRETURNS trigger\nLANGUAGE plpgsql\nAS $\nBEGIN\n  RAISE EXCEPTION 'blocked';\nEND;\n$;"
  });
  const db = fakeDatabase();
  try {
    const result = await runDatabaseMigrations(db, { migrationsDir: directory });
    assert.deepEqual(result.applied, [1]);
    assert.ok(db.statements.some(row => row.sql.includes('CREATE OR REPLACE FUNCTION reject_change')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production migration set contains the append-only Guardian evidence chain', async () => {
  const db = fakeDatabase();
  const result = await runDatabaseMigrations(db);
  assert.deepEqual(result.applied, [1]);
  assert.equal(result.currentVersion, 1);
  assert.ok(db.statements.some(row => row.sql.includes('CREATE TABLE IF NOT EXISTS owner_guardian_evidence_chain')));
  const sql = await readFile(new URL('../database/migrations/0001_guardian_evidence_chain.sql', import.meta.url), 'utf8');
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /BEFORE TRUNCATE ON owner_guardian_evidence_chain/);
  assert.match(sql, /owner_guardian_evidence_no_truncate/);
  assert.match(sql, /GUARDIAN_EVIDENCE_CHAIN_APPEND_ONLY/);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE/);
});
