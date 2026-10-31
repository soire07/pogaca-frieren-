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
import { RAID_BOSSES, chooseRaidBoss, applyRaidWeakness, applyEquipmentSetBonus, dungeonChoiceOutcome, dungeonEnemyStats, progressionMilestone, getBossPhase, calculateBossIncomingDamage, bossPhaseSpecialBonus, getSpellMasteryAwakening, getCharacterClass } from '../rpg-mechanics.js';

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
  assert.match(source, /p\.mana >= spellCost/);
  assert.match(source, /p\.mana\s*-=\s*spellCost/);
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
  assert.match(source, /f\.mana >= spellCost/);
  assert.match(source, /f\.mana -= spellCost/);
  assert.match(source, /incoming\*0\.45/);
  assert.match(source, /mana=\$9/);
  assert.match(source, /ComponentType\.Button/);
});


test('cooperative boss raid includes an area mana-star burst and a mana-draining curse', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /const starburst = BOSS\.special === 'mana-star'/);
  assert.match(source, /for \(const i of living\)/);
  assert.match(source, /const shardRain = BOSS\.special === 'shard-rain' && rounds % 2 === 0/);
  assert.match(source, /const manaCurse = BOSS\.special === 'mana-curse' && rounds % 3 === 0/);
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
    assert.match(source, /applyClassManaCost\(18, (?:f|p)\.className|applyClassManaCost\(18, (?:f|p)\.class_name\)/);
    assert.match(source, /applyClassHealing\(26, (?:f|p)\.className|applyClassHealing\(26, (?:f|p)\.class_name\)/);
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
    '60 saniyelik süre',
    'Mana Kalkanı',
    'Güvenli yol varsayılanı',
    'transaction rollback',
    'soğuma süresi',
    'Canlı Discord testi',
    '/buyupratik',
    'SP-08'
  ]) {
    assert.ok(plan.includes(topic), 'runtime test plan missing: ' + topic);
  }
});

test('solo boss phase transitions use clear two-thirds and one-third health thresholds', () => {
  assert.equal(getBossPhase(120, 120), 1);
  assert.equal(getBossPhase(81, 120), 1);
  assert.equal(getBossPhase(80, 120), 2);
  assert.equal(getBossPhase(41, 120), 2);
  assert.equal(getBossPhase(40, 120), 3);
  assert.equal(getBossPhase(0, 120), 3);
  assert.equal(getBossPhase(10, 0), 1);
  assert.equal(getBossPhase(Number.NaN, 120), 1);
});

test('boss phase damage scaling respects defense and grows only in later phases', () => {
  assert.equal(calculateBossIncomingDamage(10, 4, 1), 8);
  assert.equal(calculateBossIncomingDamage(10, 4, 2), 9);
  assert.equal(calculateBossIncomingDamage(10, 4, 3), 10);
  assert.equal(calculateBossIncomingDamage(0, 999, 1), 1);
  assert.equal(calculateBossIncomingDamage(-10, -5, 1), 1);
  assert.equal(bossPhaseSpecialBonus(1), 0);
  assert.equal(bossPhaseSpecialBonus(2), 4);
  assert.equal(bossPhaseSpecialBonus(3), 8);
});

test('freezing the boss cancels its scheduled special attack and its mana-drain side effect', async () => {
  const source = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  assert.match(source, /if \(turnCount % 3 === 0 && !frozenBoss\)/);
  assert.match(source, /else if \(turnCount % 3 === 0 && frozenBoss\)/);
  assert.match(source, /Donma etkisi bossun özel saldırısını da durdurdu/);
});


test('cooperative raid boss phases scale incoming damage and announce transitions', async () => {
  const source = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /getBossPhase\(bossHp, maxBossHp\)/);
  assert.match(source, /bossPhaseSpecialBonus\(bossPhase\)/);
  assert.ok(source.includes('calculateBossIncomingDamage(rawDamage, Math.round(target.defense*0.56), bossPhase)'));
  assert.ok(source.includes('calculateBossIncomingDamage(Math.round(rawDamage*specialMultiplier), Math.round(f.defense*0.44), bossPhase)'));
  assert.match(source, /ikinci evreye geçti/);
  assert.match(source, /son evreye geçti/);
});


test('final dungeon boss has three phases and stronger phase-scaled special attacks', async () => {
  const source = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /const finalBoss = floor === FLOORS/);
  assert.match(source, /getBossPhase\(enemyHp, maxEnemyHp\)/);
  assert.match(source, /calculateBossIncomingDamage\(rawIncoming, Math\.round\(target\.defense \* 0\.6\), enemyPhase\)/);
  assert.match(source, /bossPhaseSpecialBonus\(enemyPhase\)/);
  assert.match(source, /İblis Lordu ikinci evreye geçti/);
  assert.match(source, /İblis Lordu son evreye geçti/);
});


test('mastery-10 awakening grants the correct capstone to each spell', () => {
  assert.deepEqual(getSpellMasteryAwakening('zoltraak', 9), { damage: 0, freezeChance: 0, shieldReduction: 0, healing: 0, wallReduction: 0 });
  assert.equal(getSpellMasteryAwakening('zoltraak', 10).damage, 8);
  assert.equal(getSpellMasteryAwakening('alev_kuresi', 10).damage, 10);
  assert.equal(getSpellMasteryAwakening('buz_mizragi', 10).freezeChance, 0.1);
  assert.equal(getSpellMasteryAwakening('koruyucu_bariyer', 10).shieldReduction, 0.05);
  assert.equal(getSpellMasteryAwakening('sifa_isigi', 10).healing, 10);
  assert.equal(getSpellMasteryAwakening('yildirim_zinciri', 10).damage, 12);
  assert.equal(getSpellMasteryAwakening('tas_duvar', 10).wallReduction, 0.05);
  assert.equal(getSpellMasteryAwakening('mana_patlamasi', 10).damage, 15);
});

test('solo boss combat applies spell awakening perks and the mastery guide explains them', async () => {
  const combat = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const guide = await readFile(new URL('../commands/rpg/buyuustaligi.js', import.meta.url), 'utf8');
  assert.match(combat, /getSpellMasteryAwakening\('zoltraak'/);
  assert.match(combat, /getSpellMasteryAwakening\(spellUsed, spellMastery\.get\(spellUsed\)\)\.freezeChance/);
  assert.match(combat, /getSpellMasteryAwakening\(spellUsed, spellMastery\.get\(spellUsed\)\)\.shieldReduction/);
  assert.match(combat, /getSpellMasteryAwakening\(spellUsed, spellMastery\.get\(spellUsed\)\)\.healing/);
  assert.match(guide, /Uyanış açıldı/);
  assert.match(guide, /Seviye 10’da büyüne özel Uyanış açılır/);
});

import { shouldGuaranteeRareDiscovery } from '../rpg-mechanics.js';

test('rare exploration pity guarantees a new rare location at each 20-adventure milestone', () => {
  assert.equal(shouldGuaranteeRareDiscovery(18, 0), false);
  assert.equal(shouldGuaranteeRareDiscovery(19, 0), true);
  assert.equal(shouldGuaranteeRareDiscovery(20, 1), false);
  assert.equal(shouldGuaranteeRareDiscovery(39, 1), true);
  assert.equal(shouldGuaranteeRareDiscovery(59, 2), true);
  assert.equal(shouldGuaranteeRareDiscovery(999, 3), false);
  assert.equal(shouldGuaranteeRareDiscovery(-10, 0), false);
  assert.equal(shouldGuaranteeRareDiscovery(0, -1), false);
});

test('adventure command uses pity to prioritize undiscovered rare locations', async () => {
  const source = await readFile(new URL('../macera.js', import.meta.url), 'utf8');
  assert.match(source, /shouldGuaranteeRareDiscovery/);
  assert.match(source, /rareOutcomes\.filter\(entry => !discoveredRare\.has\(entry\.discovery\)\)/);
  assert.match(source, /total_adventures/);
  assert.match(source, /rare_discoveries/);
});


test('equipment set bonuses activate for two legendary or two epic pieces', () => {
  const base = { attack: 10, defense: 8, hp: 100, mana: 60 };
  const legendary = applyEquipmentSetBonus([
    { rarity: 'Efsanevi' }, { rarity: 'Efsanevi' }
  ], base);
  assert.deepEqual(legendary, {
    attack: 14, defense: 8, hp: 125, mana: 60,
    setText: 'Efsanevi set: +4 saldırı, +25 HP'
  });
  const epic = applyEquipmentSetBonus([
    { rarity: 'Destansı' }, { rarity: 'Destansı' }
  ], base);
  assert.deepEqual(epic, {
    attack: 10, defense: 11, hp: 100, mana: 75,
    setText: 'Destansı set: +3 savunma, +15 mana'
  });
  assert.equal(applyEquipmentSetBonus([{ rarity: 'Efsanevi' }], base).setText, null);
});

test('solo boss combat applies the same equipment set bonuses as profile and group combat', async () => {
  const source = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  assert.match(source, /applyEquipmentSetBonus/);
  assert.match(source, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  assert.match(source, /gearBonus\.setText/);
});


test('daily quest chain requires a successful boss victory, not merely starting a boss fight', async () => {
  const quest = await readFile(new URL('../gorevzinciri.js', import.meta.url), 'utf8');
  const combat = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const database = await readFile(new URL('../database/db.js', import.meta.url), 'utf8');
  assert.match(quest, /last_boss_win_at::date\s*=\s*CURRENT_DATE/);
  assert.doesNotMatch(quest, /last_boss_at::date\s*=\s*CURRENT_DATE/);
  assert.match(combat, /boss_defeats=boss_defeats\+1, last_boss_win_at=NOW\(\)/);
  assert.match(database, /ADD COLUMN IF NOT EXISTS last_boss_win_at TIMESTAMPTZ/);
});


import { explorationMasteryReward } from '../rpg-mechanics.js';

test('region mastery pays bonus rewards at each third successful exploration', () => {
  assert.deepEqual(explorationMasteryReward(0), { level: 0, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(1), { level: 0, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(2), { level: 0, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(3), { level: 1, coins: 40, xp: 30, milestone: true });
  assert.deepEqual(explorationMasteryReward(6), { level: 2, coins: 40, xp: 30, milestone: true });
  assert.equal(explorationMasteryReward(-5).level, 0);
});

test('region mastery persists per selected exploration region and is displayed to players', async () => {
  const source = await readFile(new URL('../commands/rpg/kesif.js', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../database/db.js', import.meta.url), 'utf8');
  assert.match(source, /exploration_region_mastery/);
  assert.match(source, /explorationMasteryReward\(regionVisits\)/);
  assert.match(source, /Bölge ustalığı ödülü/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS exploration_region_mastery/);
});


test('exploration can find region-specific materials used by equipment crafting recipes', async () => {
  const exploration = await readFile(new URL('../commands/rpg/kesif.js', import.meta.url), 'utf8');
  const crafting = await readFile(new URL('../zanaat.js', import.meta.url), 'utf8');
  const materials = [
    '🥐 Büyülü Poğaça Kutusu',
    '💎 Mana Kristali',
    '📖 Yasak Büyü Kitabı',
    '🐉 Ejderha Pulu',
    '🌙 Efsunlu Elf Yadigârı',
    '📜 Frieren’in Kayıp Notları'
  ];
  assert.match(exploration, /const craftingMaterials = \{/);
  assert.match(exploration, /Math\.random\(\) < 0\.4/);
  for (const material of materials) {
    assert.ok(exploration.includes(material), `exploration missing crafting material: ${material}`);
    assert.ok(crafting.includes(material), `no crafting recipe consumes exploration material: ${material}`);
  }
  assert.match(exploration, /foundCraftingMaterial \? .*Zanaat malzemesi/);
});

test('daily quest chain awards recipe materials transactionally for all three stages', async () => {
  const quest = await readFile(new URL('../gorevzinciri.js', import.meta.url), 'utf8');
  const crafting = await readFile(new URL('../zanaat.js', import.meta.url), 'utf8');
  for (const material of ['🥐 Büyülü Poğaça Kutusu', '💎 Mana Kristali', '🐉 Ejderha Pulu']) {
    assert.ok(quest.includes(material), `quest chain missing crafting material: ${material}`);
    assert.ok(crafting.includes(material), `quest material cannot be used in crafting: ${material}`);
  }
  assert.match(quest, /INSERT INTO inventory/);
  assert.match(quest, /step\.material/);
  assert.match(quest, /BEGIN/);
  assert.match(quest, /COMMIT/);
});


import { getLevelScaledQuestReward } from '../rpg-mechanics.js';

test('daily quest rewards scale with level and grant a distinct full-chain completion bonus', () => {
  assert.deepEqual(getLevelScaledQuestReward(50, 20, 1, false), {
    multiplier: 1, coins: 50, xp: 20, completionBonus: false
  });
  assert.deepEqual(getLevelScaledQuestReward(100, 40, 21, false), {
    multiplier: 1.2, coins: 120, xp: 48, completionBonus: false
  });
  assert.deepEqual(getLevelScaledQuestReward(200, 80, 51, true), {
    multiplier: 1.5, coins: 450, xp: 270, completionBonus: true
  });
  assert.equal(getLevelScaledQuestReward(200, 80, 1000, true).multiplier, 3);
  assert.equal(getLevelScaledQuestReward(-50, -10, 0, false).coins, 0);
});


test('quest chain integrates level-scaled XP, level-ups, stat points and completion bonus', async () => {
  const quest = await readFile(new URL('../gorevzinciri.js', import.meta.url), 'utf8');
  const mechanics = await readFile(new URL('../rpg-mechanics.js', import.meta.url), 'utf8');
  assert.match(quest, /getLevelScaledQuestReward\(step\.reward, step\.xpReward, player\.level, step\.step === 3\)/);
  assert.match(quest, /levelForXp\(newXp\)/);
  assert.match(quest, /stat_points=stat_points\+\$6/);
  assert.match(quest, /reward\.completionBonus/);
  assert.match(quest, /SELECT xp, level, stat_points FROM users .* FOR UPDATE/);
  assert.match(mechanics, /export function getLevelScaledQuestReward/);
});

test('solo boss victories grant recipe materials matched to boss tier', async () => {
  const combat = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const catalog = await readFile(new URL('../rpg-content-catalog.js', import.meta.url), 'utf8');
  const crafting = await readFile(new URL('../zanaat.js', import.meta.url), 'utf8');
  for (const material of [
    '🥐 Büyülü Poğaça Kutusu',
    '📖 Yasak Büyü Kitabı',
    '🐉 Ejderha Pulu',
    '🌙 Efsunlu Elf Yadigârı',
    '👑 Himmel’in Efsanevi Yadigârı'
  ]) {
    assert.ok(catalog.includes(material), `boss catalog missing crafting material: ${material}`);
    assert.ok(crafting.includes(material), `boss crafting material has no recipe: ${material}`);
  }
  assert.match(combat, /boss\.craftingMaterial/);
  assert.match(combat, /INSERT INTO inventory\(guild_id,user_id,item_key,quantity\) VALUES\(\$1,\$2,\$3,1\)/);
});


test('dungeon depth and final victory award recipe materials to participating players', async () => {
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  const crafting = await readFile(new URL('../zanaat.js', import.meta.url), 'utf8');
  assert.match(dungeon, /const craftingLoot = floorsCleared >= FLOORS/);
  assert.match(dungeon, /'👑 Himmel’in Efsanevi Yadigârı'/);
  assert.match(dungeon, /'🐉 Ejderha Pulu'/);
  assert.match(dungeon, /'💎 Mana Kristali'/);
  assert.match(dungeon, /\.\.\.\(craftingLoot \? \[craftingLoot\] : \[\]\)/);
  for (const material of ['👑 Himmel’in Efsanevi Yadigârı', '🐉 Ejderha Pulu', '💎 Mana Kristali']) {
    assert.ok(crafting.includes(material), `dungeon material cannot be used in crafting: ${material}`);
  }
});

test('quest chain UI previews level-scaled rewards and the material reward for each stage', async () => {
  const quest = await readFile(new URL('../gorevzinciri.js', import.meta.url), 'utf8');
  assert.match(quest, /getLevelScaledQuestReward\(s\.reward, s\.xpReward, p\.level, s\.step === 3\)/);
  assert.match(quest, /reward\.coins.*reward\.xp.*s\.material/);
  assert.match(quest, /Sıradaki aşama açıldı/);
});


import { getBossArtUrl } from '../boss-art.js';

test('boss artwork resolver accepts HTTPS URLs and ignores missing, malformed or insecure values', () => {
  const key = 'POGACA_BOSS_ART_SCHATTENWOLF_URL';
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(getBossArtUrl('schattenwolf'), null);
    process.env[key] = 'http://example.com/boss.png';
    assert.equal(getBossArtUrl('schattenwolf'), null);
    process.env[key] = 'not-a-url';
    assert.equal(getBossArtUrl('schattenwolf'), null);
    process.env[key] = 'https://cdn.example.com/boss.png';
    assert.equal(getBossArtUrl('schattenwolf'), 'https://cdn.example.com/boss.png');
    assert.equal(getBossArtUrl('unknown-boss'), null);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('solo, raid and dungeon boss panels can display their own configured artwork', async () => {
  const solo = await readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const raid = await readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(solo, /bossImageUrl: boss\.artUrl/);
  assert.match(solo, /if \(bossImageUrl\) embed\.setImage\(bossImageUrl\)/);
  assert.match(raid, /getBossArtUrl\(BOSS\.id/);
  assert.match(raid, /if \(raidArtUrl\) embed\.setImage\(raidArtUrl\)/);
  assert.match(dungeon, /getBossArtUrl\('dungeonFinal'\)/);
  assert.match(envExample, /POGACA_BOSS_ART_SCHATTENWOLF_URL/);
  assert.match(envExample, /POGACA_DUNGEON_FINAL_BOSS_ART_URL/);
});


test('Turkish display names resolve to the intended persistent combat classes', () => {
  assert.equal(getCharacterClass('Büyücü').label, 'Büyücü');
  assert.equal(getCharacterClass('Muhafız').label, 'Muhafız');
  assert.equal(getCharacterClass('Şifacı').label, 'Şifacı');
  assert.equal(getCharacterClass('Gezgin').label, 'Gezgin');
});
