import test from 'node:test';
import assert from 'node:assert/strict';
import { levelForXp, xpForNextLevel } from '../utils.js';

test('levelForXp uses the expected XP thresholds', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(399), 2);
  assert.equal(levelForXp(400), 3);
  assert.equal(levelForXp(899), 3);
  assert.equal(levelForXp(900), 4);
});

test('levelForXp never returns below level 1 for negative XP', () => {
  assert.equal(levelForXp(-100), 1);
});

test('xpForNextLevel returns the threshold for the next level', () => {
  assert.equal(xpForNextLevel(1), 100);
  assert.equal(xpForNextLevel(2), 400);
  assert.equal(xpForNextLevel(10), 10000);
});

test('levelForXp and xpForNextLevel agree at level boundaries', () => {
  for (let level = 1; level <= 100; level += 1) {
    assert.equal(levelForXp(xpForNextLevel(level)), level + 1);
    assert.equal(levelForXp(xpForNextLevel(level) - 1), level);
  }
});

import { characters, drawCharacter } from '../character-data.js';

 test('drawCharacter forced legendary mode guarantees an Efsanevi character', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.equal(drawCharacter(null, false, true).rarity, 'Efsanevi');
  }
});

test('drawCharacter epic-or-higher mode never returns Yaygın or Nadir', () => {
  for (let i = 0; i < 300; i += 1) {
    assert.ok(['Gizemli', 'Efsanevi', 'Destansı'].includes(drawCharacter(null, true, false).rarity));
  }
});

test('character catalog has entries for each rarity used by collection filters', () => {
  for (const rarity of ['Gizemli', 'Efsanevi', 'Destansı', 'Nadir', 'Yaygın']) {
    assert.ok(characters.some(character => character.rarity === rarity), `missing catalog entries for ${rarity}`);
  }
});


import { readFile } from 'node:fs/promises';

test('cooperative raid defines player-facing roles and a persistent cooldown', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /setName\('ortakboss'\)/);
  for (const role of ['tank', 'healer', 'damage']) assert.ok(source.includes(role), `missing raid role: ${role}`);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /last_boss_at=NOW\(\)/);
  assert.match(source, /boss_defeats=boss_defeats\+\$8/);
  assert.match(source, /component\.user\.id/);
});

test('multi-floor dungeon includes traps, chests and persistent player rewards', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /setName\('katlizindan'\)/);
  assert.match(source, /gizli sandık/);
  assert.match(source, /tuzak/);
  assert.match(source, /dungeon_runs=dungeon_runs\+1/);
  assert.match(source, /chestRewards/);
});
