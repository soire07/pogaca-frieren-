import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentItems, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus, getLevelScaledQuestReward, restoreResourceRatio } from '../rpg-mechanics.js';

test('legendary set bonus activates at two pieces and disappears when one is removed', () => {
  const set = equipmentItems.filter(item => ['demon_blade', 'demon_armor'].includes(item.id));
  assert.equal(set.length, 2);
  const active = applyEquipmentSetBonus(set, equipmentBonus(set));
  assert.equal(active.attack, 20);
  assert.equal(active.hp, 85);
  assert.equal(active.setText, 'Efsanevi set: +4 saldırı, +25 HP');

  const remaining = set.filter(item => item.id !== 'demon_blade');
  const inactive = applyEquipmentSetBonus(remaining, equipmentBonus(remaining));
  assert.equal(inactive.attack, 0);
  assert.equal(inactive.hp, 60);
  assert.equal(inactive.setText, null);
});

test('epic set bonus activates at two pieces and disappears when one is removed', () => {
  const set = equipmentItems.filter(item => ['frieren_robe', 'rune_ring'].includes(item.id));
  assert.equal(set.length, 2);
  const active = applyEquipmentSetBonus(set, equipmentBonus(set));
  assert.equal(active.defense, 13);
  assert.equal(active.mana, 65);
  assert.equal(active.setText, 'Destansı set: +3 savunma, +15 mana');

  const remaining = set.filter(item => item.id !== 'rune_ring');
  const inactive = applyEquipmentSetBonus(remaining, equipmentBonus(remaining));
  assert.equal(inactive.defense, 7);
  assert.equal(inactive.mana, 30);
  assert.equal(inactive.setText, null);
});

test('level-scaled quest rewards include the chain completion bonus deterministically', () => {
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

test('combat HP and mana return to persistent base-stat ratios without exceeding base caps', () => {
  assert.equal(restoreResourceRatio(75, 150, 100), 50);
  assert.equal(restoreResourceRatio(45, 75, 100), 60);
  assert.equal(restoreResourceRatio(150, 150, 100), 100);
  assert.equal(restoreResourceRatio(190, 150, 100), 100);
  assert.equal(restoreResourceRatio(-10, 150, 100), 0);
  assert.equal(restoreResourceRatio(0, 150, 100), 0);
  assert.equal(restoreResourceRatio(50, 0, 100), 100);
  assert.equal(restoreResourceRatio(50, 150, 0), 0);
  assert.equal(restoreResourceRatio(Number.NaN, 150, 100), 0);
});
