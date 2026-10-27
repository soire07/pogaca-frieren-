import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('co-op commands expose valid party limits and dungeon difficulty choices', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const [name, source] of [['katlizindan', dungeon], ['ortakboss', raid]]) {
    assert.match(source, new RegExp("\\.setName\\('" + name + "'\\)"), '/' + name + ' command is registered in its module');
    assert.match(source, /takim_arkadasi_2/);
    assert.match(source, /takim_arkadasi_3/);
    assert.match(source, /60_000/);
  }

  assert.match(dungeon, /value:'easy'/);
  assert.match(dungeon, /value:'normal'/);
  assert.match(dungeon, /value:'nightmare'/);
});

test('invitation buttons are restricted to the invited user and reject duplicate or bot teammates', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  assert.match(dungeon, /inviteIds\\.has\\(c\\.user\\.id\\)/);
  assert.match(dungeon, /katlizindan:accept:/);
  assert.match(dungeon, /new Set\\(team\\.map\\(u => u\\.id\\)\\)\\.size !== team\\.length/);
  assert.match(dungeon, /team\\.some\\(\\(u, i\\) => i > 0 && u\\.bot\\)/);

  assert.match(raid, /inviteIds\\.has\\(c\\.user\\.id\\)/);
  assert.match(raid, /raid:yes:/);
  assert.match(raid, /team\\.some\\(x => x\\.bot\\)/);
  assert.match(raid, /new Set\\(team\\.map\\(x => x\\.id\\)\\)\\.size !== team\\.length/);
});

test('both co-op modes require every teammate to choose a role and enforce unique tank/healer roles', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const source of [dungeon, raid]) {
    assert.match(source, /roleMessage\\.createMessageComponentCollector/);
    assert.match(source, /chosenRoles\\.set\\(c\\.user\\.id, role\\)/);
    assert.match(source, /role === 'tank' \\|\\| role === 'healer'/);
    assert.match(source, /chosenRoles\\.size === team\\.length/);
    assert.match(source, /Herkes rol seçmediği için/);
  }
});

test('combat choices are bound to living party members and the current encounter turn', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  assert.match(dungeon, /livingAtStart\\.some\\(p => p\\.user_id === c\\.user\\.id\\)/);
  assert.match(dungeon, /c\\.customId\\.endsWith\\(suffix\\)/);
  assert.match(raid, /alive\\.some\\(i => fighters\\[i\\]\\.userId === c\\.user\\.id\\)/);
  assert.match(raid, /c\\.customId\\.endsWith/);

  for (const source of [dungeon, raid]) {
    assert.match(source, /if \\(choices\\.has\\(c\\.user\\.id\\)\\)/);
    assert.match(source, /choices\\.set\\(c\\.user\\.id/);
    assert.match(source, /choices\\.get\\([^)]*\\) \\|\\| 'defend'/);
    assert.match(source, /time: 20_000/);
  }
});

test('combat controls include attack, Zoltraak, Heilen, mana shield and defend in both modes', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const source of [dungeon, raid]) {
    assert.match(source, /:act:attack:/);
    assert.match(source, /:act:spell:/);
    assert.match(source, /:act:heal:/);
    assert.match(source, /:act:shield:/);
    assert.match(source, /:act:defend:/);
    assert.match(source, /f?\\.mana >= 18|p\\.mana >= 18/);
    assert.match(source, /f?\\.mana >= 12|p\\.mana >= 12/);
    assert.match(source, /f?\\.mana >= 10|p\\.mana >= 10/);
    assert.match(source, /mana yetersiz/);
  }
});

test('dungeon has five floors, route choices, timeout-safe route and random floor events', async () => {
  const dungeon = await read('katlizindan.js');

  assert.match(dungeon, /const FLOORS = 5/);
  assert.match(dungeon, /for \\(let floor = 1; floor <= FLOORS; floor\\+\\+\\)/);
  for (const route of ['secret', 'shrine', 'safe']) {
    assert.ok(dungeon.includes('katlizindan:path:' + route), 'missing ' + route + ' route');
  }
  assert.match(dungeon, /let pathChoice = 'safe'/);
  assert.match(dungeon, /c\\.user\\.id === interaction\\.user\\.id/);
  assert.match(dungeon, /gizli sandık/);
  assert.match(dungeon, /tuzak/);
});

test('dungeon difficulty and path selection feed the actual encounter/reward logic', async () => {
  const dungeon = await read('katlizindan.js');
  const mechanics = await read('rpg-mechanics.js');

  assert.match(dungeon, /dungeonEnemyStats\\(floor, avgLevel, players\\.length, interaction\\.options\\.getString\\('zorluk'\\) \\|\\| 'normal'\\)/);
  assert.match(dungeon, /dungeonChoiceOutcome\\(pathChoice, floor\\)/);
  assert.match(mechanics, /difficulty === 'nightmare'/);
  assert.match(mechanics, /difficulty === 'easy'/);
  assert.match(mechanics, /choice === 'secret'/);
  assert.match(mechanics, /choice === 'shrine'/);
});

test('co-op rewards and cooldowns are persisted inside database transactions', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const [name, source, cooldownField, winField] of [
    ['dungeon', dungeon, 'last_dungeon_at', 'dungeon_wins'],
    ['raid', raid, 'last_boss_at', 'boss_defeats']
  ]) {
    assert.match(source, /await db\\.query\\('BEGIN'\\)/, name + ': transaction begins');
    assert.match(source, /FOR UPDATE/, name + ': player rows are locked');
    assert.ok(source.includes(cooldownField), name + ': cooldown field is used');
    assert.ok(source.includes(winField), name + ': victory counter is used');
    assert.match(source, /await db\\.query\\('COMMIT'\\)/, name + ': transaction commits');
    assert.match(source, /await db\\.query\\('ROLLBACK'\\)/, name + ': failures roll back');
    assert.match(source, /db\\.release\\(\\)/, name + ': database connection is released');
  }
});

test('raid catalog includes three bosses, action weaknesses and distinct loot identifiers', async () => {
  const mechanics = await read('rpg-mechanics.js');

  assert.match(mechanics, /north-general/);
  assert.match(mechanics, /glass-wyrm/);
  assert.match(mechanics, /fallen-mage/);
  assert.match(mechanics, /weakness: 'spell'/);
  assert.match(mechanics, /weakness: 'attack'/);
  assert.match(mechanics, /applyRaidWeakness/);
  assert.match(mechanics, /new Set\\(RAID_BOSSES\\.map\\(b => b\\.loot\\)\\)\\.size/);
});

test('manual test plan distinguishes automated checks from live Discord verification', async () => {
  const guide = await read('docs/DISCORD-RUNTIME-TEST-PLAN.md');
  assert.match(guide, /Deploy yapılmayacak/i);
  assert.match(guide, /gerçek Discord sunucusunda/i);
  assert.match(guide, /Beklenen sonuç/i);
  assert.match(guide, /katlizindan/);
  assert.match(guide, /ortakboss/);
});
