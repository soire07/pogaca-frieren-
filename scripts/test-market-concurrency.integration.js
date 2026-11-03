import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { initDatabase, ensureUser, pool, withIsolatedTestSchema } from '../database/db.js';
import { buyMarketItem } from '../market.js';
import { resolveTradeOffer } from '../trade-transaction.js';
import { claimSoloBossReward, settleRaidRewards, settleDungeonRewards } from '../rpg-reward-transactions.js';
import achievementCommand from '../basarimlar.js';
import craftingMissionCommand from '../zanaatgorevi.js';
import leaderboardCommand from '../liderlik.js';
import explorationLeaderboardCommand from '../kesifliderligi.js';
import craftingCommand from '../zanaat.js';
import salvageCommand from '../ekipmanparcala.js';
import equipmentCommand from '../ekipman.js';
import collectionCommand from '../koleksiyon.js';
import useItemCommand from '../esyakullan.js';
import { equipmentItems } from '../equipment-data.js';
import questChainCommand from '../gorevzinciri.js';
import characterUpgradeCommand from '../karaktergelistir.js';
import profileCommand from '../profil.js';
import adventureCommand from '../macera.js';
import { ADVENTURE_DISCOVERIES, COMPLETE_ADVENTURE_JOURNAL_REWARD } from '../adventure-data.js';
import treasureCommand from '../hazineac.js';

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

test('viewing another player profile reads the selected guild-scoped record without mutation', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'profile-view-' + randomUUID();
    const foreignGuildId = 'profile-foreign-' + randomUUID();
    const viewerId = testSnowflake('95');
    const targetId = testSnowflake('96');
    const targetUser = {
      id: targetId,
      username: 'ProfileTarget',
      displayAvatarURL: () => 'https://example.com/profile-target.png'
    };

    await ensureUser(guildId, targetId);
    await ensureUser(foreignGuildId, targetId);
    await pool.query(
      "UPDATE users SET level=18,xp=1700,coins=765,class_name='Büyücü',hp=80,max_hp=120,mana=60,max_mana=90,attack=30,defense=12 WHERE guild_id=$1 AND user_id=$2",
      [guildId, targetId]
    );
    await pool.query(
      "UPDATE users SET level=3,xp=25,coins=1 WHERE guild_id=$1 AND user_id=$2",
      [foreignGuildId, targetId]
    );

    const before = await pool.query(
      'SELECT level,xp,coins,hp,max_hp,mana,max_mana,attack,defense FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, targetId]
    );
    const responses = [];
    await profileCommand.execute({
      guildId,
      user: { id: viewerId, username: 'ProfileViewer' },
      options: { getUser: name => name === 'kullanici' ? targetUser : null },
      reply: async payload => { responses.push(payload); return payload; }
    });

    const after = await pool.query(
      'SELECT level,xp,coins,hp,max_hp,mana,max_mana,attack,defense FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, targetId]
    );
    const embed = responses[0]?.embeds?.[0]?.toJSON?.() ?? responses[0]?.embeds?.[0];
    const text = JSON.stringify(embed || {});
    assert.equal(responses.length, 1, 'profile command must respond once');
    assert.ok(text.includes('ProfileTarget'), 'selected target name must appear');
    assert.ok(text.includes('18'), 'selected guild level must appear');
    assert.ok(text.includes('1700'), 'selected guild XP must appear');
    assert.ok(text.includes('765'), 'selected guild gold must appear');
    assert.ok(!text.includes('ProfileViewer'), 'profile must not silently show the invoking user');
    assert.deepEqual(after.rows[0], before.rows[0], 'viewing another profile must not mutate target progress');
  });
});

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

test('concurrent daily quest-chain stage claims award gold, XP and materials exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('90');
    const userId = testSnowflake('89');
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET coins=0,xp=0,level=1,stat_points=0,last_daily_at=NOW() WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );

    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: { getString: name => name === 'odul' ? '1' : null },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; }
    });

    try {
      await Promise.all([
        questChainCommand.execute(makeInteraction()),
        questChainCommand.execute(makeInteraction())
      ]);
      const player = await pool.query(
        'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const chain = await pool.query(
        'SELECT current_step FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE',
        [guildId, userId]
      );
      const material = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🥐 Büyülü Poğaça Kutusu'",
        [guildId, userId]
      );

      assert.equal(Number(player.rows[0].coins), 50, 'stage-one gold must be awarded once');
      assert.equal(Number(player.rows[0].xp), 20, 'stage-one XP must be awarded once');
      assert.equal(Number(player.rows[0].level), 1);
      assert.equal(Number(player.rows[0].stat_points), 0);
      assert.equal(Number(chain.rows[0].current_step), 2, 'the chain must advance exactly one stage');
      assert.equal(Number(material.rows[0].quantity), 1, 'the stage material must be awarded once');
      assert.equal(responses.filter(value => typeof value === 'string' && value.includes('Fırının Çağrısı')).length, 1,
        'only one concurrent request may report the stage reward');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('full three-stage daily quest chain completes with level-scaled rewards', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('90');
    const userId = testSnowflake('88');
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET coins=0,xp=0,level=1,stat_points=0,last_daily_at=NOW(),last_exploration_at=NULL,last_boss_win_at=NULL WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );

    const responses = [];
    const makeInteraction = stage => ({
      guildId,
      user: { id: userId },
      options: { getString: name => name === 'odul' ? String(stage) : null },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; }
    });

    try {
      await questChainCommand.execute(makeInteraction(1));
      await pool.query('UPDATE users SET last_exploration_at=NOW() WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await questChainCommand.execute(makeInteraction(2));
      await pool.query('UPDATE users SET last_boss_win_at=NOW() WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await questChainCommand.execute(makeInteraction(3));
      await questChainCommand.execute(makeInteraction(3));

      const player = await pool.query(
        'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const chain = await pool.query(
        'SELECT current_step,completed_at FROM daily_quest_chains WHERE guild_id=$1 AND user_id=$2 AND chain_date=CURRENT_DATE',
        [guildId, userId]
      );
      const materials = await pool.query(
        "SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[]) ORDER BY item_key",
        [guildId, userId, ['🥐 Büyülü Poğaça Kutusu','💎 Mana Kristali','🐉 Ejderha Pulu']]
      );

      assert.equal(Number(player.rows[0].coins), 450, 'all three stage rewards and the completion bonus must be credited once');
      assert.equal(Number(player.rows[0].xp), 240, 'all three stage XP rewards and the completion bonus must be credited once');
      assert.equal(Number(player.rows[0].level), 2, 'the complete chain must apply the level-up');
      assert.equal(Number(player.rows[0].stat_points), 1, 'the level-up stat point must be credited once');
      assert.equal(Number(chain.rows[0].current_step), 4, 'the chain must be marked fully completed');
      assert.ok(chain.rows[0].completed_at, 'completion timestamp must be persisted');
      assert.equal(materials.rowCount, 3, 'all three stage-specific materials must be persisted');
      const materialCounts = Object.fromEntries(materials.rows.map(row => [row.item_key, Number(row.quantity)]));
      assert.equal(materialCounts['🥐 Büyülü Poğaça Kutusu'], 1);
      assert.equal(materialCounts['💎 Mana Kristali'], 1);
      assert.equal(materialCounts['🐉 Ejderha Pulu'], 1);
      assert.equal(responses.filter(value => typeof value === 'string' && value.includes('Görev zinciri tamamlandı')).length, 1,
        'only the first final-stage claim may report chain completion');
      assert.equal(responses.filter(value => typeof value === 'string' && value.includes('300 altın') && value.includes('180 XP')).length, 1,
        'the final-stage reward must be reported once without matching the previous stage preview');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
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
      'SELECT coins,xp,boss_defeats,last_boss_battle_id,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
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
        'SELECT coins,xp,boss_defeats,last_boss_battle_id,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
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
    await pool.query('DROP TRIGGER IF EXISTS reject_trade_recipient_fixture ON anime_character_collection');
    await pool.query('DROP FUNCTION IF EXISTS reject_trade_recipient_fixture()');
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
    await pool.query('DROP TRIGGER IF EXISTS reject_party_reward_fixture ON inventory');
    await pool.query('DROP FUNCTION IF EXISTS reject_party_reward_fixture()');
  });
});



test('PostgreSQL reward ledger rejects an old solo boss battle ID after a newer victory', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('93');
    const userId = testSnowflake('94');
    const firstBattleId = randomUUID();
    const secondBattleId = randomUUID();
    await ensureUser(guildId, userId);

    const claim = battleId => claimSoloBossReward(pool, {
      guildId,
      userId,
      battleId,
      hp: 75,
      mana: 60,
      coins: 250,
      xp: 100,
      bonusLoot: 'historical-replay-bonus',
      craftingMaterial: 'historical-replay-material',
      journalBossKey: null,
      spellUsed: null
    });

    try {
      const first = await claim(firstBattleId);
      const second = await claim(secondBattleId);
      const replay = await claim(firstBattleId);
      const player = await pool.query(
        'SELECT coins,xp,level,stat_points,boss_defeats,last_boss_battle_id FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const claims = await pool.query(
        "SELECT reward_id FROM rpg_reward_claims WHERE guild_id=$1 AND user_id=$2 AND reward_type='solo_boss' ORDER BY reward_id",
        [guildId, userId]
      );
      const inventory = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );

      assert.equal(first.status, 'claimed');
      assert.equal(second.status, 'claimed');
      assert.equal(replay.status, 'already_claimed');
      assert.equal(Number(player.rows[0].coins), 500, 'old battle replay must not award more gold');
      assert.equal(Number(player.rows[0].xp), 200, 'old battle replay must not award more XP');
      assert.equal(Number(player.rows[0].boss_defeats), 2, 'old battle replay must not increment boss defeats');
      assert.equal(Number(player.rows[0].level), 2, 'XP must advance the persistent level exactly as expected');
      assert.equal(Number(player.rows[0].stat_points), 1, 'level-up stat points must be granted once');
      assert.equal(player.rows[0].last_boss_battle_id, secondBattleId);
      assert.deepEqual(
        claims.rows.map(row => row.reward_id),
        [firstBattleId, secondBattleId].sort(),
        'the ledger must retain both unique battle IDs, not only the latest one'
      );
      assert.deepEqual(
        Object.fromEntries(inventory.rows.map(row => [row.item_key, Number(row.quantity)])),
        {
          'historical-replay-bonus': 2,
          'historical-replay-material': 2,
          '💎 Mana Kristali': 2
        },
        'old battle replay must not duplicate inventory rewards'
      );
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});



test('PostgreSQL migration backfills the latest legacy solo boss reward before allowing a replay', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('95');
    const userId = testSnowflake('96');
    const legacyBattleId = randomUUID();
    await ensureUser(guildId, userId);
    try {
      await pool.query(
        'UPDATE users SET last_boss_battle_id=$3,last_boss_win_at=NOW() WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId, legacyBattleId]
      );

      await initDatabase();

      const replay = await claimSoloBossReward(pool, {
        guildId,
        userId,
        battleId: legacyBattleId,
        hp: 100,
        mana: 100,
        coins: 250,
        xp: 100,
        bonusLoot: 'legacy-migration-bonus',
        craftingMaterial: 'legacy-migration-material',
        journalBossKey: null,
        spellUsed: null
      });
      const player = await pool.query(
        'SELECT coins,xp,boss_defeats FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const ledger = await pool.query(
        "SELECT reward_id FROM rpg_reward_claims WHERE guild_id=$1 AND user_id=$2 AND reward_type='solo_boss' AND reward_id=$3",
        [guildId, userId, legacyBattleId]
      );
      const inventory = await pool.query(
        'SELECT COUNT(*)::int AS count FROM inventory WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );

      assert.equal(replay.status, 'already_claimed');
      assert.equal(Number(player.rows[0].coins), 0);
      assert.equal(Number(player.rows[0].xp), 0);
      assert.equal(Number(player.rows[0].boss_defeats), 0);
      assert.equal(ledger.rowCount, 1, 'the legacy latest battle ID must be migrated into the reward ledger');
      assert.equal(inventory.rows[0].count, 0, 'a migrated reward must not produce a second inventory payout');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('concurrent crafting cannot consume the same inventory materials or award duplicate XP', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('97');
    const userId = testSnowflake('98');
    const item = equipmentItems.find(entry => entry.id === 'iron_sword');
    assert.ok(item, 'iron_sword recipe must map to a real equipment item');
    await ensureUser(guildId, userId);
    await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',1),($1,$2,'🥐 Büyülü Poğaça Kutusu',1)", [guildId, userId]);

    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: {
        getString: name => name === 'tarif' ? 'iron_sword' : null,
        getInteger: name => name === 'adet' ? 1 : null
      },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; }
    });

    try {
      await Promise.all([craftingCommand.execute(makeInteraction()), craftingCommand.execute(makeInteraction())]);
      const output = await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, item.name]);
      const materials = await pool.query("SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])", [guildId, userId, ['💎 Mana Kristali', '🥐 Büyülü Poğaça Kutusu']]);
      const progress = await pool.query('SELECT xp,level,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const daily = await pool.query('SELECT crafted_items FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE', [guildId, userId]);

      assert.equal(Number(output.rows[0]?.quantity), 1, 'only one craft may create the item');
      assert.equal(materials.rowCount, 0, 'both required materials must be consumed exactly once');
      assert.equal(Number(progress.rows[0]?.successful_crafts), 1);
      assert.equal(Number(progress.rows[0]?.xp), ({ Yaygın: 10, Nadir: 20, Destansı: 35, Efsanevi: 50 }[item.rarity] || 10));
      assert.equal(Number(daily.rows[0]?.crafted_items), 1);
      assert.equal(responses.filter(value => Array.isArray(value?.embeds)).length, 1,
        'exactly one concurrent crafting interaction may report success');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('concurrent item use consumes a single inventory copy and applies its reward once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('88');
    const userId = testSnowflake('89');
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET coins=0,xp=0,level=1,hp=50,max_hp=100,mana=10,max_mana=100,items_used_count=0 WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    await pool.query(
      "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',1)",
      [guildId, userId]
    );
    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: { getString: () => 'mana_crystal' },
      reply: async payload => { responses.push(payload); return payload; }
    });

    try {
      await Promise.all([
        useItemCommand.execute(makeInteraction()),
        useItemCommand.execute(makeInteraction())
      ]);
      const player = await pool.query(
        'SELECT coins,xp,level,hp,max_hp,mana,max_mana,items_used_count FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const item = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='💎 Mana Kristali'",
        [guildId, userId]
      );
      assert.equal(Number(player.rows[0].mana), 60, 'the 50 mana effect must apply exactly once');
      assert.equal(Number(player.rows[0].max_mana), 100, 'using a refill must not increase the base mana cap');
      assert.equal(Number(player.rows[0].hp), 50);
      assert.equal(Number(player.rows[0].max_hp), 100);
      assert.equal(Number(player.rows[0].items_used_count), 1);
      assert.equal(Number(player.rows[0].coins), 0);
      assert.equal(Number(player.rows[0].xp), 0);
      assert.equal(item.rowCount, 0, 'the single item copy must be consumed once');
      assert.equal(responses.filter(value => Array.isArray(value?.embeds)).length, 1,
        'only one concurrent use interaction may report success');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('equipment equip and unequip preserve base HP, mana caps and inventory ownership', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('99');
    const userId = testSnowflake('98');
    const item = equipmentItems.find(entry => entry.id === 'iron_sword');
    assert.ok(item);
    await ensureUser(guildId, userId);
    await pool.query('UPDATE users SET level=$3,max_hp=120,hp=120,max_mana=90,mana=90 WHERE guild_id=$1 AND user_id=$2', [guildId, userId, item.levelReq]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)', [guildId, userId, item.name]);

    const makeInteraction = (action, slot = null) => ({
      guildId,
      user: { id: userId },
      options: { getString: name => name === 'islem' ? action : name === 'esya' ? item.id : name === 'yuva' ? slot : null },
      reply: async payload => payload
    });

    try {
      await equipmentCommand.execute(makeInteraction('equip'));
      let state = await pool.query("SELECT u.max_hp,u.max_mana,u.hp,u.mana,(SELECT COUNT(*)::int FROM user_equipment e WHERE e.guild_id=u.guild_id AND e.user_id=u.user_id) AS equipped FROM users u WHERE u.guild_id=$1 AND u.user_id=$2", [guildId, userId]);
      let inventory = await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, item.name]);
      assert.equal(Number(state.rows[0].max_hp), 120);
      assert.equal(Number(state.rows[0].max_mana), 90);
      assert.equal(Number(state.rows[0].equipped), 1);
      assert.equal(Number(inventory.rows[0].quantity), 1, 'equipping must not consume the owned item');

      await equipmentCommand.execute(makeInteraction('unequip', 'weapon'));
      state = await pool.query("SELECT max_hp,max_mana,hp,mana,(SELECT COUNT(*)::int FROM user_equipment e WHERE e.guild_id=users.guild_id AND e.user_id=users.user_id) AS equipped FROM users WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
      inventory = await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, item.name]);
      assert.equal(Number(state.rows[0].max_hp), 120);
      assert.equal(Number(state.rows[0].max_mana), 90);
      assert.equal(Number(state.rows[0].equipped), 0);
      assert.equal(Number(inventory.rows[0].quantity), 1, 'unequipping must keep the item in inventory');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('achievement rewards are single-use under concurrent claims and isolated per guild', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildA = testSnowflake('91');
    const guildB = testSnowflake('92');
    const userId = testSnowflake('90');
    await ensureUser(guildA, userId);
    await ensureUser(guildB, userId);
    await pool.query('UPDATE users SET coins=1000,level=5 WHERE user_id=$1 AND guild_id=ANY($2::text[])', [userId, [guildA, guildB]]);

    const makeInteraction = guildId => ({
      guildId,
      user: { id: userId, username: 'AchievementTester' },
      options: { getString: () => 'rich_1000' },
      deferReply: async () => {},
      editReply: async payload => payload
    });

    try {
      const sameGuild = await Promise.all([achievementCommand.execute(makeInteraction(guildA)), achievementCommand.execute(makeInteraction(guildA))]);
      const otherGuild = await achievementCommand.execute(makeInteraction(guildB));
      const balances = await pool.query('SELECT guild_id,coins FROM users WHERE user_id=$1 AND guild_id=ANY($2::text[]) ORDER BY guild_id', [userId, [guildA, guildB]]);
      const claims = await pool.query("SELECT guild_id,achievement_key FROM achievement_claims WHERE user_id=$1 AND guild_id=ANY($2::text[]) AND achievement_key='rich_1000'", [userId, [guildA, guildB]]);

      assert.deepEqual(balances.rows.map(row => Number(row.coins)), [1100, 1100]);
      assert.equal(claims.rowCount, 2, 'one claim per guild is allowed');
      assert.equal(sameGuild.filter(value => String(value).includes('100 altın')).length, 1,
        'same-guild concurrent requests must award once');
      assert.ok(String(otherGuild).includes('100 altın'), 'the other guild has an independent claim');
    } finally {
      await pool.query('DELETE FROM users WHERE user_id=$1 AND guild_id=ANY($2::text[])', [userId, [guildA, guildB]]);
    }
  });
});

test('gold leaderboard orders by coins and tie-breaks while excluding other guilds', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('93');
    const foreignGuildId = testSnowflake('94');
    const users = [testSnowflake('90'), testSnowflake('91'), testSnowflake('92')];
    for (const userId of users) await ensureUser(guildId, userId);
    await ensureUser(foreignGuildId, users[0]);
    await pool.query('UPDATE users SET coins=1000,level=3,xp=300 WHERE guild_id=$1 AND user_id=$2', [guildId, users[0]]);
    await pool.query('UPDATE users SET coins=1000,level=5,xp=100 WHERE guild_id=$1 AND user_id=$2', [guildId, users[1]]);
    await pool.query('UPDATE users SET coins=500,level=9,xp=900 WHERE guild_id=$1 AND user_id=$2', [guildId, users[2]]);
    await pool.query('UPDATE users SET coins=9999,level=99,xp=99999 WHERE guild_id=$1 AND user_id=$2', [foreignGuildId, users[0]]);
    const interaction = {
      guildId,
      deferReply: async () => {},
      client: { users: { fetch: async id => ({ username: 'Player-' + id }) } },
      editReply: async payload => payload
    };

    try {
      const response = await leaderboardCommand.execute(interaction);
      const description = response.embeds[0].data.description;
      assert.ok(description.indexOf('Player-' + users[1]) < description.indexOf('Player-' + users[0]),
        'higher level wins the tie on equal gold');
      assert.ok(description.includes('Player-' + users[2]));
      assert.ok(!description.includes('9999'), 'foreign guild balance must not leak into the leaderboard');
    } finally {
      await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id=ANY($2::text[])) OR (guild_id=$3 AND user_id=$4)', [guildId, users, foreignGuildId, users[0]]);
    }
  });
});

test('exploration leaderboard aggregates discoveries only within the requested guild', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('95');
    const foreignGuildId = testSnowflake('96');
    const users = [testSnowflake('90'), testSnowflake('91')];
    for (const userId of users) await ensureUser(guildId, userId);
    await ensureUser(foreignGuildId, users[0]);
    await pool.query("INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'forest'),($1,$2,'ruins'),($1,$3,'lake'),($4,$2,'foreign-forest')", [guildId, users[0], users[1], foreignGuildId]);
    const interaction = {
      guildId,
      options: { getString: () => 'kesif' },
      reply: async payload => payload
    };

    try {
      const response = await explorationLeaderboardCommand.execute(interaction);
      const description = response.embeds[0].data.description;
      assert.ok(description.includes('<@' + users[0] + '> — **2** keşif'));
      assert.ok(description.includes('<@' + users[1] + '> — **1** keşif'));
      assert.equal((description.match(/keşif/g) || []).length, 2);
    } finally {
      await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id=ANY($2::text[])) OR (guild_id=$3 AND user_id=$4)', [guildId, users, foreignGuildId, users[0]]);
    }
  });
});

test('character collection command filters by rarity and keeps guild/player data isolated', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('97');
    const foreignGuildId = testSnowflake('98');
    const userId = testSnowflake('90');
    await ensureUser(guildId, userId);
    await ensureUser(foreignGuildId, userId);
    await pool.query("INSERT INTO anime_character_collection (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity) VALUES($1,$2,'Frieren','Frieren','Efsanevi','🌟',10194172,'fixture','fixture',2),($3,$2,'Fern','Frieren','Nadir','🪄',10194172,'fixture','fixture',1)", [guildId, userId, foreignGuildId]);
    const interaction = {
      guildId,
      user: { id: userId, username: 'CollectionTester' },
      options: { getUser: () => null, getString: () => 'Efsanevi' },
      deferReply: async () => {},
      editReply: async payload => payload
    };

    try {
      let response;
      interaction.editReply = async payload => { response = payload; return payload; };
      await collectionCommand.execute(interaction);
      assert.equal(response.embeds.length, 2, 'summary and one character card should be returned');
      assert.ok(response.embeds[0].data.title.includes('Efsanevi'));
      assert.ok(response.embeds[1].data.title.includes('Frieren'));
      assert.ok(!response.embeds.some(embed => embed.data.title.includes('Fern')),
        'a character from another guild must not appear');
    } finally {
      await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id=$2) OR (guild_id=$3 AND user_id=$2)', [guildId, userId, foreignGuildId]);
    }
  });
});


test('expired trade offers are resolved using the PostgreSQL clock without transferring characters', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('95');
    const from = testSnowflake('90');
    const to = testSnowflake('92');
    const offerId = randomUUID();
    await ensureUser(guildId, from);
    await ensureUser(guildId, to);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Aura','Frieren','Efsanevi','👑',10194172,'fixture','fixture',2)`,
      [guildId, from]
    );
    await pool.query(
      `INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
       VALUES($1,$2,$3,$4,'Aura',1,NOW()-INTERVAL '1 second')`,
      [offerId, guildId, from, to]
    );

    const result = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId: to });
    const offer = await pool.query('SELECT status,resolved_at FROM trade_offers WHERE offer_id=$1', [offerId]);
    const sender = await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Aura'",
      [guildId, from]
    );
    const recipient = await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Aura'",
      [guildId, to]
    );

    assert.equal(result.status, 'expired');
    assert.equal(offer.rows[0].status, 'expired');
    assert.ok(offer.rows[0].resolved_at);
    assert.equal(Number(sender.rows[0].quantity), 2);
    assert.equal(recipient.rowCount, 0);
  });
});

test('declining a trade offer is single-use and leaves both collections unchanged', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('96');
    const from = testSnowflake('90');
    const to = testSnowflake('92');
    const offerId = randomUUID();
    await ensureUser(guildId, from);
    await ensureUser(guildId, to);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Stark','Frieren','Nadir','🪓',10194172,'fixture','fixture',3)`,
      [guildId, from]
    );
    await pool.query(
      `INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
       VALUES($1,$2,$3,$4,'Stark',2,NOW()+INTERVAL '5 minutes')`,
      [offerId, guildId, from, to]
    );

    const first = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId: to, action: 'trade_decline' });
    const replay = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId: to, action: 'trade_decline' });
    const offer = await pool.query('SELECT status,resolved_at FROM trade_offers WHERE offer_id=$1', [offerId]);
    const sender = await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",
      [guildId, from]
    );
    const recipient = await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Stark'",
      [guildId, to]
    );

    assert.equal(first.status, 'declined');
    assert.equal(replay.status, 'already_resolved');
    assert.equal(offer.rows[0].status, 'declined');
    assert.ok(offer.rows[0].resolved_at);
    assert.equal(Number(sender.rows[0].quantity), 3);
    assert.equal(recipient.rowCount, 0);
  });
});

test('only the intended recipient can accept or decline a trade offer', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('97');
    const from = testSnowflake('90');
    const to = testSnowflake('92');
    const intruder = testSnowflake('93');
    const offerId = randomUUID();
    await ensureUser(guildId, from);
    await ensureUser(guildId, to);
    await ensureUser(guildId, intruder);
    await pool.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity)
       VALUES($1,$2,'Fern','Frieren','Nadir','🪄',10194172,'fixture','fixture',2)`,
      [guildId, from]
    );
    await pool.query(
      `INSERT INTO trade_offers(offer_id,guild_id,from_user_id,to_user_id,character_name,amount,expires_at)
       VALUES($1,$2,$3,$4,'Fern',1,NOW()+INTERVAL '5 minutes')`,
      [offerId, guildId, from, to]
    );

    const accept = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId: intruder });
    const decline = await resolveTradeOffer(pool, { guildId, offerId, acceptingUserId: intruder, action: 'trade_decline' });
    const offer = await pool.query('SELECT status FROM trade_offers WHERE offer_id=$1', [offerId]);
    const sender = await pool.query(
      "SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name='Fern'",
      [guildId, from]
    );

    assert.equal(accept.status, 'forbidden');
    assert.equal(decline.status, 'forbidden');
    assert.equal(offer.rows[0].status, 'pending');
    assert.equal(Number(sender.rows[0].quantity), 2);
  });
});

test('equipment supports two independent ring slots and preserves remaining bonuses after one ring is removed', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('98');
    const userId = testSnowflake('90');
    const copper = equipmentItems.find(entry => entry.id === 'copper_ring');
    const hero = equipmentItems.find(entry => entry.id === 'hero_ring');
    assert.ok(copper && hero);
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET level=50,hp=120,max_hp=120,mana=90,max_mana=90 WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1),($1,$2,$4,1)',
      [guildId, userId, copper.name, hero.name]
    );

    const makeInteraction = (itemId, slot, action = 'equip') => ({
      guildId,
      user: { id: userId },
      options: { getString: name => name === 'islem' ? action : name === 'esya' ? itemId : name === 'yuva' ? slot : null },
      reply: async payload => payload
    });

    try {
      await equipmentCommand.execute(makeInteraction(copper.id, 'ring1'));
      await equipmentCommand.execute(makeInteraction(hero.id, 'ring2'));
      let state = await pool.query(
        'SELECT max_hp,max_mana,hp,mana,(SELECT COUNT(*)::int FROM user_equipment WHERE guild_id=$1 AND user_id=$2) AS equipped FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      let slots = await pool.query(
        'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',
        [guildId, userId]
      );
      assert.equal(Number(state.rows[0].max_hp), 120, 'ring bonuses must not be persisted into base max HP');
      assert.equal(Number(state.rows[0].max_mana), 90, 'ring bonuses must not be persisted into base max mana');
      assert.equal(Number(state.rows[0].equipped), 2);
      assert.deepEqual(slots.rows.map(row => row.slot), ['ring1', 'ring2']);

      await equipmentCommand.execute(makeInteraction(null, 'ring1', 'unequip'));
      state = await pool.query(
        'SELECT max_hp,max_mana,hp,mana,(SELECT COUNT(*)::int FROM user_equipment WHERE guild_id=$1 AND user_id=$2) AS equipped FROM users WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      slots = await pool.query(
        'SELECT slot,item_key FROM user_equipment WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',
        [guildId, userId]
      );
      assert.equal(Number(state.rows[0].max_hp), 120);
      assert.equal(Number(state.rows[0].max_mana), 90);
      assert.equal(Number(state.rows[0].equipped), 1);
      assert.deepEqual(slots.rows.map(row => row.slot), ['ring2']);
      const owned = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 ORDER BY item_key',
        [guildId, userId]
      );
      assert.equal(owned.rowCount, 2, 'equipping and unequipping must preserve both inventory copies');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('successful co-op raid and dungeon Zoltraak casts persist mastery totals atomically', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91');
    const raidUser=testSnowflake('90');
    const dungeonUser=testSnowflake('92');
    const raidId=randomUUID(), dungeonId=randomUUID();
    await ensureUser(guildId,raidUser);
    await ensureUser(guildId,dungeonUser);
    try {
      await pool.query(
        "INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at) VALUES($1,$2,$3,'raid',NOW()+INTERVAL '30 minutes')",
        [guildId,raidUser,raidId]
      );
      const raid = await settleRaidRewards(pool,{
        guildId,encounterId:raidId,ids:[raidUser],
        fighters:[{userId:raidUser,maxHp:100,baseMaxHp:100,mana:70,maxMana:100,baseMaxMana:100}],
        persistedHpNow:[80],persistedManaNow:[70],win:true,xpReward:20,coinReward:10,loot:null,
        spellCasts:new Map([[raidUser,2]])
      });
      assert.equal(raid.status,'settled');
      assert.equal(raid.masteryResults.length,1);
      assert.equal(Number(raid.masteryResults[0].casts),2);
      assert.equal(Number(raid.masteryResults[0].mastery_level),0);

      await pool.query(
        "INSERT INTO active_rpg_encounters(guild_id,user_id,encounter_id,encounter_type,expires_at) VALUES($1,$2,$3,'dungeon',NOW()+INTERVAL '30 minutes')",
        [guildId,dungeonUser,dungeonId]
      );
      const dungeon = await settleDungeonRewards(pool,{
        guildId,encounterId:dungeonId,ids:[dungeonUser],
        players:[{user_id:dungeonUser,maxHp:100,max_hp:100,mana:70,maxMana:100,max_mana:100}],
        persistedHpNow:[80],persistedManaNow:[70],victory:true,totalXp:20,totalCoins:10,
        chestRewards:[],loot:null,craftingLoot:null,spellCasts:new Map([[dungeonUser,3]]),journalUserId:dungeonUser
      });
      assert.equal(dungeon.status,'settled');
      assert.equal(dungeon.masteryResults.length,1);
      assert.equal(Number(dungeon.masteryResults[0].casts),3);
      assert.equal(Number(dungeon.masteryResults[0].mastery_level),0);

      const rows=await pool.query(
        'SELECT user_id,casts,mastery_level FROM spell_mastery WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND spell_key=$3',
        [guildId,[raidUser,dungeonUser],'zoltraak']
      );
      assert.equal(rows.rowCount,2);
      assert.deepEqual(
        Object.fromEntries(rows.rows.map(row=>[row.user_id,Number(row.casts)])),
        {[raidUser]:2,[dungeonUser]:3}
      );
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[raidUser,dungeonUser]]);
    }
  });
});

test('concurrent character upgrades serialize coin spending and preserve collection copies', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('94'), userId=testSnowflake('90');
    await ensureUser(guildId,userId);
    await pool.query('UPDATE users SET coins=500 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    await pool.query(
      "INSERT INTO anime_character_collection(guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,quantity) VALUES($1,$2,'Frieren','Frieren','Efsanevi','🌟',10194172,'fixture','fixture',2)",
      [guildId,userId]
    );
    const responses=[];
    const makeInteraction=()=>({
      guildId,user:{id:userId},
      options:{getString:()=> 'Frieren',getBoolean:()=>true},
      deferReply:async()=>{},
      editReply:async payload=>{responses.push(payload);return payload;}
    });
    await Promise.all([
      characterUpgradeCommand.execute(makeInteraction()),
      characterUpgradeCommand.execute(makeInteraction())
    ]);
    const player=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    const upgrade=await pool.query('SELECT upgrade_level FROM character_upgrades WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[guildId,userId,'Frieren']);
    const collection=await pool.query('SELECT quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[guildId,userId,'Frieren']);
    assert.equal(Number(player.rows[0].coins),250,'only the first level upgrade may spend 250 coins');
    assert.equal(Number(upgrade.rows[0].upgrade_level),1,'the concurrent second upgrade must fail the 500-coin balance check');
    assert.equal(Number(collection.rows[0].quantity),2,'upgrading a character must not consume collection copies');
    assert.equal(responses.filter(value=>typeof value==='string'&&value.includes('artık **+1**')).length,1);
    assert.equal(responses.filter(value=>typeof value==='string'&&value.includes('Yetersiz altın')).length,1);
  });
});


test('all ten crafting recipes consume their exact ingredients and persist equipment, rarity XP and profession progress', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'craft-recipe-matrix-' + randomUUID();
    const userId = testSnowflake('97');
    await ensureUser(guildId, userId);
    await pool.query(
      'INSERT INTO user_crafting_progress(guild_id,user_id,xp,level) VALUES($1,$2,400,5)',
      [guildId, userId]
    );
    const recipeIds = new Set(['iron_sword','mage_staff','traveler_cloak','mana_ring','fern_robe','frieren_robe','himmel_sword','demon_blade','rune_ring','hero_ring']);
    const recipeItems = equipmentItems.filter(item => recipeIds.has(item.id));
    assert.equal(recipeItems.length, 10, 'the catalog must expose the ten crafting recipes under test');
    const materials = [
      ['💎 Mana Kristali', 11],
      ['🥐 Büyülü Poğaça Kutusu', 3],
      ['📖 Yasak Büyü Kitabı', 5],
      ['🌙 Efsunlu Elf Yadigârı', 6],
      ['👑 Himmel’in Efsanevi Yadigârı', 2],
      ['🐉 Ejderha Pulu', 5],
      ['📜 Frieren’in Kayıp Notları', 1]
    ];
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) SELECT $1,$2,item_key,quantity FROM UNNEST($3::text[],$4::int[]) AS seed(item_key,quantity)',
      [guildId, userId, materials.map(row => row[0]), materials.map(row => row[1])]
    );

    const responses = [];
    const previousRandom = Math.random;
    Math.random = () => 0.99;
    const makeInteraction = recipe => ({
      guildId,
      user: { id: userId },
      options: {
        getString: name => name === 'tarif' ? recipe : null,
        getInteger: name => name === 'adet' ? 1 : null
      },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; }
    });

    try {
      for (const item of recipeItems) {
        await craftingCommand.execute(makeInteraction(item.id));
      }
      const outputs = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
        [guildId, userId, recipeItems.map(item => item.name)]
      );
      const remainingMaterials = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
        [guildId, userId, materials.map(row => row[0])]
      );
      const progress = await pool.query(
        'SELECT xp,level,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const daily = await pool.query(
        'SELECT crafted_items FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
        [guildId, userId]
      );
      const expectedXp = recipeItems.reduce((sum, item) =>
        sum + ({ Yaygın: 10, Nadir: 20, Destansı: 35, Efsanevi: 50 }[item.rarity] || 10), 0);

      assert.equal(outputs.rowCount, recipeItems.length, 'each of the ten recipes must create its mapped equipment item');
      assert.ok(outputs.rows.every(row => Number(row.quantity) === 1));
      assert.equal(remainingMaterials.rowCount, 0, 'all recipe ingredients must be consumed exactly once');
      assert.equal(Number(progress.rows[0].xp), 400 + expectedXp, 'rarity-weighted XP must accumulate');
      assert.equal(Number(progress.rows[0].level), Math.floor((400 + expectedXp) / 100) + 1);
      assert.equal(Number(progress.rows[0].successful_crafts), recipeItems.length);
      assert.equal(Number(daily.rows[0].crafted_items), recipeItems.length);
      assert.equal(responses.length, recipeItems.length);
      assert.ok(responses.every(payload => {
        const rendered = JSON.stringify(payload);
        return rendered.includes('Zanaat ustalığı') && rendered.includes('Başarılı üretim');
      }), 'every successful craft response must display profession progress');
    } finally {
      Math.random = previousRandom;
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('multi-item crafting scales every ingredient and updates output, profession and daily totals proportionally', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'craft-quantity-' + randomUUID();
    const userId = testSnowflake('96');
    const item = equipmentItems.find(entry => entry.id === 'iron_sword');
    await ensureUser(guildId, userId);
    await pool.query(
      "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',3),($1,$2,'🥐 Büyülü Poğaça Kutusu',3)",
      [guildId, userId]
    );
    const interaction = {
      guildId,
      user: { id: userId },
      options: {
        getString: name => name === 'tarif' ? 'iron_sword' : null,
        getInteger: name => name === 'adet' ? 3 : null
      },
      deferReply: async () => {},
      editReply: async payload => payload
    };
    try {
      await craftingCommand.execute(interaction);
      const output = await pool.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
        [guildId, userId, item.name]
      );
      const ingredients = await pool.query(
        "SELECT item_key FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])",
        [guildId, userId, ['💎 Mana Kristali', '🥐 Büyülü Poğaça Kutusu']]
      );
      const progress = await pool.query(
        'SELECT xp,successful_crafts FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const daily = await pool.query(
        'SELECT crafted_items FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
        [guildId, userId]
      );
      assert.equal(Number(output.rows[0].quantity), 3);
      assert.equal(ingredients.rowCount, 0);
      assert.equal(Number(progress.rows[0].xp), 30);
      assert.equal(Number(progress.rows[0].successful_crafts), 3);
      assert.equal(Number(daily.rows[0].crafted_items), 3);
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('advanced crafting recipes reject an insufficient profession level without consuming materials', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'craft-level-gate-' + randomUUID();
    const userId = testSnowflake('95');
    await ensureUser(guildId, userId);
    await pool.query(
      'INSERT INTO user_crafting_progress(guild_id,user_id,xp,level) VALUES($1,$2,200,3)',
      [guildId, userId]
    );
    const seededMaterials = [
      ['🌙 Efsunlu Elf Yadigârı', 2],
      ['💎 Mana Kristali', 3],
      ['👑 Himmel’in Efsanevi Yadigârı', 1],
      ['🐉 Ejderha Pulu', 5],
      ['📜 Frieren’in Kayıp Notları', 1]
    ];
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) SELECT $1,$2,item_key,quantity FROM UNNEST($3::text[],$4::int[]) AS seed(item_key,quantity)',
      [guildId, userId, seededMaterials.map(row => row[0]), seededMaterials.map(row => row[1])]
    );
    const responses = [];
    const recipes = [
      { id: 'frieren_robe', level: 4 },
      { id: 'himmel_sword', level: 4 },
      { id: 'demon_blade', level: 5 }
    ];
    try {
      for (const recipe of recipes) {
        await craftingCommand.execute({
          guildId,
          user: { id: userId },
          options: {
            getString: name => name === 'tarif' ? recipe.id : null,
            getInteger: () => 1
          },
          deferReply: async () => {},
          editReply: async payload => { responses.push(payload); return payload; }
        });
      }
      const ingredients = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
        [guildId, userId, seededMaterials.map(row => row[0])]
      );
      const outputs = await pool.query(
        'SELECT item_key FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])',
        [guildId, userId, recipes.map(recipe => equipmentItems.find(item => item.id === recipe.id).name)]
      );
      assert.deepEqual(
        Object.fromEntries(ingredients.rows.map(row => [row.item_key, Number(row.quantity)])),
        Object.fromEntries(seededMaterials)
      );
      assert.equal(outputs.rowCount, 0, 'level-gated rare and legendary recipes must not create equipment');
      assert.equal(responses.length, recipes.length);
      for (let index = 0; index < recipes.length; index++) {
        assert.ok(JSON.stringify(responses[index]).includes(`zanaat seviyesi **${recipes[index].level}**`));
      }
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('crafting material recovery unlocks at profession levels five and ten without duplicating equipment output', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const previousRandom = Math.random;
    const fixtures = [
      { guildId: 'craft-refund-locked-' + randomUUID(), userId: testSnowflake('94'), xp: 300, level: 4, roll: 0.05 },
      { guildId: 'craft-refund-five-hit-' + randomUUID(), userId: testSnowflake('93'), xp: 400, level: 5, roll: 0.05 },
      { guildId: 'craft-refund-five-miss-' + randomUUID(), userId: testSnowflake('92'), xp: 400, level: 5, roll: 0.15 },
      { guildId: 'craft-refund-ten-hit-' + randomUUID(), userId: testSnowflake('91'), xp: 900, level: 10, roll: 0.15 },
      { guildId: 'craft-refund-ten-miss-' + randomUUID(), userId: testSnowflake('90'), xp: 900, level: 10, roll: 0.25 }
    ];
    try {
      for (const fixture of fixtures) {
        Math.random = () => fixture.roll;
        await ensureUser(fixture.guildId, fixture.userId);
        await pool.query(
          'INSERT INTO user_crafting_progress(guild_id,user_id,xp,level) VALUES($1,$2,$3,$4)',
          [fixture.guildId, fixture.userId, fixture.xp, fixture.level]
        );
        await pool.query(
          "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'💎 Mana Kristali',1),($1,$2,'🥐 Büyülü Poğaça Kutusu',1)",
          [fixture.guildId, fixture.userId]
        );
        await craftingCommand.execute({
          guildId: fixture.guildId,
          user: { id: fixture.userId },
          options: {
            getString: name => name === 'tarif' ? 'iron_sword' : null,
            getInteger: () => 1
          },
          deferReply: async () => {},
          editReply: async payload => payload
        });
        const ingredients = await pool.query(
          "SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])",
          [fixture.guildId, fixture.userId, ['💎 Mana Kristali', '🥐 Büyülü Poğaça Kutusu']]
        );
        const output = await pool.query(
          "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3",
          [fixture.guildId, fixture.userId, equipmentItems.find(item => item.id === 'iron_sword').name]
        );
        const remaining = Object.fromEntries(ingredients.rows.map(row => [row.item_key, Number(row.quantity)]));
        const refundThreshold = fixture.level >= 10 ? 0.20 : fixture.level >= 5 ? 0.10 : 0;
        const expectedMaterials = fixture.roll < refundThreshold ? { '💎 Mana Kristali': 1 } : {};
        assert.deepEqual(remaining, expectedMaterials,
          `refund threshold must match profession level ${fixture.level} and random roll ${fixture.roll}`);
        assert.equal(Number(output.rows[0].quantity), 1, 'material recovery must not duplicate the crafted equipment');
      }
    } finally {
      Math.random = previousRandom;
      for (const fixture of fixtures) {
        await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [fixture.guildId, fixture.userId]);
      }
    }
  });
});

test('equipment salvage returns proportional materials for all twelve items and records lifetime dismantling totals', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'salvage-matrix-' + randomUUID();
    const userId = testSnowflake('92');
    await ensureUser(guildId, userId);
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) SELECT $1,$2,item.name,2 FROM UNNEST($3::text[]) AS item(name)',
      [guildId, userId, equipmentItems.map(item => item.name)]
    );
    const makeInteraction = itemId => ({
      guildId,
      user: { id: userId },
      options: {
        getString: name => name === 'esya' ? itemId : null,
        getInteger: name => name === 'adet' ? 2 : null
      },
      deferReply: async () => {},
      editReply: async payload => { responses.push(payload); return payload; }
    });
    const expected = new Map();
    const responses = [];
    try {
      for (const item of equipmentItems) {
        const salvage = {
          iron_sword: ['🥐 Büyülü Poğaça Kutusu', 1],
          mage_staff: ['📖 Yasak Büyü Kitabı', 1],
          traveler_cloak: ['🥐 Büyülü Poğaça Kutusu', 1],
          mana_ring: ['💎 Mana Kristali', 1],
          fern_robe: ['🌙 Efsunlu Elf Yadigârı', 1],
          frieren_robe: ['💎 Mana Kristali', 1],
          himmel_sword: ['🐉 Ejderha Pulu', 1],
          demon_blade: ['🐉 Ejderha Pulu', 2],
          rune_ring: ['💎 Mana Kristali', 1],
          hero_ring: ['🌙 Efsunlu Elf Yadigârı', 1],
          demon_armor: ['🐉 Ejderha Pulu', 2],
          copper_ring: ['💎 Mana Kristali', 1]
        }[item.id];
        assert.ok(salvage, 'every craftable equipment item must have a salvage mapping');
        expected.set(salvage[0], (expected.get(salvage[0]) || 0) + salvage[1] * 2);
        await salvageCommand.execute(makeInteraction(item.id));
      }
      const returned = await pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const progress = await pool.query(
        'SELECT salvaged_items FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      assert.deepEqual(
        Object.fromEntries(returned.rows.map(row => [row.item_key, Number(row.quantity)])),
        Object.fromEntries(expected)
      );
      assert.equal(Number(progress.rows[0].salvaged_items), equipmentItems.length * 2);
      assert.equal(responses.length, equipmentItems.length);
      assert.ok(responses.every(payload => JSON.stringify(payload).includes('Toplam parçalanan ekipman')),
        'each salvage response must display the updated lifetime dismantling total');
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('equipment salvage refuses to dismantle equipped copies and leaves inventory and progress unchanged', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'salvage-equipped-' + randomUUID();
    const userId = testSnowflake('91');
    const item = equipmentItems.find(entry => entry.id === 'iron_sword');
    await ensureUser(guildId, userId);
    await pool.query(
      'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',
      [guildId, userId, item.name]
    );
    await pool.query(
      "INSERT INTO user_equipment(guild_id,user_id,slot,item_key) VALUES($1,$2,'weapon',$3)",
      [guildId, userId, item.name]
    );
    let response;
    try {
      await salvageCommand.execute({
        guildId,
        user: { id: userId },
        options: {
          getString: name => name === 'esya' ? 'iron_sword' : null,
          getInteger: () => 1
        },
        deferReply: async () => {},
        editReply: async payload => { response = payload; return payload; }
      });
      const inventory = await pool.query(
        'SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',
        [guildId, userId, item.name]
      );
      const materials = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🥐 Büyülü Poğaça Kutusu'",
        [guildId, userId]
      );
      const progress = await pool.query(
        'SELECT salvaged_items FROM user_crafting_progress WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      assert.match(String(response), /kuşanılmış/i);
      assert.equal(Number(inventory.rows[0].quantity), 1);
      assert.equal(materials.rowCount, 0);
      assert.equal(progress.rowCount, 0);
    } finally {
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});


test('adventure route rewards, first-discovery bonus, route mastery and cooldown persist exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'adventure-route-' + randomUUID();
    const userId = testSnowflake('89');
    await ensureUser(guildId, userId);
    await pool.query("UPDATE users SET class_name='Gezgin',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
    const previousRandom = Math.random;
    Math.random = () => 0.99;
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: { getString: () => 'forest-grimoire' },
      reply: async payload => payload
    });
    try {
      for (let visit = 1; visit <= 3; visit++) {
        if (visit > 1) {
          await pool.query('UPDATE users SET last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
        }
        await adventureCommand.execute(makeInteraction());
      }
      const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const discovery = await pool.query(
        'SELECT discovery_key FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const mastery = await pool.query(
        'SELECT visits FROM adventure_route_mastery WHERE guild_id=$1 AND user_id=$2 AND route_key=$3',
        [guildId, userId, 'forest-grimoire']
      );
      const streak = await pool.query(
        'SELECT daily_streak,best_streak FROM adventure_streaks WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const history = await pool.query(
        'SELECT discovery_key,coins_awarded,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY id',
        [guildId, userId]
      );
      assert.equal(Number(player.rows[0].coins), 155, 'first-discovery, daily and third-route rewards must be credited once');
      assert.equal(Number(player.rows[0].xp), 130);
      assert.equal(discovery.rowCount, 1, 'repeating the same route must not create duplicate discovery rows');
      assert.equal(Number(mastery.rows[0].visits), 3);
      assert.equal(Number(streak.rows[0].daily_streak), 1, 'same-day visits must not increase the daily streak repeatedly');
      assert.equal(Number(streak.rows[0].best_streak), 1);
      assert.equal(history.rowCount, 3);
      assert.ok(history.rows.every(row => row.discovery_key === 'forest-grimoire'));
      const beforeCooldown = player.rows[0];
      await adventureCommand.execute(makeInteraction());
      const afterCooldown = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const historyAfterCooldown = await pool.query('SELECT COUNT(*)::int AS count FROM adventure_history WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      assert.deepEqual(afterCooldown.rows[0], beforeCooldown, 'cooldown rejection must not mutate player rewards');
      assert.equal(Number(historyAfterCooldown.rows[0].count), 3);
    } finally {
      Math.random = previousRandom;
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('five adventure map fragments complete one treasure map and grant exactly one persistent chest', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'adventure-map-' + randomUUID();
    const userId = testSnowflake('88');
    await ensureUser(guildId, userId);
    await pool.query("UPDATE users SET class_name='Muhafız',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
    const previousRandom = Math.random;
    Math.random = () => 0.1;
    const interaction = () => ({
      guildId,
      user: { id: userId },
      options: { getString: () => 'wandering-bakery' },
      reply: async payload => payload
    });
    try {
      for (let visit = 0; visit < 5; visit++) {
        if (visit > 0) await pool.query('UPDATE users SET last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
        await adventureCommand.execute(interaction());
      }
      const treasure = await pool.query(
        'SELECT fragments,treasures_opened FROM adventure_treasure_progress WHERE guild_id=$1 AND user_id=$2',
        [guildId, userId]
      );
      const inventory = await pool.query(
        "SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[])",
        [guildId, userId, ['🧩 Kadim Harita Parçası','🗝️ Kadim Hazine Sandığı']]
      );
      const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const history = await pool.query('SELECT COUNT(*)::int AS count FROM adventure_history WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      assert.equal(Number(treasure.rows[0].fragments), 0, 'the fifth fragment must complete and reset the map');
      assert.equal(Number(treasure.rows[0].treasures_opened), 1);
      assert.deepEqual(
        Object.fromEntries(inventory.rows.map(row => [row.item_key, Number(row.quantity)])),
        { '🗝️ Kadim Hazine Sandığı': 1, '🧩 Kadim Harita Parçası': 5 }
      );
      assert.equal(Number(player.rows[0].coins), 370, 'map completion and third-route rewards must be included exactly once');
      assert.equal(Number(player.rows[0].xp), 200);
      assert.equal(Number(history.rows[0].count), 5);
    } finally {
      Math.random = previousRandom;
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('rare-discovery pity guarantees the next undiscovered rare location at the twentieth adventure', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'adventure-pity-' + randomUUID();
    const userId = testSnowflake('87');
    await ensureUser(guildId, userId);
    await pool.query("UPDATE users SET class_name='Büyücü',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
    await pool.query(
      'INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,$3,59)',
      [guildId, userId, 'forest-grimoire']
    );
    const previousRandom = Math.random;
    Math.random = () => 0.99;
    try {
      await adventureCommand.execute({
        guildId,
        user: { id: userId },
        options: { getString: () => null },
        reply: async payload => payload
      });
      const rare = await pool.query(
        "SELECT discovery_key FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2 AND discovery_key='ancient-elf-sanctuary'",
        [guildId, userId]
      );
      const loot = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🌙 Efsunlu Elf Yadigârı'",
        [guildId, userId]
      );
      const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      assert.equal(rare.rowCount, 1);
      assert.equal(Number(loot.rows[0].quantity), 1);
      assert.equal(Number(player.rows[0].coins), 120);
      assert.equal(Number(player.rows[0].xp), 135, 'rare discovery, Mage class and first-day rewards must stack correctly');
    } finally {
      Math.random = previousRandom;
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('treasure chest opening consumes the requested quantity and atomically records rare loot and rewards', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'treasure-open-' + randomUUID();
    const userId = testSnowflake('86');
    await ensureUser(guildId, userId);
    await pool.query(
      "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',2)",
      [guildId, userId]
    );
    const previousRandom = Math.random;
    Math.random = () => 0.02;
    const makeInteraction = amount => ({
      guildId,
      user: { id: userId },
      options: { getInteger: () => amount },
      deferReply: async () => {},
      editReply: async payload => payload
    });
    try {
      await treasureCommand.execute(makeInteraction(3));
      const before = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const unopened = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",
        [guildId, userId]
      );
      assert.equal(Number(before.rows[0].coins), 0, 'an insufficient chest request must not pay rewards');
      assert.equal(Number(unopened.rows[0].quantity), 2, 'an insufficient chest request must preserve every chest');

      await treasureCommand.execute(makeInteraction(2));
      const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const chest = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",
        [guildId, userId]
      );
      const loot = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🪄 Frieren’in Kadim Asası'",
        [guildId, userId]
      );
      const openings = await pool.query(
        'SELECT loot_item,coins,xp FROM treasure_openings WHERE guild_id=$1 AND user_id=$2 ORDER BY id',
        [guildId, userId]
      );
      assert.equal(Number(player.rows[0].coins), 1000);
      assert.equal(Number(player.rows[0].xp), 700);
      assert.equal(chest.rowCount, 0);
      assert.equal(Number(loot.rows[0].quantity), 2);
      assert.equal(openings.rowCount, 2);
      assert.ok(openings.rows.every(row => row.loot_item === '🪄 Frieren’in Kadim Asası' && Number(row.coins) === 500 && Number(row.xp) === 350));
    } finally {
      Math.random = previousRandom;
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});

test('treasure opening rolls back chest consumption, loot history and rewards when inventory persistence fails', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'treasure-rollback-' + randomUUID();
    const userId = testSnowflake('85');
    await ensureUser(guildId, userId);
    await pool.query(
      "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',1)",
      [guildId, userId]
    );
    await pool.query(`CREATE OR REPLACE FUNCTION reject_treasure_loot_fixture() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced treasure loot failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER reject_treasure_loot_fixture BEFORE INSERT ON inventory
      FOR EACH ROW WHEN (NEW.item_key='👑 Himmel’in Efsanevi Yadigârı')
      EXECUTE FUNCTION reject_treasure_loot_fixture()`);
    const previousRandom = Math.random;
    Math.random = () => 0.005;
    try {
      await treasureCommand.execute({
        guildId,
        user: { id: userId },
        options: { getInteger: () => 1 },
        deferReply: async () => {},
        editReply: async payload => payload
      });
      const player = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      const chest = await pool.query(
        "SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",
        [guildId, userId]
      );
      const openings = await pool.query('SELECT COUNT(*)::int AS count FROM treasure_openings WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      assert.equal(Number(player.rows[0].coins), 0);
      assert.equal(Number(player.rows[0].xp), 0);
      assert.equal(Number(chest.rows[0].quantity), 1);
      assert.equal(Number(openings.rows[0].count), 0);
    } finally {
      Math.random = previousRandom;
      await pool.query('DROP TRIGGER IF EXISTS reject_treasure_loot_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_treasure_loot_fixture()');
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});


test('adventure streak day transitions grant stacked daily, third-day and 7/14/30-day milestone rewards exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const scenarios = [
      { days: 3, coins: 110, xp: 85 },
      { days: 7, coins: 210, xp: 155 },
      { days: 14, coins: 360, xp: 255 },
      { days: 30, coins: 860, xp: 585 }
    ];
    const previousRandom = Math.random;
    Math.random = () => 0.99;
    try {
      for (const scenario of scenarios) {
        const guildId = 'adventure-streak-' + randomUUID();
        const userId = 'adventure-streak-user-' + randomUUID();
        await ensureUser(guildId, userId);
        await pool.query(
          "UPDATE users SET coins=0,xp=0,level=1,class_name='Gezgin',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2",
          [guildId, userId]
        );
        await pool.query(
          'INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,best_streak,last_visit_date) VALUES($1,$2,$3,$3,CURRENT_DATE-1)',
          [guildId, userId, scenario.days - 1]
        );
        const responses = [];
        await adventureCommand.execute({
          guildId,
          user: { id: userId, username: 'StreakTest' },
          options: { getString: name => name === 'rota' ? 'mimic-trail' : null },
          reply: async payload => { responses.push(payload); return payload; }
        });
        const [player, streak, history] = await Promise.all([
          pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
          pool.query('SELECT daily_streak,best_streak,last_visit_date FROM adventure_streaks WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
          pool.query('SELECT coins_awarded,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1', [guildId, userId])
        ]);
        assert.equal(Number(streak.rows[0]?.daily_streak), scenario.days);
        assert.equal(Number(streak.rows[0]?.best_streak), scenario.days);
        assert.equal(Number(player.rows[0]?.coins), scenario.coins);
        assert.equal(Number(player.rows[0]?.xp), scenario.xp);
        assert.equal(Number(history.rows[0]?.coins_awarded), scenario.coins);
        assert.equal(Number(history.rows[0]?.xp_awarded), scenario.xp);
        const responseText = JSON.stringify(responses.map(response => response.embeds?.map(embed => embed.toJSON())));
        assert.ok(responseText.includes('Günlük seri: **' + scenario.days + ' gün**'));
        if (scenario.days === 3) assert.ok(responseText.includes('Seri ödülü: +50 altın, +30 XP'));
        if (scenario.days === 7) assert.ok(responseText.includes('7 günlük rekor serisi kilometre taşı'));
        if (scenario.days === 14) assert.ok(responseText.includes('14 günlük rekor serisi kilometre taşı'));
        if (scenario.days === 30) assert.ok(responseText.includes('30 günlük rekor serisi kilometre taşı'));
        await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      }
    } finally {
      Math.random = previousRandom;
    }
  });
});

test('a missed adventure day resets the current streak but preserves the all-time best record', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'adventure-streak-reset-' + randomUUID();
    const userId = 'adventure-streak-reset-user-' + randomUUID();
    await ensureUser(guildId, userId);
    await pool.query(
      "UPDATE users SET coins=0,xp=0,level=1,class_name='Gezgin',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2",
      [guildId, userId]
    );
    await pool.query(
      'INSERT INTO adventure_streaks(guild_id,user_id,daily_streak,best_streak,last_visit_date) VALUES($1,$2,8,12,CURRENT_DATE-2)',
      [guildId, userId]
    );
    const responses = [];
    const previousRandom = Math.random;
    try {
      Math.random = () => 0.99;
      await adventureCommand.execute({
        guildId,
        user: { id: userId, username: 'StreakResetTest' },
        options: { getString: name => name === 'rota' ? 'mimic-trail' : null },
        reply: async payload => { responses.push(payload); return payload; }
      });
    } finally {
      Math.random = previousRandom;
    }
    const streak = await pool.query(
      'SELECT daily_streak,best_streak FROM adventure_streaks WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    const responseText = JSON.stringify(responses.map(response => response.embeds?.map(embed => embed.toJSON())));
    assert.equal(Number(streak.rows[0]?.daily_streak), 1);
    assert.equal(Number(streak.rows[0]?.best_streak), 12);
    assert.ok(responseText.includes('Günlük seri:') && responseText.includes('12 gün'), responseText);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  });
});

test('completing every adventure journal location grants the completion reward once, even after a replay', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'adventure-journal-' + randomUUID();
    const userId = 'adventure-journal-user-' + randomUUID();
    await ensureUser(guildId, userId);
    await pool.query(
      "UPDATE users SET coins=0,xp=0,level=1,class_name='Gezgin',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2",
      [guildId, userId]
    );
    await pool.query(
      'INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) SELECT $1,$2,unnest($3::text[]) ON CONFLICT DO NOTHING',
      [guildId, userId, ADVENTURE_DISCOVERIES.map(entry => entry.key)]
    );
    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId, username: 'JournalTest' },
      options: { getString: name => name === 'rota' ? 'forest-grimoire' : null },
      reply: async payload => { responses.push(payload); return payload; }
    });
    const previousRandom = Math.random;
    let first;
    try {
      Math.random = () => 0.99;
      await adventureCommand.execute(makeInteraction());
      first = await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await pool.query('UPDATE users SET last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await adventureCommand.execute(makeInteraction());
    } finally {
      Math.random = previousRandom;
    }
    const [player, claim, history] = await Promise.all([
      pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
      pool.query('SELECT user_id FROM adventure_journal_claims WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
      pool.query('SELECT coins_awarded,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY id', [guildId, userId])
    ]);
    assert.equal(claim.rowCount, 1);
    assert.equal(Number(first.rows[0]?.coins), COMPLETE_ADVENTURE_JOURNAL_REWARD.coins + 40);
    assert.equal(Number(player.rows[0]?.coins), COMPLETE_ADVENTURE_JOURNAL_REWARD.coins + 65);
    assert.equal(Number(player.rows[0]?.xp), 60);
    assert.equal(history.rowCount, 2);
    assert.equal(Number(history.rows[0]?.coins_awarded), COMPLETE_ADVENTURE_JOURNAL_REWARD.coins + 40);
    assert.equal(Number(history.rows[1]?.coins_awarded), 25);
    const firstResponse = JSON.stringify(responses[0]?.embeds?.map(embed => embed.toJSON()));
    const secondResponse = JSON.stringify(responses[1]?.embeds?.map(embed => embed.toJSON()));
    assert.ok(firstResponse.includes('Keşif defterini tamamladın'));
    assert.ok(!secondResponse.includes('Keşif defterini tamamladın'));
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  });
});

test('rare discovery pity selects the remaining forgotten archive and dragon nest with class-specific rewards', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const scenarios = [
      {
        discovery: 'ancient-elf-sanctuary',
        className: 'Büyücü',
        alreadyFound: ['forgotten-grimoire', 'dragon-nest'],
        item: '🌙 Efsunlu Elf Yadigârı',
        coins: 120,
        xp: 135
      },
      {
        discovery: 'forgotten-grimoire',
        className: 'Büyücü',
        alreadyFound: ['ancient-elf-sanctuary', 'dragon-nest'],
        item: '📜 Frieren’in Kayıp Notları',
        coins: 110,
        xp: 105
      },
      {
        discovery: 'dragon-nest',
        className: 'Muhafız',
        alreadyFound: ['ancient-elf-sanctuary', 'forgotten-grimoire'],
        item: '🐉 Ejderha Pulu',
        coins: 160,
        xp: 125
      }
    ];
    const previousRandom = Math.random;
    Math.random = () => 0.99;
    try {
      for (const scenario of scenarios) {
        const guildId = 'rare-discovery-' + randomUUID();
        const userId = 'rare-discovery-user-' + randomUUID();
        await ensureUser(guildId, userId);
        await pool.query(
          'UPDATE users SET coins=0,xp=0,level=1,class_name=$3,last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2',
          [guildId, userId, scenario.className]
        );
        await pool.query(
          'INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,$3,19)',
          [guildId, userId, 'forest-grimoire']
        );
        await pool.query(
          'INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) SELECT $1,$2,unnest($3::text[]) ON CONFLICT DO NOTHING',
          [guildId, userId, scenario.alreadyFound]
        );
        const responses = [];
        await adventureCommand.execute({
          guildId,
          user: { id: userId, username: 'RareDiscoveryTest' },
          options: { getString: () => null },
          reply: async payload => { responses.push(payload); return payload; }
        });
        const [history, inventory, player, discovery] = await Promise.all([
          pool.query('SELECT discovery_key,first_discovery,coins_awarded,xp_awarded FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1', [guildId, userId]),
          pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3', [guildId, userId, scenario.item]),
          pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
          pool.query('SELECT discovery_key FROM adventure_discoveries WHERE guild_id=$1 AND user_id=$2 AND discovery_key=$3', [guildId, userId, scenario.discovery])
        ]);
        assert.equal(history.rows[0]?.discovery_key, scenario.discovery);
        assert.equal(history.rows[0]?.first_discovery, true);
        assert.equal(Number(history.rows[0]?.coins_awarded), scenario.coins);
        assert.equal(Number(history.rows[0]?.xp_awarded), scenario.xp);
        assert.equal(Number(inventory.rows[0]?.quantity), 1);
        assert.equal(Number(player.rows[0]?.coins), scenario.coins);
        assert.equal(Number(player.rows[0]?.xp), scenario.xp);
        assert.equal(discovery.rowCount, 1);
        const responseText = JSON.stringify(responses.map(response => response.embeds?.map(embed => embed.toJSON())));
        assert.ok(responseText.includes(scenario.item));
        await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      }
    } finally {
      Math.random = previousRandom;
    }
  });
});

test('treasure chest 1 percent Himmel and 3 percent Frieren rare drops use exact reward tiers', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'rare-treasure-' + randomUUID();
    const userId = 'rare-treasure-user-' + randomUUID();
    await ensureUser(guildId, userId);
    await pool.query('UPDATE users SET coins=0,xp=0,level=1 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    await pool.query(
      "INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',2)",
      [guildId, userId]
    );
    const rolls = [0.005, 0.01];
    let rollIndex = 0;
    const previousRandom = Math.random;
    try {
      Math.random = () => rolls[rollIndex++] ?? 0.99;
      await treasureCommand.execute({
        guildId,
        user: { id: userId },
        options: { getInteger: () => 2 },
        deferReply: async () => {},
        editReply: async payload => payload
      });
    } finally {
      Math.random = previousRandom;
    }
    const [player, openings, inventory, chest] = await Promise.all([
      pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
      pool.query('SELECT loot_item,coins,xp FROM treasure_openings WHERE guild_id=$1 AND user_id=$2 ORDER BY id', [guildId, userId]),
      pool.query(
        'SELECT item_key,quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=ANY($3::text[]) ORDER BY item_key',
        [guildId, userId, ['👑 Himmel’in Efsanevi Yadigârı', '🪄 Frieren’in Kadim Asası']]
      ),
      pool.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'", [guildId, userId])
    ]);
    assert.equal(openings.rowCount, 2);
    assert.deepEqual(openings.rows.map(row => row.loot_item), ['👑 Himmel’in Efsanevi Yadigârı', '🪄 Frieren’in Kadim Asası']);
    assert.deepEqual(openings.rows.map(row => Number(row.coins)), [800, 500]);
    assert.deepEqual(openings.rows.map(row => Number(row.xp)), [500, 350]);
    assert.equal(Number(player.rows[0]?.coins), 1300);
    assert.equal(Number(player.rows[0]?.xp), 850);
    assert.equal(inventory.rowCount, 2);
    assert.equal(chest.rowCount, 0);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  });
});


test('daily crafting mission rejects early claims, grants XP and stat points at three crafts, and cannot be claimed twice', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'daily-craft-mission-' + randomUUID();
    const userId = 'daily-craft-user-' + randomUUID();
    await ensureUser(guildId, userId);
    await pool.query(
      'UPDATE users SET coins=0,xp=99,level=1,stat_points=0 WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    await pool.query(
      'INSERT INTO daily_crafting_progress(guild_id,user_id,mission_date,crafted_items) VALUES($1,$2,CURRENT_DATE,2)',
      [guildId, userId]
    );
    const responses = [];
    const makeInteraction = () => ({
      guildId,
      user: { id: userId },
      options: { getBoolean: () => true },
      reply: async payload => { responses.push(payload); return payload; }
    });
    await craftingMissionCommand.execute(makeInteraction());
    const beforeCompletion = await pool.query(
      'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    assert.deepEqual(beforeCompletion.rows[0], { coins: 0, xp: 99, level: 1, stat_points: 0 });
    await pool.query(
      'UPDATE daily_crafting_progress SET crafted_items=3 WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
      [guildId, userId]
    );
    await craftingMissionCommand.execute(makeInteraction());
    const afterFirstClaim = await pool.query(
      'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    const claimed = await pool.query(
      'SELECT claimed_at FROM daily_crafting_progress WHERE guild_id=$1 AND user_id=$2 AND mission_date=CURRENT_DATE',
      [guildId, userId]
    );
    await craftingMissionCommand.execute(makeInteraction());
    const afterReplay = await pool.query(
      'SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    assert.deepEqual(afterFirstClaim.rows[0], { coins: 100, xp: 149, level: 2, stat_points: 1 });
    assert.ok(claimed.rows[0]?.claimed_at);
    assert.deepEqual(afterReplay.rows[0], afterFirstClaim.rows[0]);
    assert.match(String(responses[0]?.content), /ekipman üretmelisin/);
    assert.match(String(responses[1]?.content), /\\+100 altın/);
    assert.match(String(responses[2]?.content), /zaten aldın/);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  });
});

test('adventure and crafting achievement milestones grant their exact rewards once and reject replay claims', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const scenarios = [
      {
        key: 'rare_explorer', reward: 600,
        seed: async (guildId, userId) => pool.query(
          "INSERT INTO adventure_discoveries(guild_id,user_id,discovery_key) VALUES($1,$2,'ancient-elf-sanctuary'),($1,$2,'forgotten-grimoire'),($1,$2,'dragon-nest')",
          [guildId, userId]
        )
      },
      {
        key: 'treasure_map', reward: 300,
        seed: async (guildId, userId) => pool.query(
          'INSERT INTO adventure_treasure_progress(guild_id,user_id,fragments,treasures_opened) VALUES($1,$2,0,1)',
          [guildId, userId]
        )
      },
      {
        key: 'chest_opener_10', reward: 700,
        seed: async (guildId, userId) => pool.query(
          "INSERT INTO treasure_openings(guild_id,user_id,loot_item,coins,xp) SELECT $1,$2,'test-chest',0,0 FROM generate_series(1,10)",
          [guildId, userId]
        )
      },
      {
        key: 'route_master_10', reward: 350,
        seed: async (guildId, userId) => pool.query(
          "INSERT INTO adventure_route_mastery(guild_id,user_id,route_key,visits) VALUES($1,$2,'forest-grimoire',10)",
          [guildId, userId]
        )
      },
      ...[
        { key: 'craft_level_5', reward: 300, level: 5, crafts: 0, salvage: 0 },
        { key: 'craft_level_10', reward: 900, level: 10, crafts: 0, salvage: 0 },
        { key: 'craft_10', reward: 250, level: 1, crafts: 10, salvage: 0 },
        { key: 'craft_50', reward: 800, level: 1, crafts: 50, salvage: 0 },
        { key: 'salvage_10', reward: 250, level: 1, crafts: 0, salvage: 10 },
        { key: 'salvage_25', reward: 600, level: 1, crafts: 0, salvage: 25 }
      ].map(scenario => ({
        ...scenario,
        seed: async (guildId, userId) => pool.query(
          'INSERT INTO user_crafting_progress(guild_id,user_id,level,xp,successful_crafts,salvaged_items) VALUES($1,$2,$3,0,$4,$5)',
          [guildId, userId, scenario.level, scenario.crafts, scenario.salvage]
        )
      }))
    ];
    for (const scenario of scenarios) {
      const guildId = 'achievement-' + randomUUID();
      const userId = 'achievement-user-' + randomUUID();
      await ensureUser(guildId, userId);
      await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await scenario.seed(guildId, userId);
      const responses = [];
      const makeInteraction = () => ({
        guildId,
        user: { id: userId, username: 'AchievementTest' },
        options: { getString: () => scenario.key },
        deferReply: async () => {},
        editReply: async payload => { responses.push(payload); return payload; }
      });
      await achievementCommand.execute(makeInteraction());
      const first = await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
      await achievementCommand.execute(makeInteraction());
      const [afterReplay, claim] = await Promise.all([
        pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]),
        pool.query('SELECT achievement_key FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 AND achievement_key=$3', [guildId, userId, scenario.key])
      ]);
      assert.equal(Number(first.rows[0]?.coins), scenario.reward, scenario.key + ' must grant its configured reward');
      assert.equal(Number(afterReplay.rows[0]?.coins), scenario.reward, scenario.key + ' must not grant a duplicate reward');
      assert.equal(claim.rowCount, 1, scenario.key + ' must have one persistent claim');
      assert.match(String(responses[0]), /ödülünü aldın/);
      assert.match(String(responses[1]), /daha önce aldın/);
      await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
    }
  });
});


test('healer class grants its first-discovery bonus to adventure rewards', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = 'healer-adventure-' + randomUUID();
    const userId = 'healer-adventure-user-' + randomUUID();
    await ensureUser(guildId, userId);
    await pool.query(
      "UPDATE users SET coins=0,xp=0,level=1,class_name='Şifacı',last_adventure_at=NULL WHERE guild_id=$1 AND user_id=$2",
      [guildId, userId]
    );
    const responses = [];
    const previousRandom = Math.random;
    try {
      Math.random = () => 0.99;
      await adventureCommand.execute({
        guildId,
        user: { id: userId, username: 'HealerAdventureTest' },
        options: { getString: name => name === 'rota' ? 'mimic-trail' : null },
        reply: async payload => { responses.push(payload); return payload; }
      });
    } finally {
      Math.random = previousRandom;
    }
    const history = await pool.query(
      'SELECT coins_awarded,xp_awarded,first_discovery FROM adventure_history WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1',
      [guildId, userId]
    );
    assert.equal(Number(history.rows[0]?.coins_awarded), 60);
    assert.equal(Number(history.rows[0]?.xp_awarded), 60);
    assert.equal(history.rows[0]?.first_discovery, true);
    const responseText = JSON.stringify(responses.map(response => response.embeds?.map(embed => embed.toJSON())));
    assert.ok(responseText.includes('Şifacı yardım bonusu'));
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  });
});
