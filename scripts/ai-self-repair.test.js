import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedRepairPath,
  extractUnifiedDiff,
  validatePatchPaths,
} from './ai-self-repair.js';

const validPatch = [
  'diff --git a/rpg-mechanics.js b/rpg-mechanics.js',
  'index 1111111..2222222 100644',
  '--- a/rpg-mechanics.js',
  '+++ b/rpg-mechanics.js',
  '@@ -1 +1 @@',
  '-const ready = false;',
  '+const ready = true;',
].join('\n');

test('repair path allowlist accepts ordinary source and test files only', () => {
  assert.equal(isAllowedRepairPath('rpg-mechanics.js'), true);
  assert.equal(isAllowedRepairPath('ai-agent/owner-scenario-report.js'), true);
  assert.equal(isAllowedRepairPath('scripts/test-owner-dashboard.js'), true);
  assert.equal(isAllowedRepairPath('scripts/ai-self-repair.js'), false);
  assert.equal(isAllowedRepairPath('owner-dashboard.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/index.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/memory-store.js'), false);
  assert.equal(isAllowedRepairPath('package.json'), false);
  assert.equal(isAllowedRepairPath('.env.js'), false);
  assert.equal(isAllowedRepairPath('ai-agent/config.js'), false);
  assert.equal(isAllowedRepairPath('database/migrations/001.js'), false);
  assert.equal(isAllowedRepairPath('../index.js'), false);
});

test('repair diff parser extracts a fenced unified diff and validates file paths', () => {
  const patch = extractUnifiedDiff('Patch proposal:\n```diff\n' + validPatch + '\n```');
  assert.equal(validatePatchPaths(patch)[0], 'rpg-mechanics.js');
});

test('repair diff rejects package, workflow, migration and path traversal changes', () => {
  const unsafe = [
    'diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml',
    '--- a/.github/workflows/deploy.yml',
    '+++ b/.github/workflows/deploy.yml',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
  assert.throws(() => validatePatchPaths(unsafe), { message: 'REPAIR_PATH_NOT_ALLOWED' });
  assert.throws(() => validatePatchPaths(validPatch.replaceAll('rpg-mechanics.js', '../.env')), {
    message: 'REPAIR_PATH_NOT_ALLOWED',
  });
});

test('repair diff is bounded to four files and rejects binary or rename patches', () => {
  const binary = validPatch + '\ndiff --git a/ai-agent/owner-scenario-report.js b/ai-agent/owner-scenario-report.js\nGIT binary patch\n';
  assert.throws(() => validatePatchPaths(binary), { message: 'REPAIR_PATCH_FEATURE_NOT_ALLOWED' });
  const many = Array.from({ length: 5 }, (_, i) =>
    'diff --git a/file' + i + '.js b/file' + i + '.js\n--- a/file' + i + '.js\n+++ b/file' + i + '.js\n@@ -1 +1 @@\n-a\n+b'
  ).join('\n');
  assert.throws(() => validatePatchPaths(many), { message: 'REPAIR_FILE_COUNT_INVALID' });
});
