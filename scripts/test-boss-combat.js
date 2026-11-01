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

test('solo boss victory grants rewards in one production transaction and guards duplicate button handling', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  const rewards = await (await import('node:fs/promises')).readFile(new URL('../rpg-reward-transactions.js', import.meta.url), 'utf8');
  const victory = source.indexOf('if (bossHp <= 0)');
  const claim = source.indexOf('claimSoloBossReward', victory);
  assert.ok(victory >= 0 && claim > victory, 'victory handler must invoke the production reward transaction');
  assert.match(rewards, /last_boss_battle_id IS DISTINCT FROM \$7/);
  assert.match(rewards, /coins=coins\+\$5, xp=xp\+\$6/);
  assert.match(rewards, /INSERT INTO inventory/);
  assert.match(rewards, /await db.query\('COMMIT'\)/);
  assert.match(rewards, /await db.query\('ROLLBACK'\)/);
  assert.match(source, /if \(finished \|\| busy\) return button\.deferUpdate\(\)/);
  assert.match(source, /finished = true;\s*collector\.stop\('victory'\)/);
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
  const rewards = await (await import('node:fs/promises')).readFile(new URL('../rpg-reward-transactions.js', import.meta.url), 'utf8');
  const schema = await (await import('node:fs/promises')).readFile(new URL('../database/db.js', import.meta.url), 'utf8');
  assert.match(source, /randomUUID/);
  assert.ok(rewards.includes('last_boss_battle_id'));
  assert.ok(source.includes('claimSoloBossReward'));
  assert.ok(rewards.includes('last_boss_battle_id IS DISTINCT FROM $7'));
  assert.ok(rewards.includes("return { status: 'already_claimed' }"));
  assert.match(schema, /last_boss_battle_id TEXT/);
});



test('solo boss handler announces each phase, scales damage and lets freeze cancel special attacks', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  assert.match(source, /const nextBossPhase = getBossPhase\(bossHp, boss\.maxHp\)/);
  assert.match(source, /if \(nextBossPhase > bossPhase\)/);
  assert.match(source, /ikinci aşamaya girdi/);
  assert.match(source, /son aşamasına geçti/);
  assert.match(source, /calculateBossIncomingDamage\(rawBossDamage, defense, bossPhase\)/);
  assert.match(source, /bossPhaseSpecialBonus\(bossPhase\)/);
  assert.match(source, /turnCount % 3 === 0 && !frozenBoss/);
  assert.match(source, /Donma etkisi bossun özel saldırısını da durdurdu/);
  assert.match(source, /if \(frozenBoss\) bossDamage = 0/);
});

test('cooperative raid announces second and final boss phases and scales incoming damage', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /const currentPhase = getBossPhase\(bossHp, maxBossHp\)/);
  assert.match(source, /if \(currentPhase > bossPhase\)/);
  assert.match(source, /ikinci evreye geçti/);
  assert.match(source, /son evreye geçti/);
  assert.match(source, /calculateBossIncomingDamage\\(rawDamage, Math\\.round\\(target\\.defense\\*0\\.56\\), bossPhase\\)/);
  assert.match(source, /bossPhaseSpecialBonus\(bossPhase\)/);
});

test('final layered dungeon boss announces both phases and applies phase-scaled damage', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(source, /const currentPhase = finalBoss \? getBossPhase\(enemyHp, maxEnemyHp\) : 1/);
  assert.match(source, /if \(currentPhase > enemyPhase\)/);
  assert.match(source, /İblis Lordu ikinci evreye geçti/);
  assert.match(source, /İblis Lordu son evreye geçti/);
  assert.match(source, /calculateBossIncomingDamage\(rawIncoming, Math\.round\(target\.defense \* 0\.6\), enemyPhase\)/);
  assert.match(source, /bossPhaseSpecialBonus\(enemyPhase\)/);
});
