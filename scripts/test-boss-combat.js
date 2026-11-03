import test from 'node:test';
import { claimSoloBossReward } from '../rpg-reward-transactions.js';
import assert from 'node:assert/strict';
import {
  RAID_BOSSES,
  progressionMilestone,
  getSpellMasteryAwakening,
  shouldGuaranteeRareDiscovery,
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
  assert.match(rewards, /INSERT INTO rpg_reward_claims/);
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
  assert.ok(rewards.includes('ON CONFLICT (guild_id,user_id,reward_type,reward_id) DO NOTHING'));
  assert.ok(rewards.includes("return { status: 'already_claimed' }"));
  assert.match(schema, /last_boss_battle_id TEXT/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS rpg_reward_claims/);
  assert.match(schema, /PRIMARY KEY \(guild_id,user_id,reward_type,reward_id\)/);
  assert.match(schema, /SELECT guild_id,user_id,'solo_boss',last_boss_battle_id/);
});



test('solo boss reward claims reject an old battle id after a newer battle has been rewarded', async () => {
  const claimed = new Set();
  const state = {
    lastBattleId: null,
    coins: 0,
    xp: 0,
    bossDefeats: 0,
    inventory: new Map()
  };
  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (/INSERT INTO rpg_reward_claims/.test(sql)) {
        const key = values.slice(0, 3).join(':');
        if (claimed.has(key)) return { rowCount: 0, rows: [] };
        claimed.add(key);
        return { rowCount: 1, rows: [{ battle_id: values[2] }] };
      }
      if (/UPDATE users SET/.test(sql)) {
        const battleId = values[6];
        if (/last_boss_battle_id IS DISTINCT FROM/.test(sql) && state.lastBattleId === battleId) {
          return { rowCount: 0, rows: [] };
        }
        state.lastBattleId = battleId;
        state.coins += Number(values[4]);
        state.xp += Number(values[5]);
        state.bossDefeats += 1;
        return { rowCount: 1, rows: [{ user_id: values[1] }] };
      }
      if (/INSERT INTO inventory/.test(sql)) {
        const key = values[2];
        state.inventory.set(key, (state.inventory.get(key) || 0) + 1);
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Unexpected SQL in boss reward test: ' + sql);
    },
    release() {}
  };
  const pool = { async connect() { return client; } };
  const claim = battleId => claimSoloBossReward(pool, {
    guildId: 'guild-1',
    userId: 'user-1',
    battleId,
    hp: 100,
    mana: 80,
    coins: 10,
    xp: 20,
    bonusLoot: null,
    craftingMaterial: 'iron-shard',
    journalBossKey: null,
    spellUsed: null
  });

  assert.equal((await claim('battle-A')).status, 'claimed');
  assert.equal((await claim('battle-B')).status, 'claimed');
  assert.equal((await claim('battle-A')).status, 'already_claimed');
  assert.deepEqual(
    { coins: state.coins, xp: state.xp, bossDefeats: state.bossDefeats },
    { coins: 20, xp: 40, bossDefeats: 2 }
  );
  assert.equal(state.inventory.get('💎 Mana Kristali'), 2);
  assert.equal(state.inventory.get('iron-shard'), 2);
});

test('progression milestones unlock once at their exact level and victory thresholds', () => {
  assert.deepEqual(progressionMilestone(9,4,4),[]);
  assert.deepEqual(progressionMilestone(10,4,4),['Kıdemli Maceracı']);
  assert.deepEqual(progressionMilestone(25,5,5),['Kıdemli Maceracı','Kıdemli Büyücü','İblis Avcısı','Zindan Kaşifi']);
  assert.ok(progressionMilestone(25,10,10).includes('Kuzeyin Efsanesi'));
  assert.equal(new Set(progressionMilestone(25,10,10)).size,5);
});

test('all eight mastery-10 spell awakenings apply only at the mastery cap', () => {
  const expected = {
    zoltraak:{damage:8}, alev_kuresi:{damage:10}, buz_mizragi:{freezeChance:0.1},
    koruyucu_bariyer:{shieldReduction:0.05}, sifa_isigi:{healing:10},
    yildirim_zinciri:{damage:12}, tas_duvar:{wallReduction:0.05}, mana_patlamasi:{damage:15}
  };
  for (const [spell,perk] of Object.entries(expected)) {
    assert.deepEqual(getSpellMasteryAwakening(spell,9),{damage:0,freezeChance:0,shieldReduction:0,healing:0,wallReduction:0});
    assert.deepEqual(getSpellMasteryAwakening(spell,10),{damage:0,freezeChance:0,shieldReduction:0,healing:0,wallReduction:0,...perk});
  }
  assert.deepEqual(getSpellMasteryAwakening('unknown',10),{damage:0,freezeChance:0,shieldReduction:0,healing:0,wallReduction:0});
});

test('rare discovery pity guarantees the next undiscovered location at each 20-adventure boundary', () => {
  assert.equal(shouldGuaranteeRareDiscovery(18,0),false);
  assert.equal(shouldGuaranteeRareDiscovery(19,0),true);
  assert.equal(shouldGuaranteeRareDiscovery(39,1),true);
  assert.equal(shouldGuaranteeRareDiscovery(59,2),true);
  assert.equal(shouldGuaranteeRareDiscovery(79,3),false);
  assert.equal(shouldGuaranteeRareDiscovery(100,3),false);
});

test('raid boss special attacks use their distinct turn cadence and mana curse drains mana', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  assert.match(source, /BOSS\.special === 'mana-star' && rounds % 3 === 0/);
  assert.match(source, /BOSS\.special === 'shard-rain' && rounds % 2 === 0/);
  assert.match(source, /BOSS\.special === 'mana-curse' && rounds % 3 === 0/);
  assert.match(source, /if \(starburst \|\| shardRain\)/);
  assert.match(source, /if \(manaCurse\)\s*\{\s*const drained=Math\.min\(target\.mana,8\);\s*target\.mana-=drained;/);
  assert.match(source, /bossPhaseSpecialBonus\(bossPhase\)/);
});

test('co-op raid and final dungeon boss announce phase two at two-thirds HP and final phase at one-third HP', async () => {
  const fs = await import('node:fs/promises');
  const raid = await fs.readFile(new URL('../ortakboss.js', import.meta.url), 'utf8');
  const dungeon = await fs.readFile(new URL('../katlizindan.js', import.meta.url), 'utf8');
  assert.match(raid, /getBossPhase\(bossHp, maxBossHp\)/);
  assert.match(raid, /currentPhase === 2[\s\S]{0,220}ikinci evreye geçti/);
  assert.match(raid, /son evreye geçti[\s\S]{0,100}özel hamleleri de sertleşti/);
  assert.match(dungeon, /getBossPhase\(enemyHp, maxEnemyHp\)/);
  assert.match(dungeon, /currentPhase === 2[\s\S]{0,220}ikinci evreye geçti/);
  assert.match(dungeon, /son evreye geçti[\s\S]{0,100}özel saldırıları sertleşti/);
  assert.equal(getBossPhase(67,100),1);
  assert.equal(getBossPhase(66,100),2);
  assert.equal(getBossPhase(34,100),2);
  assert.equal(getBossPhase(33,100),3);
});

test('solo boss ice freeze cancels the scheduled special attack and mana drain', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../iblisavasi.js', import.meta.url), 'utf8');
  assert.match(source, /if \(turnCount % 3 === 0 && !frozenBoss\)/);
  assert.match(source, /if \(boss\.specialType === 'drain'\)/);
  assert.match(source, /else if \(turnCount % 3 === 0 && frozenBoss\)/);
  assert.match(source, /if \(frozenBoss\) bossDamage = 0/);
  const freezeBranch = source.slice(source.indexOf("else if (turnCount % 3 === 0 && frozenBoss)"), source.indexOf("if (frozenBoss) bossDamage = 0"));
  assert.doesNotMatch(freezeBranch, /drainedMana|playerMana\s*-=|specialDamage/);
});
