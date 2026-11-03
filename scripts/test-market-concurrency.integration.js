import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { ensureUser, pool, withIsolatedTestSchema } from '../database/db.js';
import { buyMarketItem } from '../market.js';
import { resolveTradeOffer } from '../trade-transaction.js';
import { claimSoloBossReward, settleRaidRewards, settleDungeonRewards } from '../rpg-reward-transactions.js';

import equipmentCommand from '../ekipman.js';
import growthCommand from '../commands/rpg/gelisim.js';
import { equipmentItems, equipmentBonus } from '../equipment-data.js';
import { applyEquipmentSetBonus } from '../rpg-mechanics.js';
import storyCommand from '../hikaye.js';
import adventureCommand from '../macera.js';
import craftingCommand from '../zanaat.js';
import profileCommand from '../profil.js';
import leaderboardCommand from '../siralama.js';
import npcCommand from '../npc.js';
import characterUpgradeCommand from '../karaktergelistir.js';
import { createSiteLinkToken, redeemSiteLinkToken, getAdventurerDashboard } from '../adventurer-platform.js';

const dedicatedAuditDatabase = /^postgres(?:ql)?:\/\/postgres:postgres@localhost:5432\/frieren_audit(?:\?|$)/.test(
  process.env.DATABASE_URL || ''
);

test('concurrent market purchases cannot overspend and inventory matches successful debits', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const runId = randomUUID();
    const guildId = 'market-race-' + runId;
    const userId = 'market-race-user-' + runId;
    const itemId = 'frieren_tea';
    const itemName = '🍵 Frieren Çayı';

    await ensureUser(guildId, userId);
    await pool.query('UPDATE users SET coins=240 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => buyMarketItem(guildId, userId, itemId))
    );
    const successful = outcomes.filter(result => result.ok);
    const rejected = outcomes.filter(result => !result.ok);

    const player = await pool.query(
      'SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    const inventory = await pool.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
      [guildId, userId, itemName]
    );

    assert.equal(successful.length, 2, '240 coins must pay for exactly two 120-coin purchases');
    assert.equal(rejected.length, 6, 'the remaining six purchases must be rejected');
    assert.equal(Number(player.rows[0]?.coins), 0, 'the balance must never become negative');
    assert.equal(Number(inventory.rows[0]?.quantity), 2, 'each successful debit must create exactly one item');
  });
});

test('market inventory failure rolls back the already attempted coin debit', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const runId = randomUUID();
    const guildId = 'market-rollback-' + runId;
    const userId = 'market-rollback-user-' + runId;

    await ensureUser(guildId, userId);
    await pool.query('UPDATE users SET coins=120 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);

    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_market_rollback_fixture() RETURNS trigger AS $$
      BEGIN
        IF NEW.user_id LIKE 'market-rollback-user-%' AND NEW.item_key='🍵 Frieren Çayı' THEN
          RAISE EXCEPTION 'forced market integration rollback';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER reject_market_rollback_fixture
      BEFORE INSERT ON inventory
      FOR EACH ROW EXECUTE FUNCTION reject_market_rollback_fixture()
    `);

    try {
      await assert.rejects(
        buyMarketItem(guildId, userId, 'frieren_tea'),
        /forced market integration rollback/
      );
      const player = await pool.query(
        'SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const inventory = await pool.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
        [guildId, userId, '🍵 Frieren Çayı']
      );

      assert.equal(Number(player.rows[0]?.coins), 120, 'failed inventory write must not consume coins');
      assert.equal(inventory.rowCount, 0, 'failed purchase must not leave an inventory item');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_market_rollback_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_market_rollback_fixture()');
    }
  });
});

test.after(async () => {
  await pool.end();
});

import dailyQuestCommand from '../gunlukgorev.js';
import tradeOfferCommand from '../takasteklif.js';

function testSnowflake(prefix) {
  return prefix + String(randomInt(0, 281_474_976_710_655)).padStart(15, '0');
}

test('two concurrent daily mission claims grant the reward only once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('91');
    const userId = testSnowflake('90');
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET coins=0,last_daily_at=NOW() WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );

    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: { getString: () => 'daily' },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; },
      reply: async payload => { responses.push(payload); return payload; }
    });

    await Promise.all([
      dailyQuestCommand.execute(makeInteraction()),
      dailyQuestCommand.execute(makeInteraction())
    ]);

    const player = await pool.query(
      'SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    const claims = await pool.query(
      "SELECT mission_key FROM daily_mission_claims WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE AND mission_key='daily'",
      [guildId, userId]
    );

    assert.equal(Number(player.rows[0]?.coins), 75, 'daily reward must be credited exactly once');
    assert.equal(claims.rowCount, 1, 'the unique daily claim must have one row');
    assert.equal(responses.filter(value => typeof value === 'string' && value.includes('75 altın')).length, 1,
      'only one concurrent interaction may report a successful reward');
  });
});

test('concurrent trade offers cannot reserve the sender last character copy twice', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('91');
    const senderId = testSnowflake('90');
    const recipientId = testSnowflake('92');
    await ensureUser(guildId, senderId);
    await ensureUser(guildId, recipientId);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Frieren','Frieren','Efsanevi','🧝',10194172,'test fixture','test fixture',2)`,
      [guildId, senderId]
    );

    const replies = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: senderId, username: 'FrierenTest' },
      options: {
        getUser: () => ({ id: recipientId, bot: false }),
        getString: () => 'Frieren',
        getInteger: () => 1
      },
      reply: async payload => { replies.push(payload); return payload; }
    });

    await Promise.all([
      tradeOfferCommand.execute(makeInteraction()),
      tradeOfferCommand.execute(makeInteraction())
    ]);

    const offers = await pool.query(
      `SELECT amount,status FROM trade_offers
       WHERE guild_id=$1 AND from_user_id=$2 AND character_name='Frieren' AND status='pending'`,
      [guildId, senderId]
    );
    const collection = await pool.query(
      'SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId, senderId, 'Frieren']
    );

    assert.equal(offers.rowCount, 1, 'only one offer may reserve the available copy');
    assert.equal(Number(offers.rows[0]?.amount), 1);
    assert.equal(Number(collection.rows[0]?.quantity), 2, 'creating an offer must not transfer or consume the character');
    assert.equal(replies.length, 2, 'both concurrent interactions must receive a response');
    assert.equal(replies.filter(payload => Array.isArray(payload?.embeds)).length, 1,
      'exactly one interaction should receive a successful trade offer');
  });
});


async function acceptTradeTransaction(guildId, offerId, acceptingUserId) {
  const result = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId });
  return result.status === 'accepted';
}

test('the same trade offer can be accepted concurrently only once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), from=testSnowflake('90'), to=testSnowflake('92'), offerId=randomUUID();
    await ensureUser(guildId,from); await ensureUser(guildId,to);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Fern','Frieren','Nadir','🪄',10194172,'fixture','fixture',2)`,
      [guildId,from]
    );
    await pool.query(
      `INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
       VALUES($1,$2,$3,$4,'Fern',1,NOW()+INTERVAL '5 minutes')`,
      [offerId,guildId,from,to]
    );
    const outcomes=await Promise.all([
      acceptTradeTransaction(guildId,offerId,to),
      acceptTradeTransaction(guildId,offerId,to)
    ]);
    const source=await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Fern'",
      [guildId,from]
    );
    const target=await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Fern'",
      [guildId,to]
    );
    const offer=await pool.query('SELECT status FROM trade_offers WHERE offer_id=$1',[offerId]);
    assert.equal(outcomes.filter(Boolean).length,1,'exactly one accept operation must commit');
    assert.equal(Number(source.rows[0].quantity),1,'sender loses exactly one copy');
    assert.equal(Number(target.rows[0].quantity),1,'recipient receives exactly one copy');
    assert.equal(offer.rows[0].status,'accepted');
  });
});

test('production solo boss reward transaction grants a battle only once under concurrency', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90'), battleId=randomUUID();
    await ensureUser(guildId,userId);
    const reward=()=>claimSoloBossReward(pool,{
      guildId,userId,battleId,hp:80,mana:65,coins:250,xp:100,
      bonusLoot:'solo-fixture-bonus',craftingMaterial:'solo-fixture-material',
      journalBossKey:null,spellUsed:null
    });
    const outcomes=await Promise.all([reward(),reward()]);
    const player=await pool.query(
      'SELECT coins,xp,boss_defeats,last_boss_battle_id FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    const items=await pool.query(
      'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',
      [guildId,userId]
    );
    assert.equal(outcomes.filter(x=>x.status==='claimed').length,1);
    assert.equal(outcomes.filter(x=>x.status==='already_claimed').length,1);
    assert.equal(Number(player.rows[0].coins),250);
    assert.equal(Number(player.rows[0].xp),100);
    assert.equal(Number(player.rows[0].boss_defeats),1);
    assert.equal(player.rows[0].last_boss_battle_id,battleId);
    assert.deepEqual(Object.fromEntries(items.rows.map(x=>[x.item_key,Number(x.quantity)])),{
      'solo-fixture-bonus':1,
      'solo-fixture-material':1,
      '💎 Mana Kristali':1
    });
  });
});

test('a previously claimed solo boss battle cannot be replayed after a newer battle has settled', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90');
    const firstBattleId=randomUUID(), secondBattleId=randomUUID();
    await ensureUser(guildId,userId);
    const claim=(battleId,coins)=>claimSoloBossReward(pool,{
      guildId,userId,battleId,hp:80,mana:65,coins,xp:100,
      bonusLoot:null,craftingMaterial:null,journalBossKey:null,spellUsed:null
    });

    assert.equal((await claim(firstBattleId,100)).status,'claimed');
    assert.equal((await claim(secondBattleId,200)).status,'claimed');
    const replay=await claim(firstBattleId,100);
    const player=await pool.query(
      'SELECT coins,xp,boss_defeats,last_boss_battle_id FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );

    assert.equal(replay.status,'already_claimed','an old battle id must remain permanently consumed');
    assert.equal(Number(player.rows[0].coins),300,'replaying the first battle must not mint coins');
    assert.equal(Number(player.rows[0].xp),200,'replaying the first battle must not mint XP');
    assert.equal(Number(player.rows[0].boss_defeats),2,'replaying the first battle must not add a boss victory');
    assert.equal(player.rows[0].last_boss_battle_id,secondBattleId);
  });
});

test('production solo boss reward transaction rolls back player progression and all loot on inventory failure', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90'), battleId=randomUUID();
    await ensureUser(guildId,userId);
    await pool.query(`CREATE OR REPLACE FUNCTION reject_solo_boss_reward_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced solo boss reward failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_solo_boss_reward_fixture BEFORE INSERT ON inventory
      FOR EACH ROW EXECUTE FUNCTION reject_solo_boss_reward_fixture()`);
    try {
      await assert.rejects(claimSoloBossReward(pool,{
        guildId,userId,battleId,hp:80,mana:65,coins:250,xp:100,
        bonusLoot:null,craftingMaterial:'solo-fixture-material',journalBossKey:null,spellUsed:null
      }),/forced solo boss reward failure/);
      const player=await pool.query(
        'SELECT coins,xp,boss_defeats,last_boss_battle_id FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId,userId]
      );
      assert.equal(Number(player.rows[0].coins),0);
      assert.equal(Number(player.rows[0].xp),0);
      assert.equal(Number(player.rows[0].boss_defeats),0);
      assert.equal(player.rows[0].last_boss_battle_id,null);
      assert.equal((await pool.query('SELECT 1 FROM inventory WHERE guild_id=$1 AND user_id=$2',[guildId,userId])).rowCount,0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_solo_boss_reward_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_solo_boss_reward_fixture()');
    }
  });
});

test('production co-op boss settlement is single-use for the whole party under concurrent completion', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), ids=[testSnowflake('90'),testSnowflake('92')], encounterId=randomUUID();
    for(const id of ids) await ensureUser(guildId,id);
    await pool.query(
      `INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
       SELECT $1,user_id,$3,'raid',NOW()+INTERVAL '30 minutes' FROM unnest($2::text[]) AS user_id`,
      [guildId,ids,encounterId]
    );
    const fighters=ids.map(userId=>({userId,maxHp:100,baseMaxHp:100,mana:70,maxMana:100,baseMaxMana:100}));
    const settle=()=>settleRaidRewards(pool,{
      guildId,encounterId,ids,fighters,persistedHpNow:[80,75],persistedManaNow:[70,65],
      win:true,xpReward:200,coinReward:150,loot:'raid-fixture-loot',spellCasts:new Map()
    });
    const outcomes=await Promise.all([settle(),settle()]);
    assert.equal(outcomes.filter(x=>x.status==='settled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='reservation_missing').length,1);
    const players=await pool.query(
      'SELECT user_id,coins,xp,boss_defeats FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id',
      [guildId,ids]
    );
    assert.equal(players.rows.length,2);
    for(const p of players.rows){
      assert.equal(Number(p.coins),150);
      assert.equal(Number(p.xp),200);
      assert.equal(Number(p.boss_defeats),1);
    }
    assert.equal((await pool.query('SELECT 1 FROM inventory WHERE guild_id=$1 AND item_key=$2',[guildId,'raid-fixture-loot'])).rowCount,2);
    assert.equal((await pool.query('SELECT 1 FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2',[guildId,encounterId])).rowCount,0);
  });
});

test('production co-op boss settlement rolls back every participant when loot persistence fails', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), ids=[testSnowflake('90'),testSnowflake('92')], encounterId=randomUUID();
    for(const id of ids) await ensureUser(guildId,id);
    await pool.query(
      `INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
       SELECT $1,user_id,$3,'raid',NOW()+INTERVAL '30 minutes' FROM unnest($2::text[]) AS user_id`,
      [guildId,ids,encounterId]
    );
    await pool.query(`CREATE OR REPLACE FUNCTION reject_raid_reward_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced raid reward failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_raid_reward_fixture BEFORE INSERT ON inventory
      FOR EACH ROW WHEN (NEW.item_key='raid-fixture-fail')
      EXECUTE FUNCTION reject_raid_reward_fixture()`);
    try {
      const fighters=ids.map(userId=>({userId,maxHp:100,baseMaxHp:100,mana:70,maxMana:100,baseMaxMana:100}));
      await assert.rejects(settleRaidRewards(pool,{
        guildId,encounterId,ids,fighters,persistedHpNow:[80,75],persistedManaNow:[70,65],
        win:true,xpReward:200,coinReward:150,loot:'raid-fixture-fail',spellCasts:new Map()
      }),/forced raid reward failure/);
      const players=await pool.query(
        'SELECT coins,xp,boss_defeats FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',
        [guildId,ids]
      );
      for(const p of players.rows){
        assert.equal(Number(p.coins),0);
        assert.equal(Number(p.xp),0);
        assert.equal(Number(p.boss_defeats),0);
      }
      assert.equal((await pool.query('SELECT 1 FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2',[guildId,encounterId])).rowCount,2);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_raid_reward_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_raid_reward_fixture()');
    }
  });
});

test('production layered dungeon settlement is single-use for the whole party under concurrent completion', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), ids=[testSnowflake('90'),testSnowflake('92')], encounterId=randomUUID();
    for(const id of ids) await ensureUser(guildId,id);
    await pool.query(
      `INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
       SELECT $1,user_id,$3,'dungeon',NOW()+INTERVAL '30 minutes' FROM unnest($2::text[]) AS user_id`,
      [guildId,ids,encounterId]
    );
    const players=ids.map(user_id=>({user_id,maxHp:100,max_hp:100,mana:70,maxMana:100,max_mana:100}));
    const settle=()=>settleDungeonRewards(pool,{
      guildId,encounterId,ids,players,persistedHpNow:[80,75],persistedManaNow:[70,65],
      victory:true,totalXp:180,totalCoins:120,chestRewards:['dungeon-fixture-chest'],
      loot:'dungeon-fixture-rare',craftingLoot:'dungeon-fixture-craft',spellCasts:new Map(),journalUserId:ids[0]
    });
    const outcomes=await Promise.all([settle(),settle()]);
    assert.equal(outcomes.filter(x=>x.status==='settled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='reservation_missing').length,1);
    const saved=await pool.query(
      'SELECT user_id,coins,xp,dungeon_wins,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',
      [guildId,ids]
    );
    for(const p of saved.rows){
      assert.equal(Number(p.coins),120);
      assert.equal(Number(p.xp),180);
      assert.equal(Number(p.dungeon_wins),1);
      assert.equal(Number(p.dungeon_runs),1);
    }
    assert.equal((await pool.query('SELECT 1 FROM inventory WHERE guild_id=$1 AND item_key LIKE $2',[guildId,'dungeon-fixture-%'])).rowCount,6);
    assert.equal((await pool.query('SELECT 1 FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2',[guildId,encounterId])).rowCount,0);
    const perPlayer = await pool.query(
      'SELECT user_id,hp,mana,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id',
      [guildId,ids]
    );
    assert.equal(perPlayer.rowCount,2);
    const expected = new Map([[ids[0],{hp:80,mana:70}],[ids[1],{hp:75,mana:65}]]);
    for (const player of perPlayer.rows) {
      assert.equal(Number(player.hp),expected.get(player.user_id).hp,'each participant must retain their own combat HP');
      assert.equal(Number(player.mana),expected.get(player.user_id).mana,'each participant must retain their own combat mana');
      assert.equal(Number(player.xp),180);
      assert.equal(Number(player.level),2);
      assert.equal(Number(player.stat_points),1);
    }
    const perPlayerLoot = await pool.query(
      'SELECT user_id,item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND item_key LIKE $3 ORDER BY user_id,item_key',
      [guildId,ids,'dungeon-fixture-%']
    );
    assert.equal(perPlayerLoot.rowCount,6,'every participant receives the chest, rare loot and crafting material');
    for (const userId of ids) {
      assert.deepEqual(
        Object.fromEntries(perPlayerLoot.rows.filter(row=>row.user_id===userId).map(row=>[row.item_key,Number(row.quantity)])),
        {'dungeon-fixture-chest':1,'dungeon-fixture-craft':1,'dungeon-fixture-rare':1}
      );
    }
  });
});

test('production layered dungeon settlement rolls back all players and reservations when loot persistence fails', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), ids=[testSnowflake('90'),testSnowflake('92')], encounterId=randomUUID();
    for(const id of ids) await ensureUser(guildId,id);
    await pool.query(
      `INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
       SELECT $1,user_id,$3,'dungeon',NOW()+INTERVAL '30 minutes' FROM unnest($2::text[]) AS user_id`,
      [guildId,ids,encounterId]
    );
    await pool.query(`CREATE OR REPLACE FUNCTION reject_dungeon_reward_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced dungeon reward failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_dungeon_reward_fixture BEFORE INSERT ON inventory
      FOR EACH ROW WHEN (NEW.item_key='dungeon-fixture-fail')
      EXECUTE FUNCTION reject_dungeon_reward_fixture()`);
    try {
      const players=ids.map(user_id=>({user_id,maxHp:100,max_hp:100,mana:70,maxMana:100,max_mana:100}));
      await assert.rejects(settleDungeonRewards(pool,{
        guildId,encounterId,ids,players,persistedHpNow:[80,75],persistedManaNow:[70,65],
        victory:true,totalXp:180,totalCoins:120,chestRewards:['dungeon-fixture-fail'],
        loot:null,craftingLoot:null,spellCasts:new Map(),journalUserId:ids[0]
      }),/forced dungeon reward failure/);
      const saved=await pool.query(
        'SELECT coins,xp,dungeon_wins,dungeon_runs FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',
        [guildId,ids]
      );
      for(const p of saved.rows){
        assert.equal(Number(p.coins),0);
        assert.equal(Number(p.xp),0);
        assert.equal(Number(p.dungeon_wins),0);
        assert.equal(Number(p.dungeon_runs),0);
      }
      assert.equal((await pool.query('SELECT 1 FROM active_rpg_encounters WHERE guild_id=$1 AND encounter_id=$2',[guildId,encounterId])).rowCount,2);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_dungeon_reward_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_dungeon_reward_fixture()');
    }
  });
});


test('overlapping co-op encounters cannot reserve the same player twice', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90');
    await ensureUser(guildId,userId);
    const reserve=async encounterId=>{
      const db=await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query(
          `INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
           VALUES($1,$2,$3,'raid',NOW()+INTERVAL '30 minutes')`,
          [guildId,userId,encounterId]
        );
        await db.query('COMMIT');
        return true;
      } catch(error) {
        await db.query('ROLLBACK').catch(()=>{});
        if(error.code==='23505') return false;
        throw error;
      } finally { db.release(); }
    };
    const outcomes=await Promise.all([reserve(randomUUID()),reserve(randomUUID())]);
    const active=await pool.query(
      'SELECT encounter_id FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.equal(outcomes.filter(Boolean).length,1,'one player can belong to only one active encounter');
    assert.equal(active.rowCount,1);
  });
});


test('trade transfer failure rolls back both collection sides and offer status', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), from=testSnowflake('90'), to=testSnowflake('92'), offerId=randomUUID();
    await ensureUser(guildId,from); await ensureUser(guildId,to);
    await pool.query(`INSERT INTO anime_character_collection
      (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
      VALUES($1,$2,'Stark','Frieren','Nadir','🪓',10194172,'fixture','fixture',2)`,[guildId,from]);
    await pool.query(`INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
      VALUES($1,$2,$3,$4,'Stark',1,NOW()+INTERVAL '5 minutes')`,[offerId,guildId,from,to]);
    await pool.query(`CREATE OR REPLACE FUNCTION reject_trade_recipient_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced trade recipient failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_trade_recipient_fixture BEFORE INSERT ON anime_character_collection
      FOR EACH ROW EXECUTE FUNCTION reject_trade_recipient_fixture()`);
    try {
      await assert.rejects(acceptTradeTransaction(guildId,offerId,to),/forced trade recipient failure/);
      const source=await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",[guildId,from]);
      const target=await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",[guildId,to]);
      const offer=await pool.query('SELECT status FROM trade_offers WHERE offer_id=$1',[offerId]);
      assert.equal(Number(source.rows[0].quantity),2);
      assert.equal(target.rowCount,0);
      assert.equal(offer.rows[0].status,'pending');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_trade_recipient_fixture ON anime_character_collection');
      await pool.query('DROP FUNCTION IF EXISTS reject_trade_recipient_fixture()');
    }
  });
});

test('co-op settlement failure rolls back all player rewards atomically', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), a=testSnowflake('90'), b=testSnowflake('92'), encounterId=randomUUID();
    await ensureUser(guildId,a); await ensureUser(guildId,b);
    await pool.query("UPDATE users SET coins=10,xp=20,boss_defeats=0 WHERE guild_id=$1 AND user_id=ANY($2::text[])",[guildId,[a,b]]);
    for(const userId of [a,b]) await pool.query(`INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at)
      VALUES($1,$2,$3,'raid',NOW()+INTERVAL '30 minutes')`,[guildId,userId,encounterId]);
    await pool.query(`CREATE OR REPLACE FUNCTION reject_party_reward_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced co-op reward failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_party_reward_fixture BEFORE INSERT ON inventory
      FOR EACH ROW EXECUTE FUNCTION reject_party_reward_fixture()`);
    try {
      const db=await pool.connect();
      try {
        await db.query('BEGIN');
        const ids=[a,b].sort();
        const players=await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',[guildId,ids]);
        const reservations=await db.query("SELECT user_id FROM active_rpg_encounters WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND encounter_id=$3 AND encounter_type='raid' AND expires_at>NOW() FOR UPDATE",[guildId,ids,encounterId]);
        assert.equal(players.rowCount,2); assert.equal(reservations.rowCount,2);
        await db.query('UPDATE users SET coins=coins+100,xp=xp+50,boss_defeats=boss_defeats+1 WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,ids]);
        await db.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'party_fixture',1)",[guildId,a]);
        assert.fail('expected forced inventory failure');
      } catch(error) {
        await db.query('ROLLBACK').catch(()=>{});
        assert.match(error.message,/forced co-op reward failure/);
      } finally { db.release(); }
      const players=await pool.query('SELECT coins,xp,boss_defeats FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[a,b]]);
      assert.equal(players.rowCount,2);
      for(const player of players.rows) {
        assert.equal(Number(player.coins),10); assert.equal(Number(player.xp),20); assert.equal(Number(player.boss_defeats),0);
      }
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_party_reward_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_party_reward_fixture()');
    }
  });
});


test('real equipment command persists slots, derives set bonuses and never overwrites base HP or mana caps', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90');
    await ensureUser(guildId,userId);
    await pool.query(
      'UPDATE users SET level=50,hp=115,max_hp=120,mana=80,max_mana=90 WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    const blade=equipmentItems.find(item=>item.id==='demon_blade');
    const armor=equipmentItems.find(item=>item.id==='demon_armor');
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1),($1,$2,$4,1)',
      [guildId,userId,blade.name,armor.name]
    );
    const invoke=async (action,itemId=null,slot=null) => {
      const replies=[];
      const values={islem:action,esya:itemId,yuva:slot};
      await equipmentCommand.execute({
        guildId,user:{id:userId,username:'EquipmentIntegration'},
        options:{getString:key=>values[key]},
        reply:async payload=>{replies.push(payload);return payload;}
      });
      return replies;
    };

    await invoke('equip','demon_blade');
    await invoke('equip','demon_armor');
    const equipped=await pool.query(
      'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',
      [guildId,userId]
    );
    assert.equal(equipped.rowCount,2);
    const persistedItems=equipped.rows.map(row=>equipmentItems.find(item=>item.name===row.item_key));
    const activeSet=applyEquipmentSetBonus(persistedItems,equipmentBonus(persistedItems));
    assert.equal(activeSet.attack,20);
    assert.equal(activeSet.hp,85);
    assert.equal(activeSet.setText,'Efsanevi set: +4 saldırı, +25 HP');

    let player=await pool.query(
      'SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.deepEqual(player.rows[0],{hp:115,max_hp:120,mana:80,max_mana:90},
      'equipping must not write temporary equipment bonuses into persistent base caps');

    await invoke('unequip',null,'armor');
    const remaining=await pool.query(
      'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    const remainingItems=remaining.rows.map(row=>equipmentItems.find(item=>item.name===row.item_key));
    const inactiveSet=applyEquipmentSetBonus(remainingItems,equipmentBonus(remainingItems));
    assert.equal(inactiveSet.attack,16);
    assert.equal(inactiveSet.hp,0);
    assert.equal(inactiveSet.setText,null);
    player=await pool.query(
      'SELECT hp,max_hp,mana,max_mana FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.deepEqual(player.rows[0],{hp:115,max_hp:120,mana:80,max_mana:90},
      'unequipping must restore the base cap without permanently changing base stats');
  });
});

test('real character growth command serializes point spending and enforces stat caps', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90');
    await ensureUser(guildId,userId);
    await pool.query(
      'UPDATE users SET stat_points=1,attack=10 WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    const invoke=async () => {
      const replies=[];
      await growthCommand.execute({
        guildId,user:{id:userId},
        options:{getString:()=> 'attack',getInteger:()=>1},
        reply:async payload=>{replies.push(payload);return payload;}
      });
      return replies;
    };
    const outcomes=await Promise.all([invoke(),invoke()]);
    const saved=await pool.query(
      'SELECT stat_points,attack FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.deepEqual(saved.rows[0],{stat_points:0,attack:12},
      'two simultaneous requests cannot spend the same development point twice');
    assert.equal(outcomes.flat().length,2,'both command interactions receive a response');

    await pool.query(
      'UPDATE users SET stat_points=1,attack=500 WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    await invoke();
    const capped=await pool.query(
      'SELECT stat_points,attack FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.deepEqual(capped.rows[0],{stat_points:1,attack:500},
      'a rejected cap overflow must not consume development points');
  });
});


test('story choices persist all three path requirements, chapter rewards and unique endings exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const paths = [
      { key: 'cesaret', gate: async (guildId,userId) => pool.query(
        'UPDATE users SET boss_defeats=1 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      ), bonusCoins: 100, bonusXp: 40, ending: 'Cesaretin Mührü' },
      { key: 'merhamet', gate: async (guildId,userId) => pool.query(
        'UPDATE users SET items_used_count=1 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      ), bonusCoins: 120, bonusXp: 50, ending: 'Merhametin Mührü' },
      { key: 'merak', gate: async (guildId,userId) => pool.query(
        "INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'heilen') ON CONFLICT DO NOTHING",[guildId,userId]
      ), bonusCoins: 90, bonusXp: 60, ending: 'Bilginin Mührü' }
    ];

    for (const path of paths) {
      const guildId='story-'+randomUUID(), userId='story-user-'+randomUUID();
      await ensureUser(guildId,userId);
      const invoke=async decision=>{
        const replies=[];
        await storyCommand.execute({
          guildId,user:{id:userId,username:'StoryIntegration'},
          options:{getString:()=>decision ?? null},
          deferReply:async()=>{},
          editReply:async payload=>{replies.push(payload);return payload;}
        });
        return replies;
      };

      await invoke(path.key);
      let state=await pool.query(
        'SELECT current_chapter,choices FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      assert.equal(Number(state.rows[0]?.current_chapter),1, path.key+' must persist the initial path');
      let player=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.deepEqual(player.rows[0],{coins:50,xp:25});

      const blocked=await invoke(path.key);
      state=await pool.query('SELECT current_chapter FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      player=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.equal(Number(state.rows[0].current_chapter),1,'path gate must block chapter advancement');
      assert.deepEqual(player.rows[0],{coins:50,xp:25},'blocked chapter must not grant rewards');
      assert.ok(String(blocked[0] || '').includes('henüz tamamlanmadı'));

      await path.gate(guildId,userId);
      await invoke(path.key);
      await pool.query('UPDATE users SET exploration_count=2 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      await invoke(path.key);
      await pool.query('UPDATE users SET xp=900,level=3 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      await invoke(path.key);
      const finalReply=await invoke(path.key);

      state=await pool.query(
        'SELECT current_chapter,choices FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      player=await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.equal(Number(state.rows[0].current_chapter),5,'all five story chapters must be completed');
      assert.deepEqual(state.rows[0].choices,[path.key,path.key,path.key,path.key,path.key]);
      assert.equal(Number(player.rows[0].coins),920+path.bonusCoins*4,'all chapter rewards and level-scaled ending coins must persist');
      assert.equal(Number(player.rows[0].xp),1175+path.bonusXp*4,'chapter XP and level-scaled ending XP must persist');
      assert.equal(Number(player.rows[0].level),4);
      assert.ok(String(finalReply[0] || '').includes(path.ending),'the selected path must produce its matching ending');

      await invoke(path.key);
      const afterReplay=await pool.query(
        'SELECT current_chapter FROM story_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      const afterReplayPlayer=await pool.query(
        'SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      assert.equal(Number(afterReplay.rows[0].current_chapter),5,'completed story must remain completed');
      assert.deepEqual(afterReplayPlayer.rows[0],{coins:920+path.bonusCoins*4,xp:1175+path.bonusXp*4},
        'replaying a completed story must not grant duplicate rewards');
    }
  });
});


test('five real adventure map fragments atomically create one treasure chest and persist rewards', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId='map-'+randomUUID(), userId='map-user-'+randomUUID();
    await ensureUser(guildId,userId);
    const originalRandom=Math.random;
    const replies=[];
    try {
      Math.random=()=>0;
      for(let index=0;index<5;index+=1) {
        await adventureCommand.execute({
          guildId,user:{id:userId,username:'MapIntegration'},
          options:{getString:()=> 'forest-grimoire'},
          reply:async payload=>{replies.push(payload);return payload;}
        });
        await pool.query('UPDATE users SET last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      }
    } finally {
      Math.random=originalRandom;
    }

    const progress=await pool.query(
      'SELECT fragments,treasures_opened FROM adventure_treasure_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    const inventory=await pool.query(
      'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
      [guildId,userId,['🧩 Kadim Harita Parçası','🗝️ Kadim Hazine Sandığı']]
    );
    const history=await pool.query(
      'SELECT COUNT(*)::int AS count,BOOL_OR(item_found LIKE $3) AS chest_recorded FROM adventure_history WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId,'%Kadim Hazine Sandığı%']
    );
    const player=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    const items=Object.fromEntries(inventory.rows.map(row=>[row.item_key,Number(row.quantity)]));
    assert.equal(Number(progress.rows[0]?.fragments),0,'five fragments must reset fragment progress');
    assert.equal(Number(progress.rows[0]?.treasures_opened),1,'exactly one map reward must be opened');
    assert.equal(items['🧩 Kadim Harita Parçası'],5,'each adventure must persist one fragment');
    assert.equal(items['🗝️ Kadim Hazine Sandığı'],1,'the completed map must create one chest');
    assert.equal(Number(history.rows[0]?.count),5,'all five adventures must be journaled');
    assert.equal(history.rows[0]?.chest_recorded,true,'the chest must be recorded in the adventure history');
    assert.ok(Number(player.rows[0]?.coins)>=225 && Number(player.rows[0]?.xp)>=205,
      'adventure and completed-map rewards must be persisted');
    assert.equal(replies.length,5);
  });
});


test('real crafting output can be equipped and an insufficient-material retry leaves all progress unchanged', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId='craft-chain-'+randomUUID(), userId='craft-user-'+randomUUID();
    await ensureUser(guildId,userId);
    const sword=equipmentItems.find(item=>item.id==='iron_sword');
    assert.ok(sword,'iron_sword recipe must resolve to a real equipment definition');
    await pool.query('UPDATE users SET level=100 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1),($1,$2,$4,1)',
      [guildId,userId,'💎 Mana Kristali','🥐 Büyülü Poğaça Kutusu']
    );

    const craft=async()=>{
      const replies=[];
      await craftingCommand.execute({
        guildId,user:{id:userId,username:'CraftIntegration'},
        options:{getString:key=>key==='tarif'?'iron_sword':null,getInteger:key=>key==='adet'?1:null},
        deferReply:async()=>{},
        editReply:async payload=>{replies.push(payload);return payload;}
      });
      return replies;
    };
    await craft();
    let materials=await pool.query(
      'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
      [guildId,userId,['💎 Mana Kristali','🥐 Büyülü Poğaça Kutusu']]
    );
    let output=await pool.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,userId,sword.name]
    );
    let profession=await pool.query(
      'SELECT xp,level,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    let daily=await pool.query(
      'SELECT crafted_items FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',[guildId,userId]
    );
    assert.equal(materials.rowCount,0,'successful craft must consume every recipe material');
    assert.equal(Number(output.rows[0]?.quantity),1,'successful craft must create one real equipment item');
    assert.equal(Number(profession.rows[0]?.successful_crafts),1,'crafting mastery must count the produced item');
    assert.equal(Number(daily.rows[0]?.crafted_items),1,'daily crafting progress must track the same output count');

    const equipReplies=[];
    await equipmentCommand.execute({
      guildId,user:{id:userId,username:'CraftIntegration'},
      options:{getString:key=>({islem:'equip',esya:'iron_sword',yuva:null})[key] ?? null},
      reply:async payload=>{equipReplies.push(payload);return payload;}
    });
    const equipped=await pool.query(
      'SELECT item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    output=await pool.query(
      'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,userId,sword.name]
    );
    assert.equal(equipped.rowCount,1,'crafted equipment must be accepted by the real equipment command');
    assert.equal(equipped.rows[0].item_key,sword.name);
    assert.equal(Number(output.rows[0]?.quantity),1,'equipped equipment remains in inventory so the player can re-equip it after removing it');

    const before=await pool.query(
      'SELECT xp,level,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    const failedReply=await craft();
    const after=await pool.query(
      'SELECT xp,level,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    assert.deepEqual(after.rows[0],before.rows[0],'failed craft must not advance profession XP or successful craft count');
    assert.ok(String(failedReply[0] || '').includes('malzemen yetmiyor'),'missing materials must produce a clear rejection');
    assert.equal(equipReplies.length,1);
  });
});


test('real player profile and collection leaderboard read the selected guild member without leaking caller state', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId='profile-rank-'+randomUUID();
    const caller='profile-caller-'+randomUUID(), target='profile-target-'+randomUUID(), other='profile-other-'+randomUUID();
    for(const userId of [caller,target,other]) await ensureUser(guildId,userId);
    await pool.query(
      'UPDATE users SET coins=10,xp=100,level=2 WHERE guild_id=$1 AND user_id=$2',
      [guildId,caller]
    );
    await pool.query(
      'UPDATE users SET coins=900,xp=900,level=3,attack=24 WHERE guild_id=$1 AND user_id=$2',
      [guildId,target]
    );
    await pool.query(
      'INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity) VALUES($1,$2,\'Frieren\',\'Frieren\',\'Efsanevi\',\'🧙\',10194172,\'fixture\',\'fixture\',1),($1,$2,\'Fern\',\'Frieren\',\'Nadir\',\'🪄\',10194172,\'fixture\',\'fixture\',1),($1,$3,\'Stark\',\'Frieren\',\'Nadir\',\'🪓\',10194172,\'fixture\',\'fixture\',1)',
      [guildId,target,other]
    );

    const profileReplies=[];
    await profileCommand.execute({
      guildId,
      user:{id:caller,username:'Caller'},
      options:{getUser:()=>({id:target,username:'Target',displayAvatarURL:()=> 'https://example.invalid/avatar.png'})},
      reply:async payload=>{profileReplies.push(payload);return payload;}
    });
    const profileEmbed=profileReplies[0]?.embeds?.[0]?.toJSON?.() ?? profileReplies[0]?.embeds?.[0];
    assert.ok(profileEmbed?.title?.includes('Target'),'profile must render the selected target member');
    assert.ok(profileEmbed?.fields?.some(field=>field.name.includes('Poğaça altını') && field.value==='900'),
      'profile must show the target member balance, not the caller balance');
    assert.ok(profileEmbed?.fields?.some(field=>field.name.includes('Saldırı') && field.value==='24'),
      'profile must show target combat stats');

    const rankingReplies=[];
    await leaderboardCommand.execute({
      guildId,user:{id:caller,username:'Caller'},
      options:{getString:()=> 'collection'},
      deferReply:async()=>{},
      editReply:async payload=>{rankingReplies.push(payload);return payload;}
    });
    const rankingEmbed=rankingReplies[0]?.embeds?.[0]?.toJSON?.() ?? rankingReplies[0]?.embeds?.[0];
    assert.ok(rankingEmbed?.description?.indexOf('<@'+target+'>') < rankingEmbed?.description?.indexOf('<@'+other+'>'),
      'collection leaderboard must rank the member with two unique characters above the member with one');
    assert.ok(rankingEmbed?.fields?.some(field=>field.name==='Senin sıran' && field.value.startsWith('#3')),
      'caller rank must be calculated within the same guild and collection category');
  });
});


test('NPC side quest rewards flow into the linked web dashboard exactly once for all three story paths', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const cases = [
      { npc:'frieren', path:'merak', quest:'frieren_relics', coins:260, xp:100,
        prepare:async(guildId,userId)=>pool.query(
          "INSERT INTO learned_spells(guild_id,user_id,spell_key) VALUES($1,$2,'heilen'),($1,$2,'alev_kuresi')",
          [guildId,userId]
        ) },
      { npc:'fern', path:'merhamet', quest:'fern_supplies', coins:220, xp:110,
        prepare:async(guildId,userId)=>pool.query(
          'UPDATE users SET items_used_count=3 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
        ) },
      { npc:'stark', path:'cesaret', quest:'stark_demon_hunt', coins:280, xp:120,
        prepare:async(guildId,userId)=>pool.query(
          'UPDATE users SET boss_defeats=2 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
        ) }
    ];

    for (const entry of cases) {
      const guildId=testSnowflake('91'), userId=testSnowflake('90');
      await ensureUser(guildId,userId);
      await pool.query(
        'UPDATE users SET coins=10,xp=80,level=1 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      await pool.query(
        'INSERT INTO story_progress(guild_id,user_id,current_chapter,choices) VALUES($1,$2,1,$3::jsonb)',
        [guildId,userId,JSON.stringify([entry.path])]
      );
      const invoke=async (npc,action)=>{
        const replies=[];
        await npcCommand.execute({
          guildId,user:{id:userId,username:'QuestDashboardIntegration'},
          options:{getString:key=>key==='karakter'?npc:action},
          deferReply:async()=>{},
          editReply:async payload=>{replies.push(payload);return payload;}
        });
        return replies;
      };

      const wrongNpc=entry.npc==='frieren'?'fern':'frieren';
      const blockedPath=await invoke(wrongNpc,'teslim');
      assert.ok(String(blockedPath[0]||'').includes('Senin seçtiğin'));
      let player=await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.deepEqual(player.rows[0],{coins:10,xp:80,level:1},'wrong story path cannot grant another NPC reward');

      const notReady=await invoke(entry.npc,'teslim');
      assert.ok(String(notReady[0]||'').includes('henüz tamamlanmadı'));
      player=await pool.query('SELECT coins,xp,level FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.deepEqual(player.rows[0],{coins:10,xp:80,level:1},'incomplete quest cannot grant coins or XP');

      await invoke(entry.npc,'gorev');
      await entry.prepare(guildId,userId);
      const completed=await invoke(entry.npc,'teslim');
      assert.ok(String(completed[0]||'').includes(entry.coins+' altın'));
      player=await pool.query(
        'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
      );
      assert.deepEqual(player.rows[0],{
        coins:10+entry.coins,xp:80+entry.xp,level:2,stat_points:1
      },'quest reward, level-up and development point must be persisted together');

      const accountId='site_'+randomUUID();
      const {token}=await createSiteLinkToken(pool,{guildId,userId});
      assert.equal((await redeemSiteLinkToken(pool,accountId,token)).status,'linked');
      let dashboard=await getAdventurerDashboard(pool,accountId);
      assert.equal(dashboard.profiles.length,1);
      assert.equal(Number(dashboard.profiles[0].coins),10+entry.coins);
      assert.equal(Number(dashboard.profiles[0].xp),80+entry.xp);
      assert.equal(Number(dashboard.profiles[0].level),2);

      const duplicate=await invoke(entry.npc,'teslim');
      assert.ok(String(duplicate[0]||'').includes('zaten tamamladın'));
      player=await pool.query('SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
      assert.deepEqual(player.rows[0],{
        coins:10+entry.coins,xp:80+entry.xp,level:2,stat_points:1
      },'duplicate claim must not change any reward field');
      dashboard=await getAdventurerDashboard(pool,accountId);
      assert.equal(Number(dashboard.profiles[0].coins),10+entry.coins);
      assert.equal(Number(dashboard.profiles[0].xp),80+entry.xp);
    }
  });
});

test('character collection upgrades serialize gold spending, enforce +10 cap and expose combat bonus level', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90');
    await ensureUser(guildId,userId);
    await pool.query('UPDATE users SET coins=1000 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Frieren','Frieren','Efsanevi','🧝',10194172,'fixture','fixture',2)`,
      [guildId,userId]
    );
    const upgrade=async(doUpgrade=true)=>{
      const replies=[];
      await characterUpgradeCommand.execute({
        guildId,user:{id:userId},
        options:{getString:()=> 'Frieren',getBoolean:()=>doUpgrade},
        deferReply:async()=>{},
        editReply:async payload=>{replies.push(payload);return payload;}
      });
      return replies;
    };

    await Promise.all([upgrade(),upgrade()]);
    let saved=await pool.query(
      'SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]
    );
    let level=await pool.query(
      'SELECT upgrade_level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId,userId,'Frieren']
    );
    assert.equal(Number(saved.rows[0].coins),250,'+1 and +2 upgrades must charge 250 and 500 exactly once each');
    assert.equal(Number(level.rows[0].upgrade_level),2);
    const combatLevel=await pool.query(
      'SELECT COALESCE(MAX(upgrade_level),0)::int AS level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.equal(Number(combatLevel.rows[0].level)*2,4,'persisted character upgrade level must yield the documented combat damage bonus');

    await pool.query(
      'UPDATE character_upgrades SET upgrade_level=10 WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId,userId,'Frieren']
    );
    await pool.query('UPDATE users SET coins=10000 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    const capped=await upgrade();
    assert.ok(String(capped[0]||'').includes('en yüksek +10'));
    saved=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    level=await pool.query(
      'SELECT upgrade_level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId,userId,'Frieren']
    );
    assert.equal(Number(saved.rows[0].coins),10000,'capped upgrade must not charge gold');
    assert.equal(Number(level.rows[0].upgrade_level),10);
  });
});
