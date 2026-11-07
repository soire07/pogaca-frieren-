import test from 'node:test';
import assert from 'node:assert/strict';
import { findRelevantExcerpt, scoreCodeCandidate, collectCodeContext } from './code-context.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('relevant excerpt includes a matching function away from the file beginning', () => {
  const source = 'header\n'.repeat(500) + 'function dungeonEnemyStats() { return true; }' + '\nfooter'.repeat(500);
  const excerpt = findRelevantExcerpt(source, ['dungeon', 'enemy', 'stats'], 500);
  assert.ok(excerpt.length <= 500);
  assert.match(excerpt, /dungeonEnemyStats/);
});

test('code context ranks matching source above unrelated root files', () => {
  const targetScore = scoreCodeCandidate('rpg-mechanics.js', 'function dungeonEnemyStats() {}', ['dungeon', 'enemy', 'stats']);
  const unrelatedScore = scoreCodeCandidate('index.js', 'function helpCommand() {}', ['dungeon', 'enemy', 'stats']);
  assert.ok(targetScore > unrelatedScore);
});

test('excerpt helper safely handles missing or invalid limits', () => {
  assert.equal(findRelevantExcerpt('', ['x'], 100), '');
  assert.equal(findRelevantExcerpt('some source', ['missing'], 0), '');
  assert.equal(findRelevantExcerpt('some source', ['missing'], 4), 'some');
});
test('excerpt prefers a dense relevant match over an earlier generic keyword', () => {
  const source = [
    ...Array.from({ length: 40 }, () => '// damage is used by many unrelated systems'),
    'function calculateBossDamageFormula(boss, attack) { return boss.defense - attack; }',
    ...Array.from({ length: 40 }, () => '// unrelated footer'),
  ].join('\n');
  const excerpt = findRelevantExcerpt(source, ['boss', 'damage', 'formula'], 500);
  assert.ok(excerpt.length <= 500);
  assert.match(excerpt, /calculateBossDamageFormula/);
});


test('Guardian source context includes Neural Python API and regression tests', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'frieren-neural-context-'));
  try {
    await mkdir(path.join(rootDir, 'guardian'), { recursive: true });
    await mkdir(path.join(rootDir, 'ai-agent'), { recursive: true });
    await mkdir(path.join(rootDir, 'frieren-neural', 'frieren_neural'), { recursive: true });
    await mkdir(path.join(rootDir, 'frieren-neural', 'tests'), { recursive: true });
    const files = [
      'guardian/automation.js',
      'guardian/automation.test.js',
      'ai-agent/guardian-review.js',
      'ai-agent/guardian-review.test.js',
      'ai-agent/code-context.js',
      'frieren-neural/frieren_neural/api.py',
      'frieren-neural/tests/test_api.py',
    ];
    for (const file of files) {
      await writeFile(path.join(rootDir, file), 'def or function guardian review source context test() {}\\n');
    }
    const result = await collectCodeContext({
      rootDir,
      question: 'Frieren Neural Guardian incident source review',
      sourceCommitSha: 'a'.repeat(40),
      budget: 5_000,
    });
    assert.ok(result.files.includes('frieren-neural/frieren_neural/api.py'));
    assert.ok(result.files.includes('frieren-neural/tests/test_api.py'));
    assert.equal(result.sourceCommitSha, 'a'.repeat(40));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
