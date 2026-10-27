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
  assert.ok(dungeon.includes('p.mana >= spellCost'));
  assert.ok(raid.includes('f.mana >= spellCost'));
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

import { masteryLevelForCasts, practiceCost } from '../commands/rpg/buyupratik.js';

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
  const source = await read('commands/rpg/buyupratik.js');
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

test('spell mastery changes ice, barrier, healing and stone-wall effects in boss combat', async () => {
  const combat = await read('iblisavasi.js');
  assert.match(combat, /Math\.min\(0\.6, 0\.35 \+ \(spellMastery\.get\(spellUsed\) \|\| 0\) \* 0\.025\)/);
  assert.match(combat, /Math\.min\(0\.8, 0\.5 \+ \(spellMastery\.get\(spellUsed\) \|\| 0\) \* 0\.03\)/);
  assert.match(combat, /\(spellMastery\.get\(spellUsed\) \|\| 0\) \* 3/);
  assert.match(combat, /Math\.min\(0\.9, 0\.75 \+ \(spellMastery\.get\(spellUsed\) \|\| 0\) \* 0\.015\)/);
  assert.match(combat, /bossDamage \* \(1 - shieldReduction\)/);
  assert.match(combat, /bossDamage \* \(1 - fortifiedReduction\)/);
});

test('spell practice is registered in the RPG command directory', async () => {
  const source = await read('commands/rpg/buyupratik.js');
  assert.match(source, /setName\('buyupratik'\)/);
  assert.match(source, /from '\.\.\/\.\.\/database\/db\.js'/);
  assert.match(source, /FOR UPDATE/);
});


test('character classes provide bounded passive bonuses and class selection is discoverable', async () => {
  const mechanics = await read('rpg-mechanics.js');
  const command = await read('commands/rpg/sinifsec.js');
  const combat = await read('iblisavasi.js');
  assert.match(command, /setName\('sinifsec'\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(combat, /applyClassDamage\(/);
  assert.match(combat, /applyClassDefense\(/);
  assert.match(combat, /applyClassHealing\(/);
  assert.match(combat, /applyClassDamage\(Math\.floor\(Math\.random\(\) \* 21\) \+ 65/);
  assert.match(mechanics, /attackMultiplier: 1\.08/);
  assert.match(mechanics, /defenseMultiplier: 1\.12/);
  assert.match(mechanics, /healingMultiplier: 1\.2/);
});


test('character class passives are applied in both co-op modes and class guide is available', async () => {
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  const guide = await read('commands/rpg/sinifrehberi.js');
  const mechanics = await read('rpg-mechanics.js');
  assert.match(dungeon, /class_name, active_build, last_dungeon_at/);
  assert.match(dungeon, /applyClassDamage\(damage, p\.class_name\)/);
  assert.match(dungeon, /applyClassDefense\(/);
  assert.match(dungeon, /applyClassHealing\(6, players\[healerIndex\]\.class_name\)/);
  assert.match(raid, /class_name,active_build,last_boss_at/);
  assert.match(raid, /applyClassDamage\(damage, f\.className\)/);
  assert.match(raid, /applyClassDefense\(/);
  assert.match(raid, /applyClassHealing\(12, fighters\[healer\]\.className\)/);
  assert.match(guide, /setName\('sinifrehberi'\)/);
  assert.match(mechanics, /export function characterClassGuide\(\)/);
});


test('Mage class has a mana-cost discount in solo and co-op combat', async () => {
  const mechanics = await read('rpg-mechanics.js');
  const solo = await read('iblisavasi.js');
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  assert.match(mechanics, /manaCostMultiplier: 0\.9/);
  assert.match(mechanics, /Mana maliyeti -\$\{Math\.round\(\(1 - profile\.manaCostMultiplier\) \* 100\)\}%/);
  assert.match(mechanics, /export function applyClassManaCost\(baseCost, className\)/);
  assert.match(solo, /applyClassManaCost\(30, stats\.class_name\)/);
  assert.match(dungeon, /applyClassManaCost\(12, p\.class_name\)/);
  assert.match(raid, /applyClassManaCost\(12, f\.className\)/);
});


test('daily quest chain is sequential, persistent, and pays escalating rewards transactionally', async () => {
  const command = await read('gorevzinciri.js');
  const schema = await read('database/db.js');
  assert.match(command, /setName\('gorevzinciri'\)/);
  assert.match(command, /last_daily_at::date=CURRENT_DATE/);
  assert.match(command, /last_exploration_at::date=CURRENT_DATE/);
  assert.match(command, /last_boss_at::date=CURRENT_DATE/);
  for (const reward of ['reward: 50', 'reward: 100', 'reward: 200']) assert.ok(command.includes(reward));
  assert.match(command, /current_step/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /await db.query\('BEGIN'\)/);
  assert.match(command, /await db.query\('COMMIT'\)/);
  assert.match(command, /await db.query\('ROLLBACK'\)/);
  assert.match(command, /ON CONFLICT DO NOTHING/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS daily_quest_chains/);
  assert.match(schema, /PRIMARY KEY \(guild_id,user_id,chain_date\)/);
  assert.match(schema, /current_step INTEGER NOT NULL DEFAULT 1 CHECK \(current_step BETWEEN 1 AND 4\)/);
});


test('character builds persist and affect all combat modes', async () => {
  const schema = await read('database/db.js');
  const mechanics = await read('rpg-mechanics.js');
  const command = await read('karakteryapisi.js');
  const solo = await read('iblisavasi.js');
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  assert.match(schema, /ADD COLUMN IF NOT EXISTS active_build TEXT NOT NULL DEFAULT 'dengeli'/);
  for (const key of ['dengeli', 'avci', 'muhafiz', 'buyucu']) assert.ok(mechanics.includes(key));
  assert.match(command, /setName\('karakteryapisi'\)/);
  assert.match(command, /UPDATE users SET active_build=\$3/);
  for (const source of [solo, dungeon, raid]) {
    assert.match(source, /getCharacterBuild/);
    assert.match(source, /active_build/);
  }
  assert.match(solo, /build\.attack/);
  assert.match(dungeon, /build\.defense/);
  assert.match(raid, /build\.mana/);
});

test('talent tree persists ranks and modifies all combat modes', async () => {
  const schema = await read('database/db.js');
  const command = await read('yetenekagaci.js');
  const solo = await read('iblisavasi.js');
  const dungeon = await read('katlizindan.js');
  const raid = await read('ortakboss.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_talents/);
  assert.match(schema, /attack_rank INTEGER NOT NULL DEFAULT 0 CHECK \(attack_rank BETWEEN 0 AND 3\)/);
  assert.match(command, /setName\('yetenekagaci'\)/);
  assert.match(command, /Math\.floor\(Number\(level\) \/ 3\)/);
  assert.match(command, /FOR UPDATE/);
  for (const source of [solo, dungeon, raid]) {
    assert.match(source, /talent_attack/);
    assert.match(source, /talent_defense/);
    assert.match(source, /talent_hp/);
    assert.match(source, /talent_mana/);
  }
});

test('adventure discoveries persist, award first-find bonuses, and grant journal completion once', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const data = await read('adventure-data.js');
  const journal = await read('kesifdefteri.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_discoveries/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_journal_claims/);
  assert.match(adventure, /ON CONFLICT DO NOTHING RETURNING discovery_key/);
  assert.match(adventure, /ADVENTURE_DISCOVERY_REWARD/);
  assert.match(adventure, /COMPLETE_ADVENTURE_JOURNAL_REWARD/);
  assert.match(adventure, /await client\.query\('BEGIN'\)/);
  assert.match(adventure, /await client\.query\('COMMIT'\)/);
  assert.match(data, /forest-grimoire/);
  assert.match(data, /ruined-chamber/);
  assert.match(journal, /setName\('kesifdefteri'\)/);
  assert.match(journal, /ADVENTURE_DISCOVERIES/);
});
