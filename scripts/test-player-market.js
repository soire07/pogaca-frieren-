import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import command from '../pazar.js';
import { getCommandFeatureKeys } from '../guild-feature-settings.js';
import { listPlayerMarketListings, createPlayerMarketOffer, listPlayerMarketOffers, resolvePlayerMarketOffer, cancelPlayerMarketOffer, getPlayerMarketOffers } from '../player-market.js';

test('player market command exposes listing, purchase, cancellation and history actions', () => {
  const json = command.data.toJSON();
  assert.equal(json.name, 'pazar');
  assert.deepEqual(json.options.map(option => option.name), ['liste','sat','al','iptal','gecmis','teklif-ver','teklifler','teklif-kabul','teklif-reddet','teklif-iptal']);
  assert.equal(getCommandFeatureKeys('pazar').includes('playerMarket'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('economy'), true);
  assert.equal(getCommandFeatureKeys('pazar').includes('trading'), true);
});

test('main startup initializes player-market and adventurer portal schemas after base RPG tables', async () => {
  const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
  assert.match(source,/import \{ ensureAdventurerPlatformTables[\s\S]*?\} from '\.\/adventurer-platform\.js'/);
  assert.match(source,/import \{ ensurePlayerMarketTables \} from '\.\/player-market\.js'/);
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
