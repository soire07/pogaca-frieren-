import { readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile(new URL('../feature-inventory.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const isolatedWorkflow = await readFile(new URL('../.github/workflows/isolated-command-audit.yml', import.meta.url), 'utf8');
const auditRunner = await readFile(new URL('./run-isolated-command-audit.js', import.meta.url), 'utf8');

const originalFeatures = inventory.features.filter(feature => !feature.id.startsWith('ROADMAP-'));
const evidencePaths = new Set(originalFeatures.flatMap(feature => feature.testEvidence?.tests || []));
const packageCommands = [packageJson.scripts?.test || '', packageJson.scripts?.check || ''].join('\n');
const missing = [];

for (const testPath of evidencePaths) {
  const inPackageTest = packageCommands.includes(testPath);
  const inIsolatedWorkflow = isolatedWorkflow.includes(testPath);
  const importedByAuditRunner = testPath === 'scripts/live-command-test.js'
    && auditRunner.includes("from './live-command-test.js'");
  if (!inPackageTest && !inIsolatedWorkflow && !importedByAuditRunner) missing.push(testPath);
}

if (missing.length) {
  console.error('Feature evidence references are not executed by CI:');
  for (const testPath of missing) console.error('- ' + testPath);
  process.exitCode = 1;
} else {
  const packageCount = [...evidencePaths].filter(testPath => packageCommands.includes(testPath)).length;
  const workflowCount = [...evidencePaths].filter(testPath => isolatedWorkflow.includes(testPath)).length;
  console.log('Feature evidence execution coverage passed: '
    + originalFeatures.length + ' features, ' + evidencePaths.size
    + ' unique test files; ' + packageCount + ' referenced by npm checks and '
    + workflowCount + ' referenced by isolated PostgreSQL CI.');
}
