import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
