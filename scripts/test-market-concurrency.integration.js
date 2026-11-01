import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { ensureUser, pool, withIsolatedTestSchema } from '../database/db.js';
import { buyMarketItem } from '../market.js';

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
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const snapshotResult = await db.query(
      'SELECT from_user_id,to_user_id FROM trade_offers WHERE offer_id=$1 AND guild_id=$2',
      [offerId, guildId]
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot || acceptingUserId !== snapshot.to_user_id) {
      await db.query('ROLLBACK');
      return false;
    }
    const locks = await db.query(
      'SELECT user_id FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE',
      [guildId, [snapshot.from_user_id, snapshot.to_user_id].sort()]
    );
    if (locks.rowCount !== 2) {
      await db.query('ROLLBACK');
      return false;
    }
    const offerResult = await db.query(
      'SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE',
      [offerId, guildId]
    );
    const offer = offerResult.rows[0];
    if (!offer || offer.status !== 'pending' || new Date(offer.expires_at).getTime() <= Date.now()) {
      await db.query('ROLLBACK');
      return false;
    }
    const found = await db.query(
      'SELECT character_name,quantity FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3 FOR UPDATE',
      [guildId, offer.from_user_id, offer.character_name]
    );
    const reserved = await db.query(
      `SELECT COALESCE(SUM(amount),0)::int AS amount FROM trade_offers
       WHERE guild_id=$1 AND from_user_id=$2 AND character_name=$3
       AND status='pending' AND expires_at>NOW() AND offer_id<>$4`,
      [guildId, offer.from_user_id, offer.character_name, offerId]
    );
    if (!found.rowCount || Number(found.rows[0].quantity)-Number(offer.amount)<Number(reserved.rows[0].amount)+1) {
      await db.query('ROLLBACK');
      return false;
    }
    const character = await db.query(
      'SELECT anime,rarity,emoji,color,description,traits,image FROM anime_character_collection WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId,offer.from_user_id,offer.character_name]
    );
    const c=character.rows[0];
    await db.query(
      'UPDATE anime_character_collection SET quantity=quantity-$4,last_obtained_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',
      [guildId,offer.from_user_id,offer.character_name,Number(offer.amount)]
    );
    await db.query(
      `INSERT INTO anime_character_collection
       (guild_id,user_id,character_name,anime,rarity,emoji,color,description,traits,image,quantity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(guild_id,user_id,character_name) DO UPDATE
       SET quantity=anime_character_collection.quantity+EXCLUDED.quantity,last_obtained_at=NOW()`,
      [guildId,offer.to_user_id,offer.character_name,c.anime,c.rarity,c.emoji,c.color,c.description,c.traits,c.image,Number(offer.amount)]
    );
    await db.query("UPDATE trade_offers SET status='accepted',resolved_at=NOW() WHERE offer_id=$1",[offerId]);
    await db.query('COMMIT');
    return true;
  } catch(error) {
    await db.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    db.release();
  }
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

test('a boss battle reward claim is idempotent under concurrent requests', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId=testSnowflake('91'), userId=testSnowflake('90'), battleId=randomUUID();
    await ensureUser(guildId,userId);
    const claim=()=>pool.query(
      `UPDATE users SET coins=coins+250,xp=xp+100,last_boss_battle_id=$3,
       boss_defeats=boss_defeats+1,last_boss_win_at=NOW()
       WHERE guild_id=$1 AND user_id=$2 AND last_boss_battle_id IS DISTINCT FROM $3
       RETURNING user_id`,
      [guildId,userId,battleId]
    );
    const outcomes=await Promise.all([claim(),claim()]);
    const player=await pool.query(
      'SELECT coins,xp,boss_defeats,last_boss_battle_id FROM users WHERE guild_id=$1 AND user_id=$2',
      [guildId,userId]
    );
    assert.equal(outcomes.reduce((n,r)=>n+r.rowCount,0),1,'only one concurrent claim may update the player');
    assert.equal(Number(player.rows[0].coins),250);
    assert.equal(Number(player.rows[0].xp),100);
    assert.equal(Number(player.rows[0].boss_defeats),1);
    assert.equal(player.rows[0].last_boss_battle_id,battleId);
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
