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

test('combined equipment, build, class and talent modifiers preserve base resources', async () => {
  const { applyTalentBonus, getCharacterBuild, applyClassDefense } = await import('../rpg-mechanics.js');
  const base = { hp: 75, max_hp: 100, mana: 40, max_mana: 80, attack: 50, defense: 30, talent_hp: 2, talent_mana: 1, talent_attack: 3, talent_defense: 2, class_name: 'Muhafız', active_build: 'avci' };
  const before = { ...base };
  const set = equipmentItems.filter(item => ['demon_blade', 'demon_armor'].includes(item.id));
  const gear = applyEquipmentSetBonus(set, equipmentBonus(set));
  const build = getCharacterBuild(base.active_build);
  const maxHp = Math.round(applyTalentBonus((base.max_hp + gear.hp) * build.hp, base.talent_hp, 0.05));
  const maxMana = Math.round(applyTalentBonus((base.max_mana + gear.mana) * build.mana, base.talent_mana, 0.05));
  const attack = Math.round(applyTalentBonus((base.attack + gear.attack) * build.attack, base.talent_attack, 0.04));
  const defense = Math.round(applyTalentBonus(applyClassDefense(base.defense + gear.defense, base.class_name) * build.defense, base.talent_defense, 0.04));
  assert.deepEqual({ maxHp, maxMana, attack, defense }, { maxHp: 204, maxMana: 84, attack: 94, defense: 47 });
  assert.deepEqual(base, before, 'temporary modifiers must not mutate persistent base stats');
  assert.equal(restoreResourceRatio(maxHp * 0.6, maxHp, base.max_hp), 60);
  assert.equal(restoreResourceRatio(maxMana * 0.25, maxMana, base.max_mana), 20);
});

test('equipment set bonuses are wired into exploration, solo/co-op boss and profile calculations', async () => {
  const read = async path => (await import('node:fs/promises')).readFile(new URL(path, import.meta.url), 'utf8');
  const [exploration, soloBoss, coOpBoss, profile] = await Promise.all([
    read('../commands/rpg/kesif.js'),
    read('../iblisavasi.js'),
    read('../ortakboss.js'),
    read('../profil.js')
  ]);

  assert.match(exploration, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  assert.match(exploration, /effectiveMaxHp[\s\S]*?gear\.hp/);
  assert.match(exploration, /effectiveMaxMana[\s\S]*?gear\.mana/);
  assert.match(exploration, /effectiveDefense[\s\S]*?gear\.defense/);
  assert.match(exploration, /gear\.setText[\s\S]*?Etkin ekipman seti/);

  assert.match(soloBoss, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  for (const stat of ['hp', 'mana', 'attack', 'defense']) assert.ok(soloBoss.includes('gearBonus.' + stat), 'solo boss must apply set bonus ' + stat);

  assert.match(coOpBoss, /applyEquipmentSetBonus\(equipped, equipmentBonus\(equipped\)\)/);
  for (const stat of ['hp', 'mana', 'attack', 'defense']) assert.ok(coOpBoss.includes('gear.' + stat), 'co-op boss must apply set bonus ' + stat);

  assert.match(profile, /applyEquipmentSetBonus\(equippedItems, equipmentBonus\(equippedItems\)\)/);
  assert.match(profile, /gear\.setText \|\| 'Henüz set bonusu etkin değil'/);
  for (const stat of ['hp', 'mana', 'attack', 'defense']) assert.ok(profile.includes('gear.' + stat), 'profile must display set-adjusted ' + stat);
});
