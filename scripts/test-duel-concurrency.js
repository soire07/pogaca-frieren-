import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../buyusavasi.js', import.meta.url), 'utf8');

test('duel turn handler serializes concurrent button interactions', () => {
  const start = source.indexOf('const applyMove = async move => {');
  const handler = source.slice(start, source.indexOf('const initialEmbed', start));
  assert.match(source, /let moveInProgress = false;/);
  assert.match(handler, /if \(moveInProgress\) return move\.deferUpdate\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(handler, /moveInProgress = true;\s*try \{/);
  assert.match(handler, /finally \{\s*moveInProgress = false;\s*\}/);
  assert.ok(handler.indexOf('moveInProgress = true;') < handler.indexOf('clearTimeout(turnTimer);'));
  assert.ok(handler.indexOf('finally {') > handler.indexOf('await move.update('));
});

test('duel validates participant and active turn before acquiring the move lock', () => {
  const start = source.indexOf('const applyMove = async move => {');
  const handler = source.slice(start, source.indexOf('const initialEmbed', start));
  assert.ok(handler.indexOf('if (![challenger.id, opponent.id].includes(move.user.id))') < handler.indexOf('moveInProgress = true;'));
  assert.ok(handler.indexOf('if (move.user.id !== currentPlayer)') < handler.indexOf('moveInProgress = true;'));
});
