import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import treasureCommand from '../hazineac.js';

function assertIsolatedAuditDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost','127.0.0.1','::1'].includes(url.hostname) || url.pathname !== '/frieren_audit') {
    throw new Error('Treasure integration tests require isolated local frieren_audit PostgreSQL.');
  }
}

test('treasure chest opening rolls back chest, loot, gold, XP and stat points on persistence failure', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  const guildId = '99000000000000105';
  const userId = String(75000000000000000n + BigInt(randomUUID().replaceAll('-','').slice(0,8), 16) % 9000000000000000n);
  await ensureUser(guildId,userId);
  await pool.query('UPDATE users SET coins=100,xp=390,level=2,stat_points=0 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  await pool.query("INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,'🗝️ Kadim Hazine Sandığı',2)",[guildId,userId]);
  await pool.query('DROP TRIGGER IF EXISTS frieren_test_fail_treasure_opening ON treasure_openings');
  await pool.query('DROP FUNCTION IF EXISTS frieren_test_fail_treasure_opening()');
  await pool.query(`CREATE FUNCTION frieren_test_fail_treasure_opening() RETURNS trigger AS $$
    BEGIN
      IF NEW.guild_id = '${guildId}' AND NEW.user_id = '${userId}' THEN
        RAISE EXCEPTION 'forced treasure opening failure';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`);
  await pool.query('CREATE TRIGGER frieren_test_fail_treasure_opening BEFORE INSERT ON treasure_openings FOR EACH ROW EXECUTE FUNCTION frieren_test_fail_treasure_opening()');

  try {
    const effects = [];
    const interaction = {
      guildId,
      user: { id: userId, username: 'TreasureRollbackTest' },
      options: { getInteger: () => 2 },
      deferReply: async () => effects.push({ type: 'deferReply' }),
      editReply: async payload => effects.push({ type: 'editReply', payload })
    };
    await treasureCommand.execute(interaction);
    const player = await pool.query('SELECT coins,xp,level,stat_points FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    const chest = await pool.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key='🗝️ Kadim Hazine Sandığı'",[guildId,userId]);
    const openings = await pool.query('SELECT COUNT(*)::int AS count FROM treasure_openings WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    const loot = await pool.query("SELECT COUNT(*)::int AS count FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key <> '🗝️ Kadim Hazine Sandığı'",[guildId,userId]);
    const reply = String(effects.find(effect => effect.type === 'editReply')?.payload || '');
    assert.match(reply,/Sandıkların korunması için işlem geri alındı/);
    assert.deepEqual(player.rows[0],{coins:100,xp:390,level:2,stat_points:0});
    assert.equal(Number(chest.rows[0]?.quantity),2);
    assert.equal(Number(openings.rows[0]?.count),0);
    assert.equal(Number(loot.rows[0]?.count),0);
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS frieren_test_fail_treasure_opening ON treasure_openings').catch(()=>{});
    await pool.query('DROP FUNCTION IF EXISTS frieren_test_fail_treasure_opening()').catch(()=>{});
    await pool.query('DELETE FROM treasure_openings WHERE guild_id=$1 AND user_id=$2',[guildId,userId]).catch(()=>{});
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]).catch(()=>{});
  }
});
