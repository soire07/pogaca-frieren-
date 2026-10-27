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
import { RAID_BOSSES, chooseRaidBoss, applyRaidWeakness, applyEquipmentSetBonus, dungeonChoiceOutcome, dungeonEnemyStats, progressionMilestone } from '../rpg-mechanics.js';

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
  assert.match(source, /c\.user\.id/);
});

test('multi-floor dungeon includes traps, chests and persistent player rewards', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /setName\('katlizindan'\)/);
  assert.match(source, /gizli sandık/);
  assert.match(source, /tuzak/);
  assert.match(source, /dungeon_runs=dungeon_runs\+1/);
  assert.match(source, /chestRewards/);
  assert.match(source, /PARTY_ROLES/);
  assert.match(source, /healerIndex/);
  assert.match(source, /tankIndex/);
  assert.match(source, /players\[targetIndex\]\.user_id/);
  assert.doesNotMatch(source, /combatants\[targetIndex\]/);
  assert.match(source, /bossRageAnnounced/);
  assert.match(source, /yıldız biçimli mana patlaması/);
});


test('multi-floor dungeon offers turn-based attack, spell and defense choices', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /katlizindan:act:attack/);
  assert.match(source, /katlizindan:act:spell/);
  assert.match(source, /katlizindan:act:defend/);
  assert.match(source, /p\.mana >= 12/);
  assert.match(source, /p\.mana\s*-=\s*12/);
  assert.match(source, /incoming \* 0\.45/);
  assert.match(source, /mana=\$9/);
});


test('dungeon and boss raid let each accepted player choose their own role', async () => {
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  const raid = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  for (const source of [dungeon, raid]) {
    assert.match(source, /roleMessage\.createMessageComponentCollector/);
    assert.match(source, /chosenRoles\.set\(c\.user\.id, role\)/);
    assert.match(source, /selected === role && \(role === 'tank' \|\| role === 'healer'\)/);
    assert.match(source, /c\.customId\.endsWith\(interaction\.id\)/);
  }
  assert.match(dungeon, /katlizindan:role:tank/);
  assert.match(raid, /raid:role:tank/);
});


test('cooperative boss raid supports attack, mana spell, defense and mana persistence', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /raid:act:attack/);
  assert.match(source, /raid:act:spell/);
  assert.match(source, /raid:act:defend/);
  assert.match(source, /f\.mana >= 12/);
  assert.match(source, /f\.mana -= 12/);
  assert.match(source, /incoming\*0\.45/);
  assert.match(source, /mana=\$9/);
  assert.match(source, /ComponentType\.Button/);
});


test('cooperative boss raid includes an area mana-star burst and a mana-draining curse', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /const starburst = BOSS\.special === 'mana-star'/);
  assert.match(source, /for \(const i of living\)/);
  assert.match(source, /const manaCurse = \(BOSS\.special === 'mana-curse' \|\| BOSS\.special === 'mana-star'\)/);
  assert.match(source, /Math\.min\(target\.mana,8\)/);
  assert.match(source, /target\.mana-=drained/);
  assert.match(source, /\$\{rounds\}\/12/);
  assert.doesNotMatch(source, /rounds\/10/);
});

test('boss raid turn prompt uses actual line breaks instead of literal slash-n text', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /HP\\n\$\{alive\.map/);
  assert.doesNotMatch(source, /HP\\\\n\$\{alive\.map/);
});


test('raid boss catalog has distinct bosses, signature moves and deterministic selection', () => {
  assert.equal(RAID_BOSSES.length, 3);
  assert.equal(chooseRaidBoss(() => 0).id, 'north-general');
  assert.equal(chooseRaidBoss(() => 0.5).id, 'glass-wyrm');
  assert.equal(chooseRaidBoss(() => 0.99).id, 'fallen-mage');
  assert.equal(new Set(RAID_BOSSES.map(b => b.loot)).size, 3);
});

test('boss weaknesses increase damage only for matching action types', () => {
  const boss = { weakness: 'spell' };
  assert.equal(applyRaidWeakness(100, boss, 'spell'), 130);
  assert.equal(applyRaidWeakness(100, boss, 'attack'), 100);
});

test('combat action buttons expose healing and mana shield in both cooperative modes', async () => {
  const boss = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  for (const source of [boss, dungeon]) {
    assert.match(source, /:act:heal:/);
    assert.match(source, /:act:shield:/);
    assert.match(source, /f?\.mana >= 18|p\.mana >= 18/);
    assert.match(source, /Mana Kalkanı açtı/);
  }
});

test('dungeon route choices carry distinct risk and reward outcomes', () => {
  const secret = dungeonChoiceOutcome('secret', 2);
  const shrine = dungeonChoiceOutcome('shrine', 2);
  const safe = dungeonChoiceOutcome('safe', 2);
  assert.ok(secret.coins > safe.coins);
  assert.ok(secret.hp < 0);
  assert.ok(shrine.hp > 0);
  assert.notEqual(secret.lootChance, safe.lootChance);
});

test('dungeon difficulty scales enemy health and damage monotonically', () => {
  const easy = dungeonEnemyStats(3, 10, 4, 'easy');
  const normal = dungeonEnemyStats(3, 10, 4, 'normal');
  const nightmare = dungeonEnemyStats(3, 10, 4, 'nightmare');
  assert.ok(easy.hp < normal.hp && normal.hp < nightmare.hp);
  assert.ok(easy.damage <= normal.damage && normal.damage < nightmare.damage);
});

test('equipment set bonuses activate only after collecting enough matching rarity pieces', () => {
  const plain = { attack: 1, defense: 1, hp: 10, mana: 5 };
  const one = applyEquipmentSetBonus([{rarity:'Efsanevi'}], plain);
  const twoLegendary = applyEquipmentSetBonus([{rarity:'Efsanevi'},{rarity:'Efsanevi'}], plain);
  const twoEpic = applyEquipmentSetBonus([{rarity:'Destansı'},{rarity:'Destansı'}], plain);
  assert.equal(one.attack, 1);
  assert.equal(twoLegendary.attack, 5);
  assert.equal(twoLegendary.hp, 35);
  assert.equal(twoEpic.defense, 4);
  assert.equal(twoEpic.mana, 20);
});

test('progression titles unlock from persistent level and victory milestones', () => {
  assert.deepEqual(progressionMilestone(1, 0, 0), []);
  assert.ok(progressionMilestone(10, 0, 0).includes('Kıdemli Maceracı'));
  assert.ok(progressionMilestone(1, 5, 0).includes('İblis Avcısı'));
  assert.ok(progressionMilestone(1, 0, 5).includes('Zindan Kaşifi'));
  assert.ok(progressionMilestone(25, 10, 10).includes('Kuzeyin Efsanesi'));
});

test('dungeon command offers all three difficulty settings and branch outcomes', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /value:'easy'/);
  assert.match(source, /value:'normal'/);
  assert.match(source, /value:'nightmare'/);
  assert.match(source, /katlizindan:path:secret/);
  assert.match(source, /katlizindan:path:shrine/);
  assert.match(source, /katlizindan:path:safe/);
});

test('equipment set bonuses and milestone titles are wired into both rewards flows', async () => {
  const boss = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  for (const source of [boss, dungeon]) {
    assert.match(source, /applyEquipmentSetBonus/);
    assert.match(source, /progressionMilestone/);
    assert.match(source, /Kalıcı unvanlar/);
  }
});


test('runtime guardrails: raid invitations and role choices are limited to the invited party', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /inviteIds\.has\(c\.user\.id\)/);
  assert.match(source, /raid:yes:/);
  assert.match(source, /team\.some\(u => u\.id === c\.user\.id\)/);
  assert.match(source, /time: 60_000/);
});

test('runtime guardrails: dungeon invitations and role choices reject unrelated users', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /katlizindan:accept:/);
  assert.match(source, /team\.some\(u => u\.id === c\.user\.id\)/);
  assert.match(source, /time: 60_000/);
});

test('runtime guardrails: combat buttons are scoped to the current battle and turn', async () => {
  const boss = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(boss, /c\.customId\.startsWith\('raid:act:'\)/);
  assert.match(boss, /c\.customId\.endsWith/);
  assert.match(dungeon, /c\.customId\.startsWith\('katlizindan:act:'\)/);
  assert.match(dungeon, /c\.customId\.endsWith\(suffix\)/);
  assert.match(boss, /rounds < 12/);
});

test('runtime guardrails: combat results are committed atomically and errors roll back', async () => {
  const boss = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  for (const [name, source] of [['raid', boss], ['dungeon', dungeon]]) {
    assert.match(source, /await db\.query\('BEGIN'\)/, name + ' should open a transaction');
    assert.match(source, /await db\.query\('COMMIT'\)/, name + ' should commit successful results');
    assert.match(source, /await db\.query\('ROLLBACK'\)/, name + ' should roll back rejected/error results');
    assert.match(source, /FOR UPDATE/, name + ' should lock player rows during combat');
  }
});

test('runtime guardrails: dungeon route choice is leader-only and safely defaults on timeout', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /let pathChoice = 'safe'/);
  assert.match(source, /c\.user\.id === interaction\.user\.id/);
  assert.match(source, /time: 15_000/);
  assert.match(source, /dungeonChoiceOutcome\(pathChoice, floor\)/);
});

test('runtime test plan documents safety, timeouts, persistence and failure cases', async () => {
  const plan = await readFile(new URL('../docs/discord-runtime-test-plan.md', import.meta.url), 'utf8');
  for (const topic of [
    'Test ortamı ve güvenlik',
    '60 saniye içinde',
    'Mana Kalkanı',
    'Güvenli yol varsayılanı',
    'transaction rollback',
    'Soğuma süresi',
    'Canlı Discord testi'
  ]) {
    assert.ok(plan.includes(topic), 'runtime test plan missing: ' + topic);
  }
});
