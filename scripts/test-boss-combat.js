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
  bossPhaseSpecialBonus,
  getRaidBossSpecialAttack,
  chooseRaidAttackTarget,
  chooseDungeonAttackTarget,
  resolveRaidAreaAttack,
  getSoloBossSpecialAttackState,
  dungeonEnemyStats,
  applyDungeonTrapDamage,
  DUNGEON_PARTY_ROLES,
  RAID_PARTY_ROLES
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

test('ice spear freeze cancels scheduled solo boss special attacks and mana drain', () => {
  for (const turn of [0,1,2,4,5,7]) {
    assert.equal(getSoloBossSpecialAttackState(turn, false), 'none');
    assert.equal(getSoloBossSpecialAttackState(turn, true), 'none');
  }
  for (const turn of [3,6,9]) {
    assert.equal(getSoloBossSpecialAttackState(turn, false), 'execute');
    assert.equal(getSoloBossSpecialAttackState(turn, true), 'cancelled');
  }
});

test('dungeon enemy health and damage scale with party level, size and difficulty', () => {
  const base = dungeonEnemyStats(2,1,2,'normal');
  const higherLevel = dungeonEnemyStats(2,10,2,'normal');
  const largerParty = dungeonEnemyStats(2,1,4,'normal');
  const easy = dungeonEnemyStats(2,1,2,'easy');
  const nightmare = dungeonEnemyStats(2,1,2,'nightmare');
  assert.ok(higherLevel.hp > base.hp && higherLevel.damage > base.damage);
  assert.ok(largerParty.hp > base.hp);
  assert.ok(easy.hp < base.hp && easy.damage < base.damage);
  assert.ok(nightmare.hp > base.hp && nightmare.damage > base.damage);
});

test('dungeon floor traps damage one living teammate and never reduce HP below one', () => {
  const hit = applyDungeonTrapDamage([40,100,0],2,()=>0);
  assert.equal(hit.targetIndex,0);
  assert.equal(hit.damage,16);
  assert.deepEqual(hit.hpNow,[24,100,0]);
  const lethal = applyDungeonTrapDamage([5,0],4,()=>0);
  assert.equal(lethal.damage,24);
  assert.equal(lethal.hpNow[0],1);
  const noLiving = applyDungeonTrapDamage([0,0],3,()=>0);
  assert.equal(noLiving.targetIndex,null);
  assert.equal(noLiving.damage,0);
  assert.deepEqual(noLiving.hpNow,[0,0]);
});

test('dungeon and raid roles apply distinct HP, attack and defense modifiers', () => {
  assert.deepEqual(
    [DUNGEON_PARTY_ROLES.tank.hp,DUNGEON_PARTY_ROLES.tank.attack,DUNGEON_PARTY_ROLES.tank.defense],
    [1.25,0.85,1.4]
  );
  assert.deepEqual(
    [DUNGEON_PARTY_ROLES.healer.hp,DUNGEON_PARTY_ROLES.healer.attack,DUNGEON_PARTY_ROLES.healer.defense],
    [1,0.9,1.05]
  );
  assert.deepEqual(
    [DUNGEON_PARTY_ROLES.damage.hp,DUNGEON_PARTY_ROLES.damage.attack,DUNGEON_PARTY_ROLES.damage.defense],
    [0.95,1.3,0.9]
  );
  assert.deepEqual(
    [RAID_PARTY_ROLES.tank.hp,RAID_PARTY_ROLES.tank.attack,RAID_PARTY_ROLES.tank.defense],
    [1.25,0.85,1.45]
  );
  assert.deepEqual(
    [RAID_PARTY_ROLES.healer.hp,RAID_PARTY_ROLES.healer.attack,RAID_PARTY_ROLES.healer.defense],
    [1,0.85,1.05]
  );
  assert.deepEqual(
    [RAID_PARTY_ROLES.damage.hp,RAID_PARTY_ROLES.damage.attack,RAID_PARTY_ROLES.damage.defense],
    [0.95,1.35,0.9]
  );
});

test('raid special attacks trigger on their exact scheduled rounds', () => {
  assert.equal(getRaidBossSpecialAttack('mana-star', 2), null);
  assert.equal(getRaidBossSpecialAttack('mana-star', 3), 'mana-star');
  assert.equal(getRaidBossSpecialAttack('mana-star', 6), 'mana-star');
  assert.equal(getRaidBossSpecialAttack('shard-rain', 1), null);
  assert.equal(getRaidBossSpecialAttack('shard-rain', 2), 'shard-rain');
  assert.equal(getRaidBossSpecialAttack('shard-rain', 4), 'shard-rain');
  assert.equal(getRaidBossSpecialAttack('mana-curse', 3), 'mana-curse');
  assert.equal(getRaidBossSpecialAttack('mana-curse', 2), null);
  assert.equal(getRaidBossSpecialAttack('unknown', 3), null);
});

test('dungeon tank attracts seventy percent of single-target enemy attacks while alive', () => {
  const players = [{ role: 'damage' }, { role: 'tank' }, { role: 'healer' }];
  assert.equal(chooseDungeonAttackTarget(players, [0,1,2], 1, 1, () => 0.69), 1);
  assert.equal(chooseDungeonAttackTarget(players, [0,1,2], 1, 1, () => 0.7), 2);
  assert.equal(chooseDungeonAttackTarget(players, [0,2], 1, 1, () => 0), 2);
  assert.equal(chooseDungeonAttackTarget(players, [], 1, 1, () => 0), null);
});

test('raid tank attracts seventy percent of single-target attacks while alive', () => {
  const fighters = [{ role: 'damage' }, { role: 'tank' }, { role: 'healer' }];
  assert.equal(chooseRaidAttackTarget(fighters, [0, 1, 2], () => 0.69), 1);
  const values = [0.71, 0];
  let index = 0;
  assert.equal(chooseRaidAttackTarget(fighters, [0, 1, 2], () => values[index++]), 0);
  assert.equal(chooseRaidAttackTarget(fighters, [0, 2], () => 0.5), 2);
  assert.equal(chooseRaidAttackTarget(fighters, [], () => 0), null);
});

test('raid area specials hit every living teammate and respect individual defense', () => {
  const fighters = [{ username: 'A', defense: 0 }, { username: 'B', defense: 0 }, { username: 'C', defense: 20 }];
  const result = resolveRaidAreaAttack({
    hpNow: [100, 0, 100],
    livingIndices: [0, 2],
    fighters,
    rawDamage: 30,
    special: 'shard-rain',
    bossPhase: 1
  });
  assert.deepEqual(result.hits.map(hit => hit.index), [0, 2]);
  assert.deepEqual(result.hits.map(hit => hit.incoming), [15, 11]);
  assert.deepEqual(result.hpNow, [85, 0, 89]);
});

test("raid area special applies each living player's own defense and defense choice", () => {
  const fighters = [{ defense: 0 }, { defense: 20 }];
  const result = resolveRaidAreaAttack({
    hpNow: [100, 100],
    livingIndices: [0, 1],
    fighters,
    rawDamage: 30,
    special: 'mana-star',
    bossPhase: 1,
    defending: new Set([1])
  });
  assert.equal(result.hits.length, 2);
  assert.equal(result.hits[0].incoming, 20);
  assert.equal(result.hits[1].defended, true);
  assert.equal(result.hpNow[1], 93);
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

