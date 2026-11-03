import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAID_BOSSES, chooseRaidBoss, applyRaidWeakness, dungeonChoiceOutcome,
  dungeonEnemyStats, progressionMilestone, getCharacterClass, applyClassDamage,
  applyClassDefense, applyClassHealing, characterClassGuide, applyClassManaCost,
  getCharacterBuild, getBossPhase, calculateBossIncomingDamage, bossPhaseSpecialBonus,
  getSpellMasteryAwakening, shouldGuaranteeRareDiscovery, explorationMasteryReward,
  getLevelScaledQuestReward, restoreResourceRatio, applyDefendingReduction,
  scaleRaidBossHp, isFinalDungeonBossEnraged, shouldFinalDungeonBossSpecialAttack,
  calculateFinalDungeonBossRawDamage, getDungeonEventOutcome, canAssignPartyRole,
  isPartyWiped, getPartyRoleModifiers
} from '../rpg-mechanics.js';
import { equipmentItems, equipmentSlots, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus } from '../rpg-mechanics.js';
import { masteryLevelForCasts, practiceCost } from '../commands/rpg/buyupratik.js';

test('dungeon difficulty, floor, party size and average level change actual enemy stats monotonically', () => {
  const base = dungeonEnemyStats(1, 1, 2, 'normal');
  assert.ok(dungeonEnemyStats(2, 1, 2, 'normal').hp > base.hp);
  assert.ok(dungeonEnemyStats(1, 10, 2, 'normal').hp > base.hp);
  assert.ok(dungeonEnemyStats(1, 1, 4, 'normal').hp > base.hp);
  assert.ok(dungeonEnemyStats(1, 1, 2, 'easy').hp < base.hp);
  assert.ok(dungeonEnemyStats(1, 1, 2, 'nightmare').hp > base.hp);
  assert.ok(dungeonEnemyStats(1, 1, 2, 'nightmare').damage > base.damage);
});

test('dungeon routes return distinct, floor-scaled rewards and healing outcomes', () => {
  const secret = dungeonChoiceOutcome('secret', 3);
  const shrine = dungeonChoiceOutcome('shrine', 3);
  const safe = dungeonChoiceOutcome('safe', 3);
  assert.deepEqual([secret.coins, secret.hp, secret.mana, secret.lootChance], [44, -8, 0, 0.45]);
  assert.deepEqual([shrine.coins, shrine.hp, shrine.mana, shrine.lootChance], [0, 13, 22, 0.08]);
  assert.deepEqual([safe.coins, safe.hp, safe.mana, safe.lootChance], [22, 0, 0, 0.15]);
  assert.notEqual(secret.label, shrine.label);
  assert.notEqual(shrine.label, safe.label);
});

test('raid boss selection is deterministic for each catalog slot and safely falls back for an empty catalog', () => {
  assert.equal(chooseRaidBoss(() => 0).id, 'north-general');
  assert.equal(chooseRaidBoss(() => 0.4).id, 'glass-wyrm');
  assert.equal(chooseRaidBoss(() => 0.99).id, 'fallen-mage');
  assert.equal(chooseRaidBoss(() => 0, []).id, RAID_BOSSES[0].id);
  assert.equal(chooseRaidBoss(() => 1).id, RAID_BOSSES[0].id);
});

test('each raid boss has a distinct combat profile, signature action, weakness and loot', () => {
  assert.equal(new Set(RAID_BOSSES.map(b => b.id)).size, 3);
  assert.equal(new Set(RAID_BOSSES.map(b => b.special)).size, 3);
  assert.equal(new Set(RAID_BOSSES.map(b => b.loot)).size, 3);
  assert.ok(RAID_BOSSES.every(b => b.hp > 0 && b.damage > 0 && b.xp > 0 && b.coins > 0));
  assert.equal(RAID_BOSSES.find(b => b.id === 'north-general').special, 'mana-star');
  assert.equal(RAID_BOSSES.find(b => b.id === 'glass-wyrm').special, 'shard-rain');
  assert.equal(RAID_BOSSES.find(b => b.id === 'fallen-mage').special, 'mana-curse');
});

test('raid weaknesses amplify only the matching attack type', () => {
  const spellWeak = RAID_BOSSES.find(b => b.weakness === 'spell');
  const attackWeak = RAID_BOSSES.find(b => b.weakness === 'attack');
  assert.equal(applyRaidWeakness(100, spellWeak, 'spell'), 130);
  assert.equal(applyRaidWeakness(100, spellWeak, 'attack'), 100);
  assert.equal(applyRaidWeakness(100, attackWeak, 'attack'), 130);
  assert.equal(applyRaidWeakness(100, attackWeak, 'spell'), 100);
});

test('boss phase boundaries, incoming damage and phase special bonuses are deterministic', () => {
  assert.equal(getBossPhase(67, 100), 1);
  assert.equal(getBossPhase(66, 100), 2);
  assert.equal(getBossPhase(34, 100), 2);
  assert.equal(getBossPhase(33, 100), 3);
  assert.equal(getBossPhase(-1, 100), 3);
  assert.equal(getBossPhase(1, 0), 1);
  assert.equal(calculateBossIncomingDamage(20, 0, 1), 20);
  assert.equal(calculateBossIncomingDamage(20, 0, 2), 22);
  assert.equal(calculateBossIncomingDamage(20, 0, 3), 25);
  assert.equal(bossPhaseSpecialBonus(1), 0);
  assert.equal(bossPhaseSpecialBonus(2), 4);
  assert.equal(bossPhaseSpecialBonus(3), 8);
});

test('class passives produce their advertised damage, defense, healing and mana-cost effects', () => {
  assert.equal(applyClassDamage(101, 'Büyücü'), 109);
  assert.equal(applyClassDefense(101, 'Muhafız'), 113);
  assert.equal(applyClassHealing(26, 'Şifacı'), 31);
  assert.equal(applyClassManaCost(18, 'Büyücü'), 16);
  assert.equal(applyClassManaCost(18, 'Gezgin'), 18);
  assert.equal(applyClassManaCost(1, 'Büyücü'), 1);
  assert.equal(getCharacterClass('buyucu').label, 'Büyücü');
  assert.equal(getCharacterClass('unknown').label, 'Gezgin');
});

test('class guide contains each selectable class and only its actual passive bonuses', () => {
  const guide = characterClassGuide();
  assert.deepEqual(guide.map(c => c.key).sort(), ['buyucu', 'gezgin', 'muhafiz', 'sifaci']);
  assert.ok(guide.find(c => c.key === 'buyucu').bonuses.some(x => x.includes('Mana maliyeti -10%')));
  assert.ok(guide.find(c => c.key === 'muhafiz').bonuses.some(x => x.includes('Savunma +12%')));
  assert.ok(guide.find(c => c.key === 'sifaci').bonuses.some(x => x.includes('İyileştirme +20%')));
  assert.equal(guide.find(c => c.key === 'gezgin').bonuses.length, 0);
});

test('combat builds expose bounded, distinct stat multipliers and invalid values resolve to balanced', () => {
  const balanced = getCharacterBuild('dengeli');
  const hunter = getCharacterBuild('avci');
  const guardian = getCharacterBuild('muhafiz');
  const mage = getCharacterBuild('buyucu');
  assert.deepEqual([balanced.attack, balanced.defense, balanced.hp, balanced.mana], [1, 1, 1, 1]);
  assert.deepEqual([hunter.attack, hunter.defense, hunter.hp, hunter.mana], [1.2, 0.9, 1, 1]);
  assert.deepEqual([guardian.attack, guardian.defense, guardian.hp, guardian.mana], [0.9, 1.2, 1.2, 1]);
  assert.deepEqual([mage.attack, mage.defense, mage.hp, mage.mana], [1.1, 0.9, 1, 1.25]);
  assert.equal(getCharacterBuild('invalid'), balanced);
});

test('spell mastery advances at each ten-cast boundary, scales practice price and caps at ten', () => {
  assert.equal(masteryLevelForCasts(9), 0);
  assert.equal(masteryLevelForCasts(10), 1);
  assert.equal(masteryLevelForCasts(99), 9);
  assert.equal(masteryLevelForCasts(100), 10);
  assert.equal(masteryLevelForCasts(1000), 10);
  assert.deepEqual([practiceCost(0), practiceCost(1), practiceCost(5), practiceCost(10)], [25, 60, 200, 375]);
});

test('all eight spell mastery capstones activate only at mastery ten', () => {
  const spells = {
    zoltraak: { damage: 8 }, alev_kuresi: { damage: 10 }, buz_mizragi: { freezeChance: 0.1 },
    koruyucu_bariyer: { shieldReduction: 0.05 }, sifa_isigi: { healing: 10 },
    yildirim_zinciri: { damage: 12 }, tas_duvar: { wallReduction: 0.05 }, mana_patlamasi: { damage: 15 }
  };
  for (const [key, perk] of Object.entries(spells)) {
    assert.equal(getSpellMasteryAwakening(key, 9).damage, 0);
    assert.deepEqual(getSpellMasteryAwakening(key, 10), {
      damage: 0, freezeChance: 0, shieldReduction: 0, healing: 0, wallReduction: 0, ...perk
    });
  }
  assert.equal(getSpellMasteryAwakening('unknown', 10).damage, 0);
});

test('rare discovery pity guarantees only undiscovered rare locations at every twentieth adventure', () => {
  assert.equal(shouldGuaranteeRareDiscovery(18, 0), false);
  assert.equal(shouldGuaranteeRareDiscovery(19, 0), true);
  assert.equal(shouldGuaranteeRareDiscovery(39, 1), true);
  assert.equal(shouldGuaranteeRareDiscovery(59, 2), true);
  assert.equal(shouldGuaranteeRareDiscovery(79, 3), false);
});

test('route mastery pays exactly on third-visit milestones and never on other visits', () => {
  assert.deepEqual(explorationMasteryReward(1), { level: 0, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(2), { level: 0, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(3), { level: 1, coins: 40, xp: 30, milestone: true });
  assert.deepEqual(explorationMasteryReward(4), { level: 1, coins: 0, xp: 0, milestone: false });
  assert.deepEqual(explorationMasteryReward(6), { level: 2, coins: 40, xp: 30, milestone: true });
});

test('daily quest rewards scale by level, cap multiplier and add completion bonus once', () => {
  assert.deepEqual(getLevelScaledQuestReward(50, 30, 1), { multiplier: 1, coins: 50, xp: 30, completionBonus: false });
  assert.deepEqual(getLevelScaledQuestReward(50, 30, 11, true), { multiplier: 1.1, coins: 165, xp: 143, completionBonus: true });
  assert.deepEqual(getLevelScaledQuestReward(50, 30, 500, true), { multiplier: 3, coins: 450, xp: 390, completionBonus: true });
});

test('temporary combat resources restore to the base-stat ratio without exceeding base caps', () => {
  assert.equal(restoreResourceRatio(50, 100, 80), 40);
  assert.equal(restoreResourceRatio(120, 100, 80), 80);
  assert.equal(restoreResourceRatio(-10, 100, 80), 0);
  assert.equal(restoreResourceRatio(0, 0, 80), 0);
  assert.equal(restoreResourceRatio(50, 100, 0), 0);
});

test('equipment catalog has unique slots and complete stat calculations for all twelve items', () => {
  assert.equal(equipmentItems.length, 12);
  assert.equal(new Set(equipmentItems.map(x => x.id)).size, 12);
  assert.deepEqual(equipmentSlots.map(x => x.id), ['weapon', 'armor', 'ring1', 'ring2']);
  for (const item of equipmentItems) {
    const total = equipmentBonus([item]);
    assert.deepEqual(total, {
      attack: Number(item.attack || 0), defense: Number(item.defense || 0),
      hp: Number(item.hp || 0), mana: Number(item.mana || 0)
    });
  }
});

test('epic and legendary equipment set bonuses activate at two matching pieces and disappear below threshold', () => {
  const items = equipmentItems;
  const legendary = items.filter(x => x.rarity === 'Efsanevi');
  const epic = items.filter(x => x.rarity === 'Destansı');
  const emptyBonus = { attack: 0, defense: 0, hp: 0, mana: 0 };
  assert.deepEqual(
    (({attack,defense,hp,mana}) => [attack,defense,hp,mana])(applyEquipmentSetBonus(legendary, emptyBonus)),
    [4,0,25,0]
  );
  assert.deepEqual(
    (({attack,defense,hp,mana}) => [attack,defense,hp,mana])(applyEquipmentSetBonus(epic, emptyBonus)),
    [0,3,0,15]
  );
  assert.equal(applyEquipmentSetBonus(legendary.slice(0,1), emptyBonus).setText, null);
  assert.equal(applyEquipmentSetBonus(epic.slice(0,1), emptyBonus).setText, null);
});


test('raid boss HP scaling includes average party level and additional party members', () => {
  assert.equal(scaleRaidBossHp(220, 10, 2), 400);
  assert.equal(scaleRaidBossHp(220, 10, 3), 490);
  assert.equal(scaleRaidBossHp(220, 20, 3), 670);
  assert.equal(scaleRaidBossHp(220, 10, 1), 400);
});

test('final dungeon boss enrage and special attack thresholds are deterministic', () => {
  assert.equal(isFinalDungeonBossEnraged(5, 5, 50, 100), true);
  assert.equal(isFinalDungeonBossEnraged(5, 5, 51, 100), false);
  assert.equal(isFinalDungeonBossEnraged(4, 5, 1, 100), false);
  assert.equal(shouldFinalDungeonBossSpecialAttack(5, 5, 3), true);
  assert.equal(shouldFinalDungeonBossSpecialAttack(5, 5, 6), true);
  assert.equal(shouldFinalDungeonBossSpecialAttack(5, 5, 2), false);
  assert.equal(shouldFinalDungeonBossSpecialAttack(4, 5, 3), false);
});

test('final dungeon boss attack profile applies its 1.35 multiplier, enrage and periodic special bonus', () => {
  const regular = calculateFinalDungeonBossRawDamage(10, {
    floor: 4, totalFloors: 5, turn: 2, enraged: false, specialAttack: false, phase: 1
  });
  const finalBoss = calculateFinalDungeonBossRawDamage(10, {
    floor: 5, totalFloors: 5, turn: 3, enraged: true, specialAttack: true, phase: 3
  });
  assert.equal(regular, 9);
  assert.equal(finalBoss, 35);
  assert.ok(finalBoss > regular);
});

test('defending action reduces incoming damage by 55 percent and keeps a one-damage minimum', () => {
  assert.equal(applyDefendingReduction(100, false), 100);
  assert.equal(applyDefendingReduction(100, true), 45);
  assert.equal(applyDefendingReduction(1, true), 1);
  assert.equal(applyDefendingReduction(0, true), 1);
});

test('dungeon event roll deterministically distinguishes hidden chests, traps and no event', () => {
  assert.equal(getDungeonEventOutcome(0.1), 'hidden_chest');
  assert.equal(getDungeonEventOutcome(0.2399), 'hidden_chest');
  assert.equal(getDungeonEventOutcome(0.24), 'trap');
  assert.equal(getDungeonEventOutcome(0.4199), 'trap');
  assert.equal(getDungeonEventOutcome(0.42), 'none');
});

test('party role assignments reject duplicate or unknown roles and preserve the three role multipliers', () => {
  assert.equal(canAssignPartyRole([], 'tank'), true);
  assert.equal(canAssignPartyRole(['tank'], 'tank'), false);
  assert.equal(canAssignPartyRole(['tank'], 'healer'), true);
  assert.equal(canAssignPartyRole(['tank','healer'], 'damage'), true);
  assert.equal(canAssignPartyRole([], 'wizard'), false);
  assert.deepEqual(getPartyRoleModifiers('tank'), { hp: 1.25, attack: 0.85, defense: 1.4 });
  assert.deepEqual(getPartyRoleModifiers('healer'), { hp: 1, attack: 0.9, defense: 1.05 });
  assert.deepEqual(getPartyRoleModifiers('damage'), { hp: 0.95, attack: 1.3, defense: 0.9 });
  assert.deepEqual(getPartyRoleModifiers('tank', 'raid'), { hp: 1.25, attack: 0.85, defense: 1.45 });
  assert.deepEqual(getPartyRoleModifiers('healer', 'raid'), { hp: 1, attack: 0.85, defense: 1.05 });
  assert.deepEqual(getPartyRoleModifiers('damage', 'raid'), { hp: 0.95, attack: 1.35, defense: 0.9 });
  assert.equal(canAssignPartyRole(['damage'], 'damage'), true);
});

test('party wipe is reported only when every member has zero or less HP', () => {
  assert.equal(isPartyWiped([0, 0, 0]), true);
  assert.equal(isPartyWiped([-1, 0, 0]), true);
  assert.equal(isPartyWiped([1, 0, 0]), false);
  assert.equal(isPartyWiped([]), false);
});
