import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('trade offers are persistent, expiring and single-use', async () => {
  const schema = await read('database/db.js');
  const handler = await read('index.js');
  const command = await read('takasteklif.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS trade_offers/);
  assert.ok(schema.includes("status IN ('pending','accepted','declined','expired','invalid')"), 'trade status constraint missing');
  assert.match(schema, /idx_trade_offers_pending_sender ON trade_offers\(guild_id, from_user_id, character_name, expires_at\) WHERE status='pending'/);
  assert.match(command, /setAutocomplete\(true\)/);
  assert.match(command, /FOR UPDATE/);
  assert.match(command, /reservedAmount/);
  assert.match(handler, /reservedForOthers/);
  assert.match(command, /Date\.now\(\)\+5\*60\*1000/);
  assert.match(handler, /SELECT \* FROM trade_offers WHERE offer_id=\$1 AND guild_id=\$2 FOR UPDATE/);
  assert.match(handler, /interaction\.user\.id !== offer\.to_user_id/);
  assert.match(handler, /status='accepted'/);
  assert.match(handler, /quantity=quantity-\$4/);
  assert.match(handler, /quantity=anime_character_collection\.quantity\+EXCLUDED\.quantity/);
});

test('daily mission progress and reward claim stay in one transaction', async () => {
  const source = await read('gunlukgorev.js');
  const begin = source.indexOf("await db.query('BEGIN')");
  const progress = source.indexOf('const progress=await db.query(mission.sql');
  const claim = source.indexOf('INSERT INTO daily_mission_claims');
  const commit = source.indexOf("await db.query('COMMIT')", claim);
  assert.ok(begin >= 0 && progress > begin && claim > progress && commit > claim,
    'progress must be checked after BEGIN and before the claim is committed');
  assert.match(source, /if\(!progress\.rows\[0\]\?\.done\)\{await db\.query\('ROLLBACK'\)/);
});

test('collection rarity filters expose all supported rarities and preserve pagination state', async () => {
  const source = await read('koleksiyon.js');
  for (const rarity of ['Hepsi', 'Gizemli', 'Efsanevi', 'Destansı', 'Nadir', 'Yaygın']) {
    assert.ok(source.includes(`value: '${rarity}'`), `missing rarity option: ${rarity}`);
  }
  assert.match(source, /rarityFilter\)\);/);
  assert.match(source, /button\.update\(makePage\(target, rows, page, rarityFilter\)\)/);
});
