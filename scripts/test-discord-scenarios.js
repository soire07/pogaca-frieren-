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

test('adventure command allows targeted routes while preserving random exploration', async () => {
  const adventure = await read('macera.js');
  assert.match(adventure, /setName\('rota'\)/);
  for (const key of ['forest-grimoire', 'mimic-trail', 'wandering-bakery', 'ruined-chamber']) assert.ok(adventure.includes(key));
  assert.match(adventure, /const chosenRoute = interaction\.options\.getString\('rota'\)/);
  assert.match(adventure, /outcomes\[Math\.floor\(Math\.random\(\) \* outcomes\.length\)\]/);
});

test('adventure route mastery persists visits and grants a reward every third visit', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const journal = await read('kesifdefteri.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_route_mastery/);
  assert.match(adventure, /ON CONFLICT\(guild_id,user_id,route_key\)/);
  assert.match(adventure, /routeVisits % 3 === 0/);
  assert.match(adventure, /routeMasteryReward\.coins/);
  assert.match(adventure, /routeMasteryReward\.xp/);
  assert.match(journal, /Rota ziyaretleri/);
  assert.match(journal, /Sonraki ödül/);
});

test('adventure streak advances once per day and pays every third consecutive day', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const journal = await read('kesifdefteri.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_streaks/);
  assert.match(adventure, /last_visit_date=CURRENT_DATE/);
  assert.match(adventure, /last_visit_date=CURRENT_DATE-1/);
  assert.match(adventure, /streakRow\.new_day/);
  assert.match(adventure, /dailyStreak % 3 === 0/);
  assert.match(journal, /Günlük macera serisi/);
});

test('adventure leaderboards provide discovery, route mastery and daily streak rankings', async () => {
  const command = await read('kesifliderligi.js');
  assert.match(command, /setName\('kesifliderligi'\)/);
  assert.match(command, /adventure_discoveries/);
  assert.match(command, /adventure_route_mastery/);
  assert.match(command, /adventure_streaks/);
  assert.match(command, /setName\('kategori'\)/);
  assert.match(command, /ORDER BY score DESC/);
  assert.match(command, /interaction\.guildId/);
});

test('random adventures can find rare Frieren-themed locations with exclusive rewards', async () => {
  const adventure = await read('macera.js');
  const data = await read('adventure-data.js');
  assert.match(adventure, /const rareOutcomes = \[/);
  assert.match(adventure, /Math\.random\(\) < 0\.05/);
  for (const key of ['ancient-elf-sanctuary', 'forgotten-grimoire', 'dragon-nest']) {
    assert.ok(adventure.includes(key));
    assert.ok(data.includes(key));
  }
  assert.match(adventure, /Efsunlu Elf Yadigârı/);
  assert.match(adventure, /Ejderha Pulu/);
});

test('adventure map fragments persist and complete a five-piece treasure reward', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const journal = await read('kesifdefteri.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_treasure_progress/);
  assert.match(adventure, /Math\.random\(\) < 0\.20/);
  assert.match(adventure, /fragmentCount >= 5/);
  assert.match(adventure, /Kadim Hazine Sandığı/);
  assert.match(adventure, /treasureReward\.coins/);
  assert.match(journal, /Hazine haritası/);
});

test('treasure chests are consumed transactionally and grant persistent randomized loot', async () => {
  const command = await read('hazineac.js');
  assert.match(command, /setName\('hazineac'\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /Kadim Hazine Sandığı/);
  assert.match(command, /await db\.query\('BEGIN'\)/);
  assert.match(command, /await db\.query\('COMMIT'\)/);
  assert.match(command, /await db\.query\('ROLLBACK'\)/);
  assert.match(command, /ON CONFLICT\(guild_id,user_id,item_key\)/);
  assert.match(command, /setMaxValue\(5\)/);
});

test('adventure statistics aggregate progress, discoveries, streak and treasure inventory', async () => {
  const command = await read('maceraistatistik.js');
  assert.match(command, /setName\('maceraistatistik'\)/);
  assert.match(command, /adventure_discoveries/);
  assert.match(command, /adventure_route_mastery/);
  assert.match(command, /adventure_streaks/);
  assert.match(command, /adventure_treasure_progress/);
  assert.match(command, /Kadim Hazine Sandığı/);
  assert.match(command, /ADVENTURE_DISCOVERIES\.length/);
});

test('treasure opening history records each chest reward and lists the latest ten', async () => {
  const schema = await read('database/db.js');
  const opener = await read('hazineac.js');
  const history = await read('hazinegecmisi.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS treasure_openings/);
  assert.match(opener, /INSERT INTO treasure_openings/);
  assert.match(history, /setName\('hazinegecmisi'\)/);
  assert.match(history, /ORDER BY opened_at DESC, id DESC LIMIT 10/);
  assert.match(history, /loot_item/);
});

test('achievement claims include rare exploration, treasure completion, chest and route milestones', async () => {
  const command = await read('basarimlar.js');
  assert.match(command, /rare_explorer/);
  assert.match(command, /treasure_map/);
  assert.match(command, /chest_opener_10/);
  assert.match(command, /route_master_10/);
  assert.match(command, /treasure_openings/);
  assert.match(command, /adventure_route_mastery/);
  assert.match(command, /adventure_treasure_progress/);
});

test('first adventure of each day grants a daily bonus without repeat farming', async () => {
  const adventure = await read('macera.js');
  assert.match(adventure, /dailyAdventureReward = streakRow\.new_day/);
  assert.match(adventure, /dailyAdventureReward\.coins/);
  assert.match(adventure, /dailyAdventureReward\.xp/);
  assert.match(adventure, /last_visit_date=CURRENT_DATE/);
});

test('adventure outcomes grant class-specific exploration bonuses', async () => {
  const adventure = await read('macera.js');
  assert.match(adventure, /SELECT coins, xp, class_name, last_adventure_at/);
  assert.match(adventure, /u\.class_name === 'Gezgin'/);
  assert.match(adventure, /u\.class_name === 'Büyücü'/);
  assert.match(adventure, /u\.class_name === 'Muhafız'/);
  assert.match(adventure, /u\.class_name === 'Şifacı'/);
  assert.match(adventure, /classAdventureReward\.xp/);
  assert.match(adventure, /classAdventureReward\.coins/);
});

test('treasure chests can roll low-probability legendary Frieren-themed loot', async () => {
  const command = await read('hazineac.js');
  assert.match(command, /const RARE_LOOT = \[/);
  assert.match(command, /roll < 0\.01/);
  assert.match(command, /roll < 0\.04/);
  assert.match(command, /Himmel’in Efsanevi Yadigârı/);
  assert.match(command, /Frieren’in Kadim Asası/);
});

test('adventure history records committed rewards and displays the latest five encounters', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const history = await read('maceragecmisi.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS adventure_history/);
  assert.match(adventure, /INSERT INTO adventure_history/);
  assert.match(adventure, /await client\.query\('COMMIT'\)/);
  assert.match(history, /ORDER BY occurred_at DESC, id DESC LIMIT 5/);
  assert.match(history, /Son 5 macera/);
  assert.match(history, /first_discovery/);
});

test('treasure chest consumption respects the inventory positive-quantity constraint', async () => {
  const schema = await read('database/db.js');
  const opener = await read('hazineac.js');
  assert.match(schema, /quantity INTEGER NOT NULL DEFAULT 1 CHECK \(quantity > 0\)/);
  assert.match(opener, /if \(available === amount\)/);
  assert.match(opener, /DELETE FROM inventory WHERE guild_id=\$1 AND user_id=\$2 AND item_key='🗝️ Kadim Hazine Sandığı'/);
  assert.match(opener, /UPDATE inventory SET quantity=quantity-\$3/);
});

test('crafting consumes required materials safely and produces equipment supported by the equipment system', async () => {
  const command = await read('zanaat.js');
  const equipment = await read('equipment-data.js');
  assert.match(command, /setName\('zanaat'\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /await db\.query\('BEGIN'\)/);
  assert.match(command, /await db\.query\('COMMIT'\)/);
  assert.match(command, /await db\.query\('ROLLBACK'\)/);
  assert.match(command, /ON CONFLICT\(guild_id,user_id,item_key\)/);
  assert.match(command, /equipmentItems\.find/);
  for (const id of ['iron_sword', 'mage_staff', 'traveler_cloak', 'mana_ring', 'fern_robe', 'frieren_robe', 'himmel_sword', 'demon_blade', 'rune_ring', 'hero_ring']) {
    assert.ok(command.includes(id));
    assert.ok(equipment.includes(id));
  }
});

test('rare adventure and treasure materials can craft advanced Frieren-themed equipment', async () => {
  const command = await read('zanaat.js');
  const equipment = await read('equipment-data.js');
  for (const id of ['fern_robe', 'frieren_robe', 'himmel_sword', 'demon_blade']) {
    assert.ok(command.includes(id));
    assert.ok(equipment.includes(id));
  }
  assert.match(command, /Efsunlu Elf Yadigârı/);
  assert.match(command, /Himmel’in Efsanevi Yadigârı/);
  assert.match(command, /Ejderha Pulu/);
  assert.match(command, /Frieren’in Kayıp Notları/);
});

test('crafting catalog lists all available recipes and material requirements without crafting', async () => {
  const command = await read('zanaat.js');
  assert.match(command, /setRequired\(false\)\.addChoices/);
  assert.match(command, /Zanaat Tarif Defteri/);
  assert.match(command, /recipe\.materials\.map/);
  assert.match(command, /hero_ring/);
  assert.match(command, /rune_ring/);
});

test('crafting profession progress persists XP, level and successful craft totals', async () => {
  const schema = await read('database/db.js');
  const command = await read('zanaat.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_crafting_progress/);
  assert.match(command, /const craftXp = amount \*/);
  assert.match(command, /user_crafting_progress\.xp\+EXCLUDED\.xp/);
  assert.match(command, /successful_crafts=user_crafting_progress\.successful_crafts\+EXCLUDED\.successful_crafts/);
  assert.match(command, /craftProgress\.level/);
  assert.match(command, /craftProgress\.xp/);
});

test('crafting mastery unlocks a material refund chance at levels five and ten', async () => {
  const command = await read('zanaat.js');
  assert.match(command, /craftProgress\.level >= 10 \? 0\.20 : craftProgress\.level >= 5 \? 0\.10 : 0/);
  assert.match(command, /refundedMaterial/);
  assert.match(command, /material\.item/);
  assert.match(command, /craftProgress\.level >= 5/);
});

test('crafting leaderboard supports profession level, XP and successful craft rankings', async () => {
  const command = await read('zanaatustalari.js');
  assert.match(command, /setName\('zanaatustalari'\)/);
  assert.match(command, /user_crafting_progress/);
  assert.match(command, /successful_crafts/);
  assert.match(command, /setName\('kategori'\)/);
  assert.match(command, /WHERE guild_id=\$1/);
  assert.match(command, /LIMIT 10/);
});

test('achievements include crafting profession level and production milestones', async () => {
  const command = await read('basarimlar.js');
  assert.match(command, /craft_level_5/);
  assert.match(command, /craft_level_10/);
  assert.match(command, /craft_10/);
  assert.match(command, /craft_50/);
  assert.match(command, /user_crafting_progress/);
  assert.match(command, /craftingLevel/);
  assert.match(command, /craftedItems/);
});

test('adventure history profile includes persistent crafting profession progression', async () => {
  const history = await read('maceragecmisi.js');
  assert.match(history, /user_crafting_progress/);
  assert.match(history, /craftingResult/);
  assert.match(history, /name: '⚒️ Zanaat'/);
  assert.match(history, /successful_crafts/);
});

test('equipment salvage preserves equipped items and returns only partial crafting materials', async () => {
  const command = await read('ekipmanparcala.js');
  const equipment = await read('equipment-data.js');
  assert.match(command, /setName\('ekipmanparcala'\)/);
  assert.match(command, /SELECT slot FROM user_equipment/);
  assert.match(command, /quantity - equipped < amount/);
  assert.match(command, /await db\.query\('BEGIN'\)/);
  assert.match(command, /await db\.query\('COMMIT'\)/);
  assert.match(command, /await db\.query\('ROLLBACK'\)/);
  assert.match(command, /ON CONFLICT\(guild_id,user_id,item_key\)/);
  for (const id of ['iron_sword', 'mage_staff', 'traveler_cloak', 'mana_ring', 'fern_robe', 'frieren_robe', 'himmel_sword', 'demon_blade', 'rune_ring', 'hero_ring']) {
    assert.ok(command.includes(id));
    assert.ok(equipment.includes(id));
  }
});

test('equipment salvage progress persists and unlocks recycling achievements', async () => {
  const schema = await read('database/db.js');
  const salvage = await read('ekipmanparcala.js');
  const achievements = await read('basarimlar.js');
  assert.match(schema, /salvaged_items INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /ALTER TABLE user_crafting_progress ADD COLUMN IF NOT EXISTS salvaged_items/);
  assert.match(salvage, /salvaged_items=user_crafting_progress\.salvaged_items\+EXCLUDED\.salvaged_items/);
  assert.match(achievements, /salvage_10/);
  assert.match(achievements, /salvage_25/);
  assert.match(achievements, /salvagedItems/);
});

test('daily crafting mission tracks daily production and safely grants one claimable reward', async () => {
  const schema = await read('database/db.js');
  const crafting = await read('zanaat.js');
  const mission = await read('zanaatgorevi.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS daily_crafting_progress/);
  assert.match(crafting, /INSERT INTO daily_crafting_progress/);
  assert.match(mission, /setName\('zanaatgorevi'\)/);
  assert.match(mission, /count < TARGET/);
  assert.match(mission, /const TARGET = 3/);
  assert.match(mission, /claimed_at/);
  assert.match(mission, /await db\.query\('COMMIT'\)/);
  assert.match(mission, /await db\.query\('ROLLBACK'\)/);
});

test('daily crafting claim follows the same user-before-progress lock order as crafting', async () => {
  const command = await read('zanaatgorevi.js');
  const userLock = command.indexOf('SELECT user_id FROM users');
  const progressLock = command.indexOf('SELECT crafted_items, claimed_at');
  assert.ok(userLock >= 0 && progressLock > userLock);
});

test('advanced crafting recipes require their profession level and show the requirement in the catalog', async () => {
  const command = await read('zanaat.js');
  assert.match(command, /craftLevel: 5/);
  assert.match(command, /currentCraftLevel < \(recipe\.craftLevel/);
  assert.match(command, /Zanaat seviyesi/);
  assert.match(command, /Mevcut seviyen/);
});

test('crafting leaderboard also ranks players by equipment dismantling progress', async () => {
  const command = await read('zanaatustalari.js');
  assert.match(command, /salvage: \{ title: '♻️ En Çok Ekipman Parçalayanlar', column: 'salvaged_items'/);
  assert.match(command, /value: 'salvage'/);
  assert.match(command, /salvaged_items/);
});

test('equipment salvage command previews every equipment item and its material return', async () => {
  const command = await read('ekipmanparcala.js');
  assert.match(command, /setRequired\(false\)\.addChoices/);
  assert.match(command, /Ekipman Parçalama Rehberi/);
  assert.match(command, /SALVAGE_YIELD\[item\.id\]/);
  assert.match(command, /Kuşanılmış eşyalar parçalanmaz/);
});

test('combined player history displays crafting salvage progress', async () => {
  const history = await read('maceragecmisi.js');
  assert.match(history, /salvaged_items/);
  assert.match(history, /Parçalanan eşya/);
});

test('adventure streak retains an all-time best streak after a missed day resets the current streak', async () => {
  const schema = await read('database/db.js');
  const adventure = await read('macera.js');
  const journal = await read('kesifdefteri.js');
  const stats = await read('maceraistatistik.js');
  assert.match(schema, /best_streak INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /ALTER TABLE adventure_streaks ADD COLUMN IF NOT EXISTS best_streak/);
  assert.match(adventure, /best_streak=GREATEST/);
  assert.match(adventure, /RETURNING daily_streak, best_streak/);
  assert.match(journal, /best_streak/);
  assert.match(stats, /best_streak/);
});

test('adventure streak milestones grant one-time seven, fourteen and thirty day bonuses', async () => {
  const adventure = await read('macera.js');
  assert.match(adventure, /streakMilestoneReward/);
  assert.match(adventure, /7: \{ coins: 150, xp: 100 \}/);
  assert.match(adventure, /14: \{ coins: 300, xp: 200 \}/);
  assert.match(adventure, /30: \{ coins: 750, xp: 500 \}/);
  assert.match(adventure, /streakRow\.new_day/);
});

test('adventure history filters recent encounters by rare discovery or found items', async () => {
  const history = await read('maceragecmisi.js');
  assert.match(history, /setName\('filtre'\)/);
  assert.match(history, /value: 'nadir'/);
  assert.match(history, /value: 'esya'/);
  assert.match(history, /discovery_key IN/);
  assert.match(history, /item_found IS NOT NULL/);
});
