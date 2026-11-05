import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { initDatabase, pool, ensureUser, withIsolatedTestSchema } from '../database/db.js';
import {
  ensurePlayerMarketTables,
  createPlayerMarketListing,
  buyPlayerMarketListing,
  cancelPlayerMarketListing,
  listPlayerMarketListings,
  getPlayerMarketHistory,
  createPlayerMarketOffer,
  listPlayerMarketOffers,
  resolvePlayerMarketOffer,
  cancelPlayerMarketOffer,
  getPlayerMarketOffers
} from '../player-market.js';

const dedicatedAuditDatabase = /^postgres(?:ql)?:\/\/postgres:postgres@localhost:5432\/frieren_audit(?:\?|$)/.test(process.env.DATABASE_URL || '');

function snowflake(prefix) {
  return prefix + String(randomInt(0,1_000_000_000_000)).padStart(12,'0');
}

test('concurrent player-market purchases transfer escrowed inventory and coins exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91000'), sellerId=snowflake('92000'), buyerId=snowflake('93000');
    await ensureUser(guildId,sellerId);
    await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=$2',[guildId,sellerId]);
    await pool.query('UPDATE users SET coins=500 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,5)',[guildId,sellerId,'Mana Kristali']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Mana Kristali',quantity:3,priceCoins:300})).listing;
    const results=await Promise.all(Array.from({length:8},()=>buyPlayerMarketListing(pool,{guildId,buyerId,listingId:listing.listing_id})));
    assert.equal(results.filter(x=>x.status==='purchased').length,1);
    assert.equal(results.filter(x=>x.status==='unavailable').length,7);
    const balances=await pool.query('SELECT user_id,coins FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id',[guildId,[sellerId,buyerId]]);
    assert.equal(Number(balances.rows.find(x=>x.user_id===sellerId).coins),300);
    assert.equal(Number(balances.rows.find(x=>x.user_id===buyerId).coins),200);
    const items=await pool.query('SELECT user_id,quantity FROM inventory WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND item_key=$3 ORDER BY user_id',[guildId,[sellerId,buyerId],'Mana Kristali']);
    assert.equal(Number(items.rows.find(x=>x.user_id===sellerId).quantity),2);
    assert.equal(Number(items.rows.find(x=>x.user_id===buyerId).quantity),3);
    assert.equal((await getPlayerMarketHistory(pool,guildId,buyerId)).length,1);
    assert.equal((await listPlayerMarketListings(pool,guildId)).some(x=>x.listing_id===listing.listing_id),false);
  });
});

test('cancelling a player-market listing returns escrow exactly once', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91000'), sellerId=snowflake('94000'), intruderId=snowflake('98000');
    await ensureUser(guildId,sellerId);
    await ensureUser(guildId,intruderId);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,4)',[guildId,sellerId,'Gümüş Cevheri']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Gümüş Cevheri',quantity:2,priceCoins:80})).listing;
    assert.equal(Number((await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,sellerId,'Gümüş Cevheri'])).rows[0].quantity),2);
    assert.equal((await cancelPlayerMarketListing(pool,{guildId,sellerId:intruderId,listingId:listing.listing_id})).status,'not_owner');
    assert.equal((await cancelPlayerMarketListing(pool,{guildId,sellerId,listingId:listing.listing_id})).status,'cancelled');
    assert.equal((await cancelPlayerMarketListing(pool,{guildId,sellerId,listingId:listing.listing_id})).status,'unavailable');
    assert.equal(Number((await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,sellerId,'Gümüş Cevheri'])).rows[0].quantity),4);
  });
});

test('player-market purchase rejects self-buy and insufficient balance without mutating listing or inventory', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91000'), sellerId=snowflake('95000'), buyerId=snowflake('96000');
    await ensureUser(guildId,sellerId);
    await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[sellerId,buyerId]]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',[guildId,sellerId,'Işık Taşı']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Işık Taşı',quantity:1,priceCoins:500})).listing;
    assert.equal((await buyPlayerMarketListing(pool,{guildId,buyerId:sellerId,listingId:listing.listing_id})).status,'self_purchase');
    assert.equal((await buyPlayerMarketListing(pool,{guildId,buyerId,listingId:listing.listing_id})).status,'insufficient_funds');
    const row=await pool.query('SELECT status FROM player_market_listings WHERE listing_id=$1',[listing.listing_id]);
    assert.equal(row.rows[0].status,'active');
    assert.equal(Number((await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,sellerId])).rows[0].coins),0);
  });
});

test('equipped gear cannot be escrowed into the player market', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91000'), sellerId=snowflake('97000');
    await ensureUser(guildId,sellerId);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',[guildId,sellerId,'Equipped Sword']);
    await pool.query("INSERT INTO user_equipment(guild_id,user_id,slot,item_key) VALUES($1,$2,'weapon',$3)",[guildId,sellerId,'Equipped Sword']);
    const result=await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Equipped Sword',quantity:1,priceCoins:100});
    assert.equal(result.status,'equipped_item');
    assert.equal(Number((await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,sellerId,'Equipped Sword'])).rows[0].quantity),1);
    assert.equal((await pool.query("SELECT 1 FROM player_market_listings WHERE guild_id=$1 AND seller_id=$2",[guildId,sellerId])).rowCount,0);
  });
});

test('failed player-market item delivery rolls back buyer debit, seller credit and sale status', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91000'), sellerId=snowflake('95000'), buyerId=snowflake('96000');
    await ensureUser(guildId,sellerId);
    await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=$2',[guildId,sellerId]);
    await pool.query('UPDATE users SET coins=500 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,2)',[guildId,sellerId,'Market Rollback Relic']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Market Rollback Relic',quantity:1,priceCoins:300})).listing;
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_player_market_delivery_fixture() RETURNS trigger AS $player_market$
      BEGIN
        IF NEW.user_id LIKE '96000%' AND NEW.item_key='Market Rollback Relic' THEN
          RAISE EXCEPTION 'forced player market delivery failure';
        END IF;
        RETURN NEW;
      END;
      $player_market$ LANGUAGE plpgsql
    `);
    await pool.query(`CREATE TRIGGER reject_player_market_delivery_fixture BEFORE INSERT ON inventory
      FOR EACH ROW EXECUTE FUNCTION reject_player_market_delivery_fixture()`);
    try {
      await assert.rejects(
        buyPlayerMarketListing(pool,{guildId,buyerId,listingId:listing.listing_id}),
        /forced player market delivery failure/
      );
      const balances=await pool.query('SELECT user_id,coins FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id',[guildId,[sellerId,buyerId]]);
      assert.equal(Number(balances.rows.find(x=>x.user_id===sellerId).coins),0);
      assert.equal(Number(balances.rows.find(x=>x.user_id===buyerId).coins),500);
      assert.equal((await pool.query('SELECT status FROM player_market_listings WHERE listing_id=$1',[listing.listing_id])).rows[0].status,'active');
      assert.equal((await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,sellerId,'Market Rollback Relic'])).rows[0].quantity,1);
      assert.equal((await pool.query('SELECT 1 FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,buyerId,'Market Rollback Relic'])).rowCount,0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS reject_player_market_delivery_fixture ON inventory');
      await pool.query('DROP FUNCTION IF EXISTS reject_player_market_delivery_fixture()');
    }
  });
});

test.after(async()=>{ await pool.end(); });


test('market offers are unique per buyer, seller acceptance settles item and coins atomically', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();
    await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91100'),sellerId=snowflake('92100'),buyerId=snowflake('93100');
    await ensureUser(guildId,sellerId);await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=$2',[guildId,sellerId]);
    await pool.query('UPDATE users SET coins=500 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,4)',[guildId,sellerId,'Offer Crystal']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Offer Crystal',quantity:2,priceCoins:400})).listing;
    const offers=await Promise.all([
      createPlayerMarketOffer(pool,{guildId,buyerId,listingId:listing.listing_id,offerCoins:300}),
      createPlayerMarketOffer(pool,{guildId,buyerId,listingId:listing.listing_id,offerCoins:320})
    ]);
    assert.equal(offers.filter(x=>x.status==='offer_created').length,1);
    assert.equal(offers.filter(x=>x.status==='already_offered').length,1);
    const offer=offers.find(x=>x.status==='offer_created').offer;
    assert.equal(Number((await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId])).rows[0].coins),500,'creating a non-binding offer must not reserve buyer coins');
    const sellerView=await listPlayerMarketOffers(pool,{guildId,actorId:sellerId,listingId:listing.listing_id});
    assert.equal(sellerView.status,'listed');assert.equal(sellerView.offers.length,1);
    const accepted=await resolvePlayerMarketOffer(pool,{guildId,sellerId,offerId:offer.offer_id,decision:'accept'});
    assert.equal(accepted.status,'accepted');
    assert.equal(Number(accepted.offerCoins),300);
    const balances=await pool.query('SELECT user_id,coins FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[sellerId,buyerId]]);
    assert.equal(Number(balances.rows.find(x=>x.user_id===sellerId).coins),300);
    assert.equal(Number(balances.rows.find(x=>x.user_id===buyerId).coins),200);
    const items=await pool.query('SELECT user_id,quantity FROM inventory WHERE guild_id=$1 AND user_id=ANY($2::text[]) AND item_key=$3',[guildId,[sellerId,buyerId],'Offer Crystal']);
    assert.equal(Number(items.rows.find(x=>x.user_id===sellerId).quantity),2);
    assert.equal(Number(items.rows.find(x=>x.user_id===buyerId).quantity),2);
    const history=await getPlayerMarketOffers(pool,guildId,sellerId);
    assert.equal(history.some(x=>x.offer_id===offer.offer_id&&x.status==='accepted'),true);
    assert.equal((await resolvePlayerMarketOffer(pool,{guildId,sellerId,offerId:offer.offer_id,decision:'accept'})).status,'unavailable');
  });
});

test('market offer rejection and buyer cancellation leave listing and balances unchanged', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91200'),sellerId=snowflake('92200'),buyerId=snowflake('93200');
    await ensureUser(guildId,sellerId);await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=700 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,2)',[guildId,sellerId,'Silver Leaf']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Silver Leaf',quantity:1,priceCoins:250})).listing;
    const first=(await createPlayerMarketOffer(pool,{guildId,buyerId,listingId:listing.listing_id,offerCoins:200})).offer;
    assert.equal((await resolvePlayerMarketOffer(pool,{guildId,sellerId,offerId:first.offer_id,decision:'reject'})).status,'rejected');
    const second=(await createPlayerMarketOffer(pool,{guildId,buyerId,listingId:listing.listing_id,offerCoins:210})).offer;
    assert.equal((await cancelPlayerMarketOffer(pool,{guildId,buyerId,offerId:second.offer_id})).status,'cancelled');
    const listingRow=await pool.query('SELECT status FROM player_market_listings WHERE listing_id=$1',[listing.listing_id]);
    assert.equal(listingRow.rows[0].status,'active');
    assert.equal(Number((await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId])).rows[0].coins),700);
    const statuses=await pool.query('SELECT status FROM player_market_offers WHERE listing_id=$1 ORDER BY created_at',[listing.listing_id]);
    assert.deepEqual(statuses.rows.map(x=>x.status),['rejected','cancelled']);
  });
});

test('market offer acceptance checks buyer funds at acceptance and leaves an unaffordable offer pending', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91300'),sellerId=snowflake('92300'),buyerId=snowflake('93300');
    await ensureUser(guildId,sellerId);await ensureUser(guildId,buyerId);
    await pool.query('UPDATE users SET coins=50 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',[guildId,sellerId,'Frost Rune']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Frost Rune',quantity:1,priceCoins:500})).listing;
    const offer=(await createPlayerMarketOffer(pool,{guildId,buyerId,listingId:listing.listing_id,offerCoins:100})).offer;
    assert.equal((await resolvePlayerMarketOffer(pool,{guildId,sellerId,offerId:offer.offer_id,decision:'accept'})).status,'insufficient_funds');
    assert.equal((await pool.query('SELECT status FROM player_market_listings WHERE listing_id=$1',[listing.listing_id])).rows[0].status,'active');
    assert.equal((await pool.query('SELECT status FROM player_market_offers WHERE offer_id=$1',[offer.offer_id])).rows[0].status,'pending');
    await pool.query('UPDATE users SET coins=200 WHERE guild_id=$1 AND user_id=$2',[guildId,buyerId]);
    assert.equal((await resolvePlayerMarketOffer(pool,{guildId,sellerId,offerId:offer.offer_id,decision:'accept'})).status,'accepted');
  });
});

test('direct purchase and seller cancellation close outstanding offers without locking buyer funds', {
  skip: !dedicatedAuditDatabase && 'Requires disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    await initDatabase();await ensurePlayerMarketTables(pool);
    const guildId=snowflake('91400'),sellerId=snowflake('92400'),buyerId=snowflake('93400'),otherBuyer=snowflake('94400');
    await ensureUser(guildId,sellerId);await ensureUser(guildId,buyerId);await ensureUser(guildId,otherBuyer);
    await pool.query('UPDATE users SET coins=1000 WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,[buyerId,otherBuyer]]);
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,2)',[guildId,sellerId,'Moon Herb']);
    const listing=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Moon Herb',quantity:1,priceCoins:300})).listing;
    const offer=(await createPlayerMarketOffer(pool,{guildId,buyerId:otherBuyer,listingId:listing.listing_id,offerCoins:250})).offer;
    assert.equal((await buyPlayerMarketListing(pool,{guildId,buyerId,listingId:listing.listing_id})).status,'purchased');
    assert.equal((await pool.query('SELECT status FROM player_market_offers WHERE offer_id=$1',[offer.offer_id])).rows[0].status,'rejected');
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1)',[guildId,sellerId,'Star Petal']);
    const second=(await createPlayerMarketListing(pool,{guildId,sellerId,itemKey:'Star Petal',quantity:1,priceCoins:100})).listing;
    const secondOffer=(await createPlayerMarketOffer(pool,{guildId,buyerId:otherBuyer,listingId:second.listing_id,offerCoins:80})).offer;
    assert.equal((await cancelPlayerMarketListing(pool,{guildId,sellerId,listingId:second.listing_id})).status,'cancelled');
    assert.equal((await pool.query('SELECT status FROM player_market_offers WHERE offer_id=$1',[secondOffer.offer_id])).rows[0].status,'rejected');
    assert.equal(Number((await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,otherBuyer])).rows[0].coins),1000);
  });
});
