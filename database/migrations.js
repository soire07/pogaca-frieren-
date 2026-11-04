import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MIGRATION_LOCK = [20261104, 217];
const BASELINE = {
  version: 0,
  name: 'legacy_schema_baseline',
  checksum: createHash('sha256').update('frieren-legacy-schema-baseline-v1').digest('hex')
};

function checksum(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

async function discoverMigrations(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const migrations = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(entry.name);
    if (!match) throw new Error('DB_MIGRATION_FILENAME_INVALID:' + entry.name);
    const version = Number(match[1]);
    if (version < 1) throw new Error('DB_MIGRATION_VERSION_RESERVED:' + entry.name);
    const sql = await readFile(new URL(entry.name, directory), 'utf8');
    if (!sql.trim()) throw new Error('DB_MIGRATION_EMPTY:' + entry.name);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(sql)) {
      throw new Error('DB_MIGRATION_TRANSACTION_CONTROL_FORBIDDEN:' + entry.name);
    }
    migrations.push({ version, name: entry.name, sql, checksum: checksum(sql) });
  }

  migrations.sort((a, b) => a.version - b.version);
  for (let i = 0; i < migrations.length; i += 1) {
    if (migrations[i].version !== i + 1) {
      throw new Error('DB_MIGRATION_SEQUENCE_GAP:' + (i + 1));
    }
  }
  return migrations;
}

/**
 * Run versioned SQL migrations after the legacy ensure*Schema bootstrap.
 * The first baseline records the already-created legacy schema without rewriting it.
 * Each later migration is immutable, checksum-verified and committed atomically.
 */
export async function runDatabaseMigrations(db, options = {}) {
  if (!db || typeof db.connect !== 'function') throw new Error('DB_MIGRATION_DATABASE_REQUIRED');
  const directory = options.migrationsDir
    ? new URL('file://' + String(options.migrationsDir).replace(/\\/g, '/') + (String(options.migrationsDir).endsWith('/') ? '' : '/'))
    : new URL('./migrations/', import.meta.url);
  const migrations = await discoverMigrations(directory);
  const client = await db.connect();
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', MIGRATION_LOCK);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version >= 0),
        name VARCHAR(160) NOT NULL UNIQUE,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version'
    );
    const applied = new Map(appliedResult.rows.map(row => [Number(row.version), row]));

    const existingBaseline = applied.get(BASELINE.version);
    if (existingBaseline && (existingBaseline.name !== BASELINE.name || existingBaseline.checksum !== BASELINE.checksum)) {
      throw new Error('DB_MIGRATION_BASELINE_CHECKSUM_MISMATCH');
    }
    if (!existingBaseline) {
      await client.query(
        'INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
        [BASELINE.version, BASELINE.name, BASELINE.checksum]
      );
      applied.set(BASELINE.version, BASELINE);
    }

    const knownVersions = new Set([BASELINE.version, ...migrations.map(item => item.version)]);
    for (const version of applied.keys()) {
      if (!knownVersions.has(version)) throw new Error('DB_MIGRATION_FILE_MISSING:' + version);
    }

    for (const migration of migrations) {
      const previous = applied.get(migration.version);
      if (previous) {
        if (previous.name !== migration.name || previous.checksum !== migration.checksum) {
          throw new Error('DB_MIGRATION_CHECKSUM_MISMATCH:' + migration.version);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
          [migration.version, migration.name, migration.checksum]
        );
        await client.query('COMMIT');
        applied.set(migration.version, migration);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }

    return {
      baseline: true,
      applied: migrations.filter(item => !appliedResult.rows.some(row => Number(row.version) === item.version)).map(item => item.version),
      currentVersion: Math.max(BASELINE.version, ...[...applied.keys()])
    };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1, $2)', MIGRATION_LOCK).catch(() => {});
    client.release();
  }
}
