import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const fileCache = new Map();
const readText = async path => {
  if (!fileCache.has(path)) {
    fileCache.set(path, readFile(new URL('../' + path, import.meta.url), 'utf8').catch(() => null));
  }
  return fileCache.get(path);
};
const namedTestBody = (content, name) => {
  const declaration = "test('" + name + "'";
  const start = content.indexOf(declaration);
  if (start < 0) return null;
  const next = content.indexOf("\ntest(", start + declaration.length);
  return content.slice(start, next < 0 ? content.length : next);
};

test('feature evidence map promotes only fully automated evidence and preserves runtime/live verification boundaries', async () => {
  const inventory = await readJson('feature-inventory.json');
  const evidence = await readJson('feature-evidence.json');
  const known = new Map(inventory.features.map(feature => [feature.id, feature]));
  const ids = evidence.entries.map(entry => entry.featureId);
  const errors = [];
  const fullyVerifiedLevels = new Set(['automated_tested', 'isolated_postgresql_integration']);
  const mappedIds = new Set(ids);

  if (evidence.schemaVersion !== 1) errors.push('unsupported schemaVersion: ' + evidence.schemaVersion);
  if (new Set(ids).size !== ids.length) errors.push('feature evidence IDs must be unique');

  for (const entry of evidence.entries) {
    const feature = known.get(entry.featureId);
    if (!feature) errors.push(entry.featureId + ': feature ID is absent from feature-inventory.json');
    else {
      const expectedStatus = fullyVerifiedLevels.has(entry.evidenceLevel)
        ? 'automated_verified'
        : 'implemented_needs_runtime_test';
      if (feature.status !== expectedStatus) {
        errors.push(entry.featureId + ': expected status ' + expectedStatus + ' for evidence level ' + entry.evidenceLevel + ', received ' + feature.status);
      }
    }
    if (!['automated_static_assertion', 'automated_partial', 'automated_tested', 'isolated_postgresql_integration'].includes(entry.evidenceLevel)) {
      errors.push(entry.featureId + ': invalid evidence level ' + entry.evidenceLevel);
    }
    if (!entry.limitation?.trim()) errors.push(entry.featureId + ': explicit verification limitation is missing');

    for (const source of entry.sources || []) {
      if (source.path.startsWith('/') || source.path.includes('..')) {
        errors.push(entry.featureId + ': unsafe source path ' + source.path);
        continue;
      }
      const sourceContent = await readText(source.path);
      if (sourceContent === null) {
        errors.push(entry.featureId + ': source file not found: ' + source.path);
        continue;
      }
      for (const marker of source.markers || []) {
        if (!sourceContent.includes(marker)) errors.push(entry.featureId + ': source marker missing: ' + source.path + ' → ' + marker);
      }
    }

    const testContent = await readText(entry.test.path);
    if (testContent === null) {
      errors.push(entry.featureId + ': test file not found: ' + entry.test.path);
    } else {
      const body = namedTestBody(testContent, entry.test.name);
      if (body === null) errors.push(entry.featureId + ': named test not found: ' + entry.test.name);
      else for (const marker of entry.test.markers || []) {
        if (!body.includes(marker)) errors.push(entry.featureId + ': test assertion marker missing: ' + entry.test.path + ' → ' + marker);
      }
    }

    for (const integrationTest of entry.integrationTests || []) {
      if (!integrationTest.path.startsWith('scripts/')) {
        errors.push(entry.featureId + ': integration test must live under scripts/: ' + integrationTest.path);
        continue;
      }
      const integrationContent = await readText(integrationTest.path);
      if (integrationContent === null) {
        errors.push(entry.featureId + ': integration test file not found: ' + integrationTest.path);
        continue;
      }
      if (!integrationContent.includes('assertIsolatedAuditDatabase') &&
          !(integrationContent.includes('dedicatedAuditDatabase') && integrationContent.includes('withIsolatedTestSchema'))) {
        errors.push(entry.featureId + ': integration test lacks isolated PostgreSQL guard: ' + integrationTest.path);
      }
      const body = namedTestBody(integrationContent, integrationTest.name);
      if (body === null) errors.push(entry.featureId + ': isolated integration test not found: ' + integrationTest.name);
      else for (const marker of integrationTest.markers || []) {
        if (!body.includes(marker)) errors.push(entry.featureId + ': integration assertion marker missing: ' + integrationTest.path + ' → ' + marker);
      }
    }
  }

  for (const feature of inventory.features) {
    if (feature.id.startsWith('ROADMAP-')) continue;
    if (!mappedIds.has(feature.id) && feature.status !== 'implemented_needs_runtime_test') {
      errors.push(feature.id + ': unmapped feature cannot be promoted without direct named evidence');
    }
    if (feature.status === 'live_verified') {
      errors.push(feature.id + ': live_verified requires a separate live-runtime evidence record');
    }
  }

  assert.deepEqual(errors, [], 'Feature evidence map mismatches:\n' + errors.join('\n'));
  const automatedVerified = inventory.features.filter(feature => feature.status === 'automated_verified').length;
  console.log('Feature evidence traceability: ' + evidence.entries.length + ' manually mapped records; ' + automatedVerified + ' automated_verified; live verification remains separate.');
});
