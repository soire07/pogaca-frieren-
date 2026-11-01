import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { ensureUser, pool, withIsolatedTestSchema } from '../database/db.js';
import { buyMarketItem } from '../market.js';
import { resolveTradeOffer } from '../trade-transaction.js';
import { claimSoloBossReward, settleRaidRewards, settleDungeonRewards } from '../rpg-reward-transactions.js';

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
    await assert.rejects(acceptTradeTransaction(guildId,offerId,to),/forced trade recipient failure/);
    const source=await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",[guildId,from]);
    const target=await pool.query("SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",[guildId,to]);
    const offer=await pool.query('SELECT status FROM trade_offers WHERE offer_id=$1',[offerId]);
    assert.equal(Number(source.rows[0].quantity),2);
    assert.equal(target.rowCount,0);
    assert.equal(offer.rows[0].status,'pending');
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
  });
});
