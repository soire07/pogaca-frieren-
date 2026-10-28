import test from 'node:test';
import assert from 'node:assert/strict';
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
