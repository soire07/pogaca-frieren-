import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseRepairProposal,
  validateRepairProposal,
  resolveRepairTarget,
  applyRepairProposal,
} from './ai-self-repair.js';

test('repair proposal parser accepts a structured JSON response and fenced JSON', () => {
  const proposal = { summary: 'Fix a bounded bug', files: [{ path: 'ai-agent/config.js', content: 'export const fixed = true;\n' }] };
  assert.deepEqual(parseRepairProposal(JSON.stringify(proposal)), proposal);
  assert.deepEqual(parseRepairProposal('```json\n' + JSON.stringify(proposal) + '\n```'), proposal);
});

test('repair proposal parser rejects malformed and non-object responses', () => {
  assert.throws(() => parseRepairProposal('not json'), /INVALID_REPAIR_JSON/);
  assert.throws(() => parseRepairProposal('[]'), /INVALID_REPAIR_PROPOSAL/);
});

test('repair proposals allow only existing-code JavaScript paths in approved source areas', () => {
  assert.equal(resolveRepairTarget('/repo', 'ai-agent/index.js'), path.resolve('/repo/ai-agent/index.js'));
  assert.equal(resolveRepairTarget('/repo', 'scripts/check.js'), path.resolve('/repo/scripts/check.js'));
  assert.equal(resolveRepairTarget('/repo', 'commands/karakter.js'), path.resolve('/repo/commands/karakter.js'));
  assert.throws(() => resolveRepairTarget('/repo', '../secrets.js'), /REPAIR_PATH_NOT_ALLOWED/);
  assert.throws(() => resolveRepairTarget('/repo', 'package.json'), /REPAIR_PATH_NOT_ALLOWED/);
  assert.throws(() => resolveRepairTarget('/repo', '.github/workflows/ci.yml'), /REPAIR_PATH_NOT_ALLOWED/);
  assert.throws(() => resolveRepairTarget('/repo', 'ai-agent/nested/file.js'), /REPAIR_PATH_NOT_ALLOWED/);
});

test('proposal validation rejects duplicate paths, empty patches and oversized proposals', () => {
  assert.throws(() => validateRepairProposal({ files: [] }), /EMPTY_REPAIR_PROPOSAL/);
  assert.throws(() => validateRepairProposal({ files: [
    { path: 'ai-agent/index.js', content: 'a' },
    { path: 'ai-agent/index.js', content: 'b' },
  ] }), /DUPLICATE_REPAIR_PATH/);
  assert.throws(() => validateRepairProposal({ files: [
    { path: 'ai-agent/index.js', content: 'x'.repeat(100_001) },
  ] }), /REPAIR_FILE_TOO_LARGE/);
  assert.throws(() => validateRepairProposal({ files: Array.from({ length: 6 }, (_, i) => ({
    path: `scripts/test-${i}.js`, content: 'x',
  })) }), /TOO_MANY_REPAIR_FILES/);
});

test('repair application updates an existing allowed file and refuses missing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frieren-repair-'));
  try {
    await mkdir(path.join(root, 'ai-agent'));
    await writeFile(path.join(root, 'ai-agent/config.js'), 'export const oldValue = true;\n');
    const proposal = { files: [{ path: 'ai-agent/config.js', content: 'export const newValue = true;\n' }] };
    const result = await applyRepairProposal(root, proposal);
    assert.deepEqual(result.updated, ['ai-agent/config.js']);
    assert.equal(await readFile(path.join(root, 'ai-agent/config.js'), 'utf8'), proposal.files[0].content);
    await assert.rejects(
      applyRepairProposal(root, { files: [{ path: 'ai-agent/missing.js', content: 'x' }] }),
      /REPAIR_TARGET_MUST_EXIST/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repair application refuses symlink targets and validates every file before writing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frieren-repair-'));
  const outside = path.join(root, '..', 'frieren-repair-outside.js');
  try {
    await mkdir(path.join(root, 'scripts'));
    await writeFile(path.join(root, 'scripts/safe.js'), 'const safe = true;\n');
    await writeFile(outside, 'const secret = true;\n');
    await import('node:fs/promises').then(fs => fs.symlink(outside, path.join(root, 'scripts/link.js')));
    await assert.rejects(
      applyRepairProposal(root, { files: [
        { path: 'scripts/safe.js', content: 'const safe = false;\n' },
        { path: 'scripts/link.js', content: 'const changed = true;\n' },
      ] }),
      /REPAIR_SYMLINK_NOT_ALLOWED/
    );
    assert.equal(await readFile(path.join(root, 'scripts/safe.js'), 'utf8'), 'const safe = true;\n');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});

test('multi-file repair rolls back earlier replacements when a later rename fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frieren-repair-rollback-'));
  const firstPath = path.join(root, 'first.js');
  const secondPath = path.join(root, 'second.js');
  try {
    await writeFile(firstPath, 'const first = "original";\\n');
    await writeFile(secondPath, 'const second = "original";\\n');
    let replacementRenames = 0;
    const fileOps = {
      writeFile,
      copyFile: (source, destination) => import('node:fs/promises').then(fs => fs.copyFile(source, destination)),
      unlink: (target) => import('node:fs/promises').then(fs => fs.unlink(target)),
      rename: async (source, destination) => {
        if (source.endsWith('.tmp')) {
          replacementRenames += 1;
          if (replacementRenames === 2) throw new Error('SIMULATED_RENAME_FAILURE');
        }
        return import('node:fs/promises').then(fs => fs.rename(source, destination));
      },
    };
    await assert.rejects(
      applyRepairProposal(root, { files: [
        { path: 'first.js', content: 'const first = "changed";\\n' },
        { path: 'second.js', content: 'const second = "changed";\\n' },
      ] }, fileOps),
      /SIMULATED_RENAME_FAILURE/
    );
    assert.equal(await readFile(firstPath, 'utf8'), 'const first = "original";\\n');
    assert.equal(await readFile(secondPath, 'utf8'), 'const second = "original";\\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repair application preserves the exact executable permission bits despite process umask', async () => {
  const { chmod, stat } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(tmpdir(), 'frieren-repair-mode-'));
  const target = path.join(root, 'mode.js');
  try {
    await writeFile(target, 'const original = true;\\n');
    await chmod(target, 0o660);
    await applyRepairProposal(root, {
      files: [{ path: 'mode.js', content: 'const repaired = true;\\n' }],
    });
    assert.equal((await stat(target)).mode & 0o777, 0o660);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
