import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('co-op commands expose party options and dungeon difficulty choices', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const [name, source] of [['katlizindan', dungeon], ['ortakboss', raid]]) {
    assert.ok(source.includes(".setName('" + name + "')"));
    assert.ok(source.includes('takim_arkadasi_2'));
    assert.ok(source.includes('takim_arkadasi_3'));
    assert.ok(source.includes('60_000'));
  }
  assert.ok(dungeon.includes("value:'easy'"));
  assert.ok(dungeon.includes("value:'normal'"));
  assert.ok(dungeon.includes("value:'nightmare'"));
});

test('invitations restrict acceptance to invited users and reject duplicate or bot teammates', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  assert.ok(dungeon.includes('inviteIds.has(c.user.id)'));
  assert.ok(dungeon.includes('katlizindan:accept:'));
  assert.ok(dungeon.includes('new Set(team.map(u => u.id)).size !== team.length'));
  assert.ok(dungeon.includes('team.some((u, i) => i > 0 && u.bot)'));

  assert.ok(raid.includes('inviteIds.has(c.user.id)'));
  assert.ok(raid.includes('raid:yes:'));
  assert.ok(raid.includes('team.some(x => x.bot)'));
  assert.ok(raid.includes('new Set(team.map(x => x.id)).size !== team.length'));
});

test('both co-op modes require every teammate to choose a role and enforce unique tank/healer roles', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const source of [dungeon, raid]) {
    assert.ok(source.includes('roleMessage.createMessageComponentCollector'));
    assert.ok(source.includes('chosenRoles.set(c.user.id, role)'));
    assert.ok(source.includes("role === 'tank' || role === 'healer'"));
    assert.ok(source.includes('chosenRoles.size === team.length'));
    assert.ok(source.includes('Herkes rol seçmediği için'));
  }
});

test('combat choices are bound to living party members and the current encounter turn', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  assert.ok(dungeon.includes('livingAtStart.some(p => p.user_id === c.user.id)'));
  assert.ok(dungeon.includes('c.customId.endsWith(suffix)'));
  assert.ok(raid.includes('alive.some(i => fighters[i].userId === c.user.id)'));
  assert.ok(raid.includes('c.customId.endsWith'));
  for (const source of [dungeon, raid]) {
    assert.ok(source.includes('if (choices.has(c.user.id))'));
    assert.ok(source.includes('choices.set(c.user.id'));
    assert.ok(source.includes("|| 'defend'"));
    assert.ok(source.includes('time: 20_000'));
  }
});

test('both combat modes expose attack, Zoltraak, Heilen, mana shield and defend actions', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const source of [dungeon, raid]) {
    for (const action of ['attack', 'spell', 'heal', 'shield', 'defend']) {
      assert.ok(source.includes(':act:' + action + ':'), 'missing action: ' + action);
    }
    assert.ok(source.includes('mana yetersiz'));
    assert.ok(source.includes('Mana Kalkanı açtı'));
  }
  assert.ok(dungeon.includes('p.mana >= 18'));
  assert.ok(raid.includes('f.mana >= 18'));
  assert.ok(dungeon.includes('p.mana >= 12'));
  assert.ok(raid.includes('f.mana >= 12'));
  assert.ok(dungeon.includes('p.mana >= 10'));
  assert.ok(raid.includes('f.mana >= 10'));
});

test('dungeon has five floors, route choices, safe timeout default and random floor events', async () => {
  const dungeon = await read('katlizindan.js');

  assert.ok(dungeon.includes('const FLOORS = 5'));
  assert.ok(dungeon.includes('for (let floor = 1; floor <= FLOORS; floor++)'));
  for (const route of ['secret', 'shrine', 'safe']) {
    assert.ok(dungeon.includes('katlizindan:path:' + route), 'missing ' + route + ' route');
  }
  assert.ok(dungeon.includes("let pathChoice = 'safe'"));
  assert.ok(dungeon.includes('c.user.id === interaction.user.id'));
  assert.ok(dungeon.includes('gizli sandık'));
  assert.ok(dungeon.includes('tuzak'));
});

test('dungeon difficulty and route choices feed the encounter and reward logic', async () => {
  const dungeon = await read('katlizindan.js');
  const mechanics = await read('rpg-mechanics.js');

  assert.ok(dungeon.includes("dungeonEnemyStats(floor, avgLevel, players.length, interaction.options.getString('zorluk') || 'normal')"));
  assert.ok(dungeon.includes('dungeonChoiceOutcome(pathChoice, floor)'));
  assert.ok(mechanics.includes("difficulty === 'nightmare'"));
  assert.ok(mechanics.includes("difficulty === 'easy'"));
  assert.ok(mechanics.includes("choice === 'secret'"));
  assert.ok(mechanics.includes("choice === 'shrine'"));
  assert.ok(mechanics.includes("mana: 16 + floor * 2"));
  assert.ok(dungeon.includes('pathOutcome.mana > 0'));
});

test('co-op rewards and cooldowns are persisted inside database transactions', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');

  for (const [name, source, cooldownField, winField] of [
    ['dungeon', dungeon, 'last_dungeon_at', 'dungeon_wins'],
    ['raid', raid, 'last_boss_at', 'boss_defeats']
  ]) {
    assert.ok(source.includes("await db.query('BEGIN')"), name + ': transaction begins');
    assert.ok(source.includes('FOR UPDATE'), name + ': player rows are locked');
    assert.ok(source.includes(cooldownField), name + ': cooldown field is used');
    assert.ok(source.includes(winField), name + ': victory counter is used');
    assert.ok(source.includes("await db.query('COMMIT')"), name + ': transaction commits');
    assert.ok(source.includes("await db.query('ROLLBACK')"), name + ': failures roll back');
    assert.ok(source.includes('db.release()'), name + ': database connection is released');
    assert.ok(source.includes('persistedHpNow'), name + ': temporary role HP is clamped before persistence');
  }
});

test('raid catalog includes three bosses, action weaknesses and distinct loot identifiers', async () => {
  const mechanics = await read('rpg-mechanics.js');

  for (const id of ['north-general', 'glass-wyrm', 'fallen-mage']) assert.ok(mechanics.includes(id));
  assert.ok(mechanics.includes("weakness: 'spell'"));
  assert.ok(mechanics.includes("weakness: 'attack'"));
  assert.ok(mechanics.includes('applyRaidWeakness'));
  assert.ok(mechanics.includes('İblis Mührü'));
  assert.ok(mechanics.includes('Ejderha Camı'));
  assert.ok(mechanics.includes('Auranın Mühürlü Asa Parçası'));
  const raid = await read('ortakboss.js');
  assert.ok(raid.includes("BOSS.special === 'mana-star' && rounds % 3 === 0"));
  assert.ok(raid.includes("BOSS.special === 'shard-rain' && rounds % 2 === 0"));
  assert.ok(raid.includes("BOSS.special === 'mana-curse' && rounds % 3 === 0"));
});

test('manual test plan distinguishes automated checks from live Discord verification', async () => {
  const guide = await read('docs/DISCORD-RUNTIME-TEST-PLAN.md');
  assert.match(guide, /Deploy yapılmayacak/i);
  assert.match(guide, /gerçek Discord bileşen etkileşimleri/i);
  assert.match(guide, /Beklenen sonuç/i);
  assert.ok(guide.includes('/katlizindan'));
  assert.ok(guide.includes('/ortakboss'));
  assert.ok(guide.includes('/buyupratik'));
  assert.ok(guide.includes('SP-08'));
});

import { masteryLevelForCasts, practiceCost } from '../buyupratik.js';

test('spell practice advances mastery at ten-use thresholds and caps at level ten', () => {
  assert.equal(masteryLevelForCasts(0), 0);
  assert.equal(masteryLevelForCasts(9), 0);
  assert.equal(masteryLevelForCasts(10), 1);
  assert.equal(masteryLevelForCasts(99), 9);
  assert.equal(masteryLevelForCasts(100), 10);
  assert.equal(masteryLevelForCasts(1000), 10);
  assert.equal(practiceCost(0), 25);
  assert.equal(practiceCost(1), 60);
  assert.equal(practiceCost(10), 375);
});

test('spell practice uses existing learned-spell keys and checks ownership before spending resources', async () => {
  const source = await read('buyupratik.js');
  const learn = await read('commands/rpg/buyuogren.js');
  const mastery = await read('commands/rpg/buyuustaligi.js');
  for (const key of ['zoltraak','alev_kuresi','buz_mizragi','koruyucu_bariyer','sifa_isigi','yildirim_zinciri','tas_duvar','mana_patlamasi']) {
    assert.ok(source.includes(`value: '${key}'`), 'missing compatible spell key: ' + key);
  }
  assert.ok(source.includes('SELECT 1 FROM learned_spells'));
  assert.ok(source.includes('mana=mana-8, coins=coins-$3'));
  assert.ok(source.includes('spell_mastery.casts+1'));
  assert.ok(source.includes('mastery_level=GREATEST'));
  assert.ok(source.includes("await db.query('BEGIN')"));
  assert.ok(source.includes("await db.query('COMMIT')"));
  assert.ok(source.includes("await db.query('ROLLBACK')"));
  assert.ok(learn.includes("setName('buyuogren')"));
  assert.ok(mastery.includes("setName('buyuustaligi')"));
});
