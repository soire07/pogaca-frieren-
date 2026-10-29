import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentItems, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus, getLevelScaledQuestReward, restoreResourceRatio } from '../rpg-mechanics.js';
import {
  RAID_BOSSES,
  applyRaidWeakness,
  applyClassDamage,
  applyClassDefense,
  applyClassHealing,
  calculateBossIncomingDamage,
  getBossPhase,
  bossPhaseSpecialBonus
} from '../rpg-mechanics.js';

test('boss incoming damage never becomes negative and has a minimum of one', () => {
  for (const raw of [-100, -1, 0, 1]) {
    assert.equal(calculateBossIncomingDamage(raw, 0, 1), 1, 'raw damage ' + raw);
  }
  assert.equal(calculateBossIncomingDamage(100, 1000, 1), 1);
});

test('boss incoming damage clamps negative defense and floors fractional inputs safely', () => {
  assert.equal(calculateBossIncomingDamage(20, -50, 1), 20);
  assert.equal(calculateBossIncomingDamage(20.9, 0, 1), 20);
  assert.equal(calculateBossIncomingDamage(20, 5, 1), 18);
});

test('boss phases use stable health thresholds and reject invalid maximum HP', () => {
  assert.equal(getBossPhase(100, 100), 1);
  assert.equal(getBossPhase(67, 100), 1);
  assert.equal(getBossPhase(66, 100), 2);
  assert.equal(getBossPhase(34, 100), 2);
  assert.equal(getBossPhase(33, 100), 3);
  assert.equal(getBossPhase(0, 100), 3);
  assert.equal(getBossPhase(-10, 100), 3);
  assert.equal(getBossPhase(10, 0), 1);
  assert.equal(getBossPhase(Number.NaN, 100), 1);
});

test('boss phase multipliers and special bonuses are deterministic', () => {
  assert.equal(calculateBossIncomingDamage(20, 0, 1), 20);
  assert.equal(calculateBossIncomingDamage(20, 0, 2), 22);
  assert.equal(calculateBossIncomingDamage(20, 0, 3), 25);
  assert.equal(bossPhaseSpecialBonus(1), 0);
  assert.equal(bossPhaseSpecialBonus(2), 4);
  assert.equal(bossPhaseSpecialBonus(3), 8);
});

test('raid weakness applies a 30 percent rounded bonus only to the matching action', () => {
  const spellBoss = RAID_BOSSES.find(boss => boss.weakness === 'spell');
  const attackBoss = RAID_BOSSES.find(boss => boss.weakness === 'attack');
  assert.ok(spellBoss);
  assert.ok(attackBoss);
  assert.equal(applyRaidWeakness(100, spellBoss, 'spell'), 130);
  assert.equal(applyRaidWeakness(100, spellBoss, 'attack'), 100);
  assert.equal(applyRaidWeakness(1, spellBoss, 'spell'), 1);
  assert.equal(applyRaidWeakness(5, spellBoss, 'spell'), 7);
  assert.equal(applyRaidWeakness(100, attackBoss, 'attack'), 130);
});

test('class damage, defense and healing bonuses round down consistently', () => {
  assert.equal(applyClassDamage(101, 'Büyücü'), 109);
  assert.equal(applyClassDamage(101, 'Gezgin'), 101);
  assert.equal(applyClassDefense(101, 'Muhafız'), 113);
  assert.equal(applyClassHealing(26, 'Şifacı'), 31);
});


test('legendary and epic set bonuses activate at exact thresholds and disappear when a piece is removed', () => {
  const legendary = equipmentItems.filter(item => ['demon_blade', 'demon_armor'].includes(item.id));
  const legendaryBonus = applyEquipmentSetBonus(legendary, equipmentBonus(legendary));
  assert.equal(legendaryBonus.attack, 20);
  assert.equal(legendaryBonus.hp, 85);
  assert.equal(legendaryBonus.setText, 'Efsanevi set: +4 saldırı, +25 HP');

  const oneLegendary = legendary.filter(item => item.id !== 'demon_blade');
  const noSet = applyEquipmentSetBonus(oneLegendary, equipmentBonus(oneLegendary));
  assert.equal(noSet.attack, 0);
  assert.equal(noSet.hp, 60);
  assert.equal(noSet.setText, null);

  const epic = equipmentItems.filter(item => ['frieren_robe', 'rune_ring'].includes(item.id));
  const epicBonus = applyEquipmentSetBonus(epic, equipmentBonus(epic));
  assert.equal(epicBonus.defense, 13);
  assert.equal(epicBonus.mana, 65);
  assert.equal(epicBonus.setText, 'Destansı set: +3 savunma, +15 mana');

  const oneEpic = epic.filter(item => item.id !== 'rune_ring');
  const noEpicSet = applyEquipmentSetBonus(oneEpic, equipmentBonus(oneEpic));
  assert.equal(noEpicSet.defense, 7);
  assert.equal(noEpicSet.mana, 30);
  assert.equal(noEpicSet.setText, null);
});

test('quest reward scaling returns deterministic coins and XP, including the chain completion bonus', () => {
  assert.deepEqual(getLevelScaledQuestReward(100, 80, 21, false), {
    multiplier: 1.2, coins: 120, xp: 96, completionBonus: false
  });
  assert.deepEqual(getLevelScaledQuestReward(100, 80, 21, true), {
    multiplier: 1.2, coins: 240, xp: 216, completionBonus: true
  });
  assert.deepEqual(getLevelScaledQuestReward(-5, -10, 0, false), {
    multiplier: 1, coins: 0, xp: 0, completionBonus: false
  });
});


test('HP and mana persist as base-stat ratios across temporary equipment and combat multipliers', () => {
  assert.equal(restoreResourceRatio(75, 150, 100), 50, '75/150 combat HP must persist as 50/100 base HP');
  assert.equal(restoreResourceRatio(45, 75, 100), 60, '45/75 combat mana must persist as 60/100 base mana');
  assert.equal(restoreResourceRatio(150, 150, 100), 100, 'full temporary HP must not persist above base maximum');
  assert.equal(restoreResourceRatio(190, 150, 100), 100, 'over-cap HP must be clamped to the base maximum');
  assert.equal(restoreResourceRatio(-10, 150, 100), 0, 'negative HP must clamp to zero');
  assert.equal(restoreResourceRatio(0, 150, 100), 0);
  assert.equal(restoreResourceRatio(1, 0, 100), 100, 'invalid effective maximum uses a safe divisor');
  assert.equal(restoreResourceRatio(50, 150, 0), 0, 'invalid base maximum must not create persistent resources');
  assert.equal(restoreResourceRatio(Number.NaN, 150, 100), 0, 'invalid current resource must be rejected');
});
