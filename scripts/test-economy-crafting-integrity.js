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

  const trade = handler.slice(handler.indexOf("trade_accept:"));
  const players = trade.indexOf('ORDER BY user_id FOR UPDATE');
  const offer = trade.indexOf('SELECT * FROM trade_offers WHERE offer_id=$1 AND guild_id=$2 FOR UPDATE');
  const collection = trade.indexOf('FROM anime_character_collection', offer);
  assert.ok(players >= 0 && offer > players && collection > offer,
    'acceptance must lock participant rows, then the offer, then the collection');
  assert.match(trade, /offer\.status !== 'pending'/);
  assert.match(trade, /status='accepted'/);
  assert.match(trade, /reservedForOthers/);
  assert.match(trade, /SELECT expires_at <= NOW\(\) AS expired FROM trade_offers WHERE offer_id=\$1 AND guild_id=\$2/);
  assert.match(trade, /if \(expiryResult\.rows\[0\]\.expired\)/);
  assert.doesNotMatch(trade, /new Date\(offer\.expires_at\).*Date\.now\(\)/);
});


test('treasure chest consumption, loot history, inventory and currency rewards commit atomically', async () => {
  const source = await read('hazineac.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const playerLock = source.indexOf('SELECT xp, level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const bagLock = source.indexOf("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı' FOR UPDATE", playerLock);
  const consume = source.indexOf("DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'", bagLock);
  const history = source.indexOf('INSERT INTO treasure_openings', bagLock);
  const inventoryReward = source.indexOf('INSERT INTO inventory', history);
  const currencyReward = source.indexOf('UPDATE users SET coins=coins+$3, xp=$4', inventoryReward);
  const commit = source.indexOf("await db.query('COMMIT')", currencyReward);

  assert.ok(begin >= 0 && playerLock > begin && bagLock > playerLock && consume > bagLock &&
    history > bagLock && inventoryReward > history && currencyReward > inventoryReward && commit > currencyReward,
    'chest count, loot history, item rewards, XP and coins must remain in one ordered transaction');
  assert.match(source, /if \(available < amount\)/);
  assert.match(source, /if \(available === amount\)/);
  assert.match(source, /await db\.query\('ROLLBACK'\)/);
});

test('daily quest claims serialize the player and atomically validate progress before paying once', async () => {
  const source = await read('gunlukgorev.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const playerLock = source.indexOf('SELECT class_name FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const progress = source.indexOf('getDailyQuestObjectiveSql(mission.objective_type)', playerLock);
  const claim = source.indexOf('INSERT INTO daily_mission_claims', progress);
  const reward = source.indexOf('UPDATE users SET coins=coins+$3', claim);
  const commit = source.indexOf("await db.query('COMMIT')", reward);

  assert.ok(begin >= 0 && playerLock > begin && progress > playerLock && claim > progress && reward > claim && commit > reward,
    'player lock, progress validation, unique claim, currency reward and commit must be ordered');
  assert.match(source, /ON CONFLICT DO NOTHING RETURNING mission_key/);
  assert.match(source, /VALUES\(\$1,\$2,CURRENT_DATE,'__class_daily_reward__'\)/);
  assert.match(source, /await db\.query\('ROLLBACK'\)/);
});

test('character stat spending locks available points and atomically enforces permanent stat caps', async () => {
  const source = await read('commands/rpg/gelisim.js');
  const begin = source.indexOf("await client.query('BEGIN')");
  const playerLock = source.indexOf('SELECT stat_points, hp, max_hp, mana, max_mana, attack, defense FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE', begin);
  const balanceCheck = source.indexOf('player.stat_points < points', playerLock);
  const capCheck = source.indexOf('current + increase > cap', balanceCheck);
  const statUpdate = source.indexOf('UPDATE users SET', capCheck);
  const reread = source.indexOf('SELECT stat_points, hp, max_hp, mana, max_mana, attack, defense FROM users', statUpdate);
  const commit = source.indexOf("await client.query('COMMIT')", reread);

  assert.ok(begin >= 0 && playerLock > begin && balanceCheck > playerLock && capCheck > balanceCheck &&
    statUpdate > capCheck && reread > statUpdate && commit > reread,
    'stat points must be locked, validated, spent, reread and committed in one transaction');
  assert.match(source, /const cap = stat === 'hp' \|\| stat === 'mana' \? 2000 : stat === 'attack' \? 500 : 250/);
  assert.match(source, /await client\.query\('ROLLBACK'\)/);
});
