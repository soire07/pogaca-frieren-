import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDatabaseHostname } from '../database/connection-diagnostics.js';
import { configureIsolatedTestClient } from '../database/isolated-test-schema.js';

test('database diagnostics expose only the endpoint hostname', () => {
  const connection = 'postgresql://private-user:private-password@ep-safe-name-pooler.c-4.us-west-2.aws.neon.tech:5432/neondb?sslmode=require&application_name=private-app';
  const result = safeDatabaseHostname(connection);

  assert.equal(result, 'ep-safe-name-pooler.c-4.us-west-2.aws.neon.tech');
  assert.doesNotMatch(result, /private-user|private-password|neondb|sslmode|application_name|private-app/);
});

test('database diagnostics return null instead of leaking malformed connection input', () => {
  assert.equal(safeDatabaseHostname('not-a-database-url?token=private-secret'), null);
  assert.equal(safeDatabaseHostname(''), null);
  assert.equal(safeDatabaseHostname(null), null);
});

test('isolated test clients set their schema after connecting instead of using startup options', async () => {
  const statements = [];
  const client = { query: async statement => { statements.push(statement); } };

  await configureIsolatedTestClient(client);

  assert.deepEqual(statements, ['SET search_path TO frieren_test']);
});

test('isolated test client schema setup runs only once per pooled connection', async () => {
  let calls = 0;
  const client = { query: async () => { calls += 1; } };

  await configureIsolatedTestClient(client);
  await configureIsolatedTestClient(client);

  assert.equal(calls, 1);
});
