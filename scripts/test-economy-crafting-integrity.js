import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('market purchases serialize the player before charging and never allow a negative balance', async () => {
  const market = await read('market.js');
  const schema = await read('database/db.js');
  const begin = market.indexOf("await db.query('BEGIN')");
  const playerLock = market.indexOf('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const debit = market.indexOf('UPDATE users SET coins=coins-$3', playerLock);
  const inventory = market.indexOf('INSERT INTO inventory', debit);
  const commit = market.indexOf("await db.query('COMMIT')", inventory);

  assert.ok(begin >= 0 && playerLock > begin && debit > playerLock && inventory > debit && commit > inventory,
    'purchase must lock the player, debit coins, write inventory and commit in that order');
  assert.match(market, /coins >= \$3 RETURNING coins/);
  assert.match(market, /Number\.isSafeInteger\(item\.price\).*item\.price<=0/);
  assert.match(market, /if\(!player\.rowCount\)/);
  assert.match(market, /await db\.query\('ROLLBACK'\)/);
  assert.match(schema, /coins INTEGER NOT NULL DEFAULT 0 CHECK \(coins >= 0\)/);
  assert.match(schema, /quantity INTEGER NOT NULL DEFAULT 1 CHECK \(quantity > 0\)/);
});

test('crafting validates bounded quantities and serializes the player before material locks', async () => {
  const craft = await read('zanaat.js');
  const begin = craft.indexOf("await db.query('BEGIN')");
  const playerLock = craft.indexOf('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const profession = craft.indexOf('SELECT level FROM user_crafting_progress', playerLock);
  const materialLock = craft.indexOf('SELECT quantity FROM inventory', profession);
  const consumeDelete = craft.indexOf('DELETE FROM inventory', materialLock);
  const consumeUpdate = craft.indexOf('UPDATE inventory SET quantity=quantity-$4', consumeDelete);
  const output = craft.indexOf('INSERT INTO inventory', consumeUpdate);
  const progress = craft.indexOf('INSERT INTO user_crafting_progress', output);
  const commit = craft.indexOf("await db.query('COMMIT')", progress);

  assert.match(craft, /Number\.isInteger\(amount\).*amount < 1 \|\| amount > 5/);
  assert.ok(begin >= 0 && playerLock > begin && profession > playerLock && materialLock > profession,
    'crafting must lock the player before reading/locking materials');
  assert.ok(consumeDelete > materialLock && consumeUpdate > consumeDelete && output > consumeUpdate && progress > output && commit > progress,
    'material consumption, output, crafting XP and daily progress must be one transaction');
  assert.match(craft, /quantity=\$4 RETURNING item_key/);
  assert.match(craft, /quantity>\$4 RETURNING quantity/);
  assert.match(craft, /if \(!consumed\.rowCount\) throw new Error/);
  assert.match(craft, /await db\.query\('ROLLBACK'\)/);
  assert.match(craft, /if \(!playerLock\.rowCount\)/);
});

test('trade offers reserve only unexpired copies using the database clock', async () => {
  const create = await read('takasteklif.js');
  const handler = await read('index.js');
  const schema = await read('database/db.js');
  const begin = create.indexOf("await db.query('BEGIN')");
  const playerLock = create.indexOf('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const collectionLock = create.indexOf('FROM anime_character_collection', playerLock);
  const reserve = create.indexOf("status='pending' AND expires_at>NOW()", collectionLock);
  const insert = create.indexOf("NOW()+INTERVAL '5 minutes'", reserve);

  assert.ok(begin >= 0 && playerLock > begin && collectionLock > playerLock && reserve > collectionLock && insert > reserve,
    'trade creation must serialize the sender, verify collection copies, reserve active offers and use database time');
  assert.doesNotMatch(create, /Date\.now\(\)\s*\+\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(schema, /status IN \('pending','accepted','declined','expired','invalid'\)/);

  const trade = await read('trade-transaction.js');
  const snapshot = trade.indexOf('SELECT from_user_id,to_user_id FROM trade_offers');
  const players = trade.indexOf('ORDER BY user_id FOR UPDATE', snapshot);
  const offer = trade.indexOf('SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE', players);
  const collection = trade.indexOf('FROM anime_character_collection', offer);
  assert.ok(snapshot >= 0 && players > snapshot && offer > players && collection > offer,
    'production acceptance must lock participant rows, then the offer, then the collection');
  assert.ok(trade.includes("offer.status !== 'pending'"));
  assert.match(trade, /status='accepted'/);
  assert.match(trade, /reservedForOthers/);
  assert.ok(handler.includes('resolveTradeOffer(pool'));
});
