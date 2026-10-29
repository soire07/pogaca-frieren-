import test from 'node:test';
import assert from 'node:assert/strict';
import { findRelevantExcerpt, scoreCodeCandidate } from './code-context.js';

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
  ].join('\\n');
  const excerpt = findRelevantExcerpt(source, ['boss', 'damage', 'formula'], 500);
  assert.ok(excerpt.length <= 500);
  assert.match(excerpt, /calculateBossDamageFormula/);
});
