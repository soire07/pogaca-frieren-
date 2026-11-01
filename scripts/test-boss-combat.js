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

test('solo boss victory grants rewards in one transaction and guards duplicate button handling', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const victory = source.indexOf('if (bossHp <= 0)');
  const begin = source.indexOf("await db.query('BEGIN')", victory);
  const rewardUpdate = source.indexOf('coins=coins+$5, xp=xp+$6, boss_defeats=boss_defeats+1', begin);
  const firstInventory = source.indexOf('INSERT INTO inventory', begin);
  const commit = source.indexOf("await db.query('COMMIT')", firstInventory);
  assert.ok(victory >= 0 && begin > victory && rewardUpdate > begin && firstInventory > rewardUpdate && commit > firstInventory,
    'victory rewards and inventory must be committed in one transaction');
  assert.equal((source.match(/coins=coins\+\$5, xp=xp\+\$6, boss_defeats=boss_defeats\+1/g) || []).length, 1,
    'boss victory reward update must have a single code path');
  assert.match(source, /if \(finished \|\| busy\) return button\.deferUpdate\(\)/);
  assert.match(source, /finished = true;\s*collector\.stop\('victory'\)/);
  assert.match(source, /await db\.query\('ROLLBACK'\)\.catch/);
});

test('boss defeat and expired combat persist survival state without granting victory rewards', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const defeat = source.indexOf('if (playerHp <= 0)');
  const collectorEnd = source.indexOf("collector.on('end'", defeat);
  assert.ok(defeat >= 0 && collectorEnd > defeat, 'defeat and timeout handlers must exist');
  const failurePaths = source.slice(defeat, collectorEnd);
  assert.match(failurePaths, /Ödül kazanamadın/);
  assert.doesNotMatch(failurePaths, /coins=coins\+|xp=xp\+|boss_defeats=boss_defeats\+|INSERT INTO inventory/);
  const timeoutPath = source.slice(collectorEnd);
  assert.match(timeoutPath, /Savaşın süresi doldu/);
  assert.doesNotMatch(timeoutPath, /coins=coins\+|xp=xp\+|boss_defeats=boss_defeats\+|INSERT INTO inventory/);
  assert.match(source, /UPDATE users SET hp=\$3, mana=\$4 WHERE guild_id=\$1 AND user_id=\$2/);
});


test('solo boss reward persistence is idempotent per battle session across duplicate handlers', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const schema = await (await import('node:fs/promises')).readFile(new URL('../database/db.js', import.meta.url), 'utf8');
  assert.match(source, /randomUUID/);
  assert.match(source, /last_boss_battle_id/);
  assert.match(source, /last_boss_battle_id IS DISTINCT FROM \\$7/);
  const victory = source.indexOf('if (bossHp <= 0)');
  const begin = source.indexOf("await db.query('BEGIN')", victory);
  const reward = source.indexOf('last_boss_battle_id=$7', begin);
  const commit = source.indexOf("await db.query('COMMIT')", reward);
  assert.ok(victory >= 0 && begin > victory && reward > begin && commit > reward,
    'the battle session must be claimed atomically before rewards commit');
  assert.match(schema, /last_boss_battle_id TEXT/);
});
