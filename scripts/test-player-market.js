import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import command from '../pazar.js';
import { getCommandFeatureKeys } from '../guild-feature-settings.js';
import { listPlayerMarketListings, createPlayerMarketOffer, listPlayerMarketOffers, resolvePlayerMarketOffer, cancelPlayerMarketOffer, getPlayerMarketOffers, normalizePlayerMarketPriceAlertInput, createPlayerMarketPriceAlert, listPlayerMarketPriceAlerts, cancelPlayerMarketPriceAlert, claimDuePlayerMarketPriceAlerts, markPlayerMarketPriceAlertNotified, releasePlayerMarketPriceAlertClaim } from '../player-market.js';

test('player market command exposes listing, purchase, cancellation and history actions', () => {
  const json = command.data.toJSON();
  assert.equal(json.name, 'pazar');
  assert.deepEqual(json.options.map(option => option.name), ['liste','sat','al','iptal','gecmis','teklif-ver','teklifler','teklif-kabul','teklif-reddet','teklif-iptal','alarm-kur','alarmlar','alarm-sil']);
  assert.equal(getCommandFeatureKeys('pazar').includes('playerMarket'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('economy'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('trading'), true);
});

test('main startup initializes player-market and adventurer portal schemas after base RPG tables', async () => {
  const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
  assert.match(source,/import \{ ensureAdventurerPlatformTables[\s\S]*?\} from '\.\/adventurer-platform\.js'/);
  assert.match(source,/import \{ ensurePlayerMarketTables, claimDuePlayerMarketPriceAlerts/);
  assert.match(source,/await initDatabase\(\);\s*await ensureAdventurerPlatformTables\(pool\);\s*await ensurePlayerMarketTables\(pool\);/);
});

test('web market filters are parameterized and use a fixed sort allowlist', async () => {
  const calls = [];
  const db = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ listing_id:'listing-1' }] }; } };
  const rows = await listPlayerMarketListings(db, '1539562273197260860', 20, { query:"Mana%' OR 1=1 --", minPrice:'100', maxPrice:'900', sort:'price_desc; DROP TABLE users' });
  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /POSITION\(LOWER\(\$2\) IN LOWER\(item_key\)\)/);
  assert.match(calls[0].sql, /price_coins >= \$3/);
  assert.match(calls[0].sql, /price_coins <= \$4/);
  assert.match(calls[0].sql, /ORDER BY price_coins ASC/);
  assert.doesNotMatch(calls[0].sql, /DROP TABLE/i);
  assert.equal(calls[0].params[1], "Mana%' OR 1=1 --");
  assert.deepEqual(calls[0].params.slice(2), [100,900,20]);
});
test('web market ignores out-of-range price filters and accepts only known sort values', async () => {
  const calls=[];
  const db={async query(sql,params){calls.push({sql,params});return{rows:[]};}};
  await listPlayerMarketListings(db,'1539562273197260860',20,{minPrice:'-1',maxPrice:'1000001',sort:'newest'});
  assert.match(calls[0].sql,/ORDER BY created_at DESC/);
  assert.doesNotMatch(calls[0].sql,/price_coins >=/);
  assert.doesNotMatch(calls[0].sql,/price_coins <=/);
  assert.deepEqual(calls[0].params,['1539562273197260860',20]);
});


test('player market exposes safe offer negotiation service entry points', () => {
  for (const action of [createPlayerMarketOffer, listPlayerMarketOffers, resolvePlayerMarketOffer, cancelPlayerMarketOffer, getPlayerMarketOffers]) {
    assert.equal(typeof action, 'function');
  }
});


test('player-market price alert input is normalized and rejects unsafe values', () => {
  assert.deepEqual(normalizePlayerMarketPriceAlertInput({ itemKey: '  Mana Kristali  ', targetPrice: 250 }), {
    itemKey: 'Mana Kristali', targetPrice: 250
  });
  assert.throws(() => normalizePlayerMarketPriceAlertInput({ itemKey: '', targetPrice: 250 }), /PLAYER_MARKET_ALERT_ITEM_INVALID/);
  assert.throws(() => normalizePlayerMarketPriceAlertInput({ itemKey: 'Mana', targetPrice: 0 }), /PLAYER_MARKET_ALERT_PRICE_INVALID/);
  assert.throws(() => normalizePlayerMarketPriceAlertInput({ itemKey: 'Mana', targetPrice: 1000001 }), /PLAYER_MARKET_ALERT_PRICE_INVALID/);
});

test('player-market price alert service exposes create, list, cancel and retry-safe delivery claims', () => {
  for (const action of [createPlayerMarketPriceAlert, listPlayerMarketPriceAlerts, cancelPlayerMarketPriceAlert,
    claimDuePlayerMarketPriceAlerts, markPlayerMarketPriceAlertNotified, releasePlayerMarketPriceAlertClaim]) {
    assert.equal(typeof action, 'function');
  }
});


test('creating a price alert locks the account, enforces the active cap and persists a one-shot target', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 1 };
      if (sql.includes('SELECT user_id FROM users')) return { rows: [{ user_id: '123456789012345678' }], rowCount: 1 };
      if (sql.includes('SELECT alert_id,status FROM player_market_price_alerts')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT COUNT(*)::int AS count FROM player_market_price_alerts')) return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.includes('INSERT INTO player_market_price_alerts')) return { rows: [{ alert_id: '123e4567-e89b-42d3-a456-426614174000', item_key: 'Mana Kristali', target_price: 250, status: 'active' }], rowCount: 1 };
      throw new Error('Unexpected query: ' + sql);
    },
    release() {}
  };
  const db = { connect: async () => client };
  const result = await createPlayerMarketPriceAlert(db, {
    guildId: '1539562273197260860', userId: '123456789012345678',
    itemKey: ' Mana Kristali ', targetPrice: 250
  });
  assert.equal(result.status, 'created');
  assert.equal(result.alert.item_key, 'Mana Kristali');
  assert.ok(calls.some(call => call.sql.includes('FOR UPDATE')));
  assert.ok(calls.some(call => call.sql.includes('INSERT INTO player_market_price_alerts')));
});

test('price-alert delivery claims are concurrent-safe and only match active listings at or below target', async () => {
  let captured;
  const db = { async query(sql, params) { captured = { sql, params }; return { rows: [], rowCount: 0 }; } };
  await claimDuePlayerMarketPriceAlerts(db, 15);
  assert.match(captured.sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(captured.sql, /LOWER\(l\.item_key\)=LOWER\(a\.item_key\)/);
  assert.match(captured.sql, /l\.price_coins<=a\.target_price/);
  assert.deepEqual(captured.params, [15]);
});


test('main runtime delivers price alerts by Discord DM, finalizes only after success and releases retryable failures',async()=>{
 const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
 const start=source.indexOf('async function processDuePlayerMarketPriceAlerts');
 const end=source.indexOf('let newsBirdSweepRunning',start);
 assert.ok(start>=0&&end>start,'price alert worker must exist');
 const worker=source.slice(start,end);
 assert.match(worker,/readyClient\.users\.fetch\(alert\.user_id\)/);
 assert.match(worker,/await user\.send\(/);
 assert.match(worker,/markPlayerMarketPriceAlertNotified\(pool, alert\.alert_id, alert\.claimed_at\)/);
 assert.match(worker,/releasePlayerMarketPriceAlertClaim\(pool, alert\.alert_id, alert\.claimed_at\)/);
 assert.match(worker,/cancelPlayerMarketPriceAlert\(pool, \{ guildId: alert\.guild_id, userId: alert\.user_id, alertId: alert\.alert_id \}\)/);
});
