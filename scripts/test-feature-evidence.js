import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const readText = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('feature evidence map references unique, registered feature IDs without promoting inventory status', async () => {
  const inventory = await readJson('feature-inventory.json');
  const evidence = await readJson('feature-evidence.json');
  const known = new Map(inventory.features.map(feature => [feature.id, feature]));
  const ids = evidence.entries.map(entry => entry.featureId);

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(new Set(ids).size, ids.length, 'feature evidence IDs must be unique');
  for (const entry of evidence.entries) {
    assert.ok(known.has(entry.featureId), 'unknown feature ID: ' + entry.featureId);
    assert.equal(known.get(entry.featureId).status, 'implemented_needs_runtime_test',
      'evidence mapping must not silently promote inventory status: ' + entry.featureId);
    assert.ok(['automated_static_assertion', 'automated_partial', 'automated_tested', 'isolated_postgresql_integration'].includes(entry.evidenceLevel));
    assert.ok(entry.limitation, 'every evidence entry must state its verification limit');

    for (const source of entry.sources) {
      assert.ok(!source.path.startsWith('/') && !source.path.includes('..'), 'unsafe source path');
      const content = await readText(source.path);
      for (const marker of source.markers) {
        assert.ok(content.includes(marker), entry.featureId + ': source marker missing: ' + source.path + ' → ' + marker);
      }
    }

    const testContent = await readText(entry.test.path);
    const testDeclaration = "test('" + entry.test.name + "'";
    const testStart = testContent.indexOf(testDeclaration);
    assert.ok(testStart >= 0, entry.featureId + ': named test not found: ' + entry.test.name);
    const nextTestStart = testContent.indexOf("\\ntest(", testStart + testDeclaration.length);
    const namedTestBody = testContent.slice(testStart, nextTestStart < 0 ? testContent.length : nextTestStart);
    for (const marker of entry.test.markers) {
      assert.ok(namedTestBody.includes(marker),
        entry.featureId + ': test assertion marker must exist inside its named test: ' + marker);
    }
    for (const integrationTest of entry.integrationTests || []) {
      assert.ok(integrationTest.path.startsWith('scripts/'), 'integration test must live under scripts/');
      const integrationContent = await readText(integrationTest.path);
      assert.ok(
        integrationContent.includes('assertIsolatedAuditDatabase') ||
        (integrationContent.includes('dedicatedAuditDatabase') && integrationContent.includes('withIsolatedTestSchema')),
        entry.featureId + ': integration test must guard its isolated PostgreSQL environment'
      );
      const declaration = "test('" + integrationTest.name + "'";
      const start = integrationContent.indexOf(declaration);
      assert.ok(start >= 0, entry.featureId + ': isolated integration test not found: ' + integrationTest.name);
      const next = integrationContent.indexOf("\\ntest(", start + declaration.length);
      const body = integrationContent.slice(start, next < 0 ? integrationContent.length : next);
      for (const marker of integrationTest.markers) {
        assert.ok(body.includes(marker), entry.featureId + ': integration assertion marker missing: ' + marker);
      }
    }
  }
  console.log('Feature evidence traceability: ' + evidence.entries.length + ' manually mapped records; inventory statuses unchanged.');
});
