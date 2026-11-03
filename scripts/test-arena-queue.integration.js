import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import { ensureArenaTables, enqueueArenaPlayer, getArenaQueueStatus } from '../arena-queue.js';

function assertIsolatedAuditDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/frieren_audit') {
    throw new Error('Arena integration tests require the isolated local frieren_audit database.');
  }
}

test('PostgreSQL arena matchmaking atomically creates two complete matches from twelve concurrent joins', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureArenaTables(pool);
  const guildId = '99000000000000001';
  const runId = randomUUID().replaceAll('-', '').slice(0, 8);
  const userIds = Array.from({ length: 12 }, (_, index) => String(70000000000000000n + BigInt(parseInt(runId.slice(0, 4), 16)) * 100n + BigInt(index + 1)));
  const safeUserIds = userIds.map(id => id.slice(0, 17));
  for (const userId of safeUserIds) await ensureUser(guildId, userId);

  try {
    const joins = await Promise.all(safeUserIds.map((userId, index) =>
      enqueueArenaPlayer(pool, { guildId, userId, rating: 900 + index * 20 })
    ));
    assert.equal(joins.filter(result => result.status === 'matched').length, 2, 'one join call creates each of the two complete matches');
    assert.equal(joins.length, 12);
    const matches = await pool.query(
      `SELECT m.match_id, COUNT(p.user_id)::int AS player_count,
              COUNT(*) FILTER (WHERE p.team='A')::int AS team_a_count,
              COUNT(*) FILTER (WHERE p.team='B')::int AS team_b_count,
              COUNT(DISTINCT p.user_id)::int AS unique_players
       FROM arena_matches m JOIN arena_match_players p USING(match_id)
       WHERE m.guild_id=$1 AND m.status='active'
       GROUP BY m.match_id ORDER BY m.match_id`,
      [guildId]
    );
    assert.equal(matches.rowCount, 2);
    for (const match of matches.rows) {
      assert.equal(match.player_count, 6);
      assert.equal(match.unique_players, 6);
      assert.equal(match.team_a_count, 3);
      assert.equal(match.team_b_count, 3);
    }
    const queue = await getArenaQueueStatus(pool, guildId, safeUserIds[0]);
    assert.equal(queue.status, 'in_match');
    await assert.rejects(
      enqueueArenaPlayer(pool, { guildId, userId: safeUserIds[0], rating: 1000 }),
      error => error.code === 'ARENA_PLAYER_ALREADY_IN_MATCH'
    );
  } finally {
    await pool.query('DELETE FROM arena_matches WHERE guild_id=$1', [guildId]);
    await pool.query('DELETE FROM arena_queue WHERE guild_id=$1 AND user_id = ANY($2::text[])', [guildId, safeUserIds]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id = ANY($2::text[])', [guildId, safeUserIds]);
  }
});

test('arena matchmaking rolls back the sixth join when one queued player has invalid combat stats', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureArenaTables(pool);
  const guildId = '99000000000000002';
  const runId = randomUUID().replaceAll('-', '').slice(0, 8);
  const userIds = Array.from({ length: 6 }, (_, index) => String(80000000000000000n + BigInt(parseInt(runId.slice(0,4), 16)) * 100n + BigInt(index + 1)).slice(0, 17));
  for (const userId of userIds) await ensureUser(guildId, userId);
  try {
    for (const userId of userIds.slice(0, 5)) {
      const result = await enqueueArenaPlayer(pool, { guildId, userId, rating: 1000 });
      assert.equal(result.status, 'queued');
    }
    await pool.query('UPDATE users SET hp=0 WHERE guild_id=$1 AND user_id=$2', [guildId, userIds[5]]);
    await assert.rejects(
      enqueueArenaPlayer(pool, { guildId, userId: userIds[5], rating: 1000 }),
      /ARENA_HP_INVALID/
    );
    const queued = await pool.query('SELECT COUNT(*)::int AS count FROM arena_queue WHERE guild_id=$1 AND user_id=ANY($2::text[])', [guildId, userIds]);
    assert.equal(queued.rows[0].count, 5, 'the failed sixth join must roll back without deleting the five existing queue entries');
    const matches = await pool.query('SELECT COUNT(*)::int AS count FROM arena_matches WHERE guild_id=$1', [guildId]);
    assert.equal(matches.rows[0].count, 0, 'a partially created match must not survive the failed transaction');
  } finally {
    await pool.query('DELETE FROM arena_queue WHERE guild_id=$1 AND user_id=ANY($2::text[])', [guildId, userIds]);
    await pool.query('DELETE FROM arena_matches WHERE guild_id=$1', [guildId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])', [guildId, userIds]);
  }
});
