import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import { ensureArenaTables, enqueueArenaPlayer, getArenaQueueStatus, submitArenaTurn } from '../arena-queue.js';

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
    const match = await pool.query('SELECT match_id,state FROM arena_matches WHERE guild_id=$1 ORDER BY created_at LIMIT 1', [guildId]);
    const current = match.rows[0].state.players[match.rows[0].state.turnIndex];
    const target = match.rows[0].state.players.find(player => player.team !== current.team && player.alive);
    const simultaneousTurns = await Promise.allSettled([
      submitArenaTurn(pool, { guildId, matchId: match.rows[0].match_id, actorId: current.userId, action: 'attack', targetId: target.userId }),
      submitArenaTurn(pool, { guildId, matchId: match.rows[0].match_id, actorId: current.userId, action: 'attack', targetId: target.userId })
    ]);
    assert.equal(simultaneousTurns.filter(result => result.status === 'fulfilled').length, 1,
      'row locking must allow only one of two duplicate simultaneous turns');
    const persisted = await pool.query('SELECT state FROM arena_matches WHERE match_id=$1', [match.rows[0].match_id]);
    assert.equal(persisted.rows[0].state.turnCount, 1);
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


test('PostgreSQL arena keeps 1v1 and 3v3 queues isolated and persists player elements', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureArenaTables(pool);
  const guildId='99000000000000003';
  const runId=randomUUID().replaceAll('-','').slice(0,8);
  const base=BigInt('81000000000000000')+BigInt(parseInt(runId.slice(0,4),16))*100n;
  const duelIds=[String(base+1n),String(base+2n)];
  const teamIds=Array.from({length:6},(_,index)=>String(base+BigInt(index+3)));
  const allIds=[...duelIds,...teamIds];
  for(const userId of allIds) await ensureUser(guildId,userId);
  try {
    const duelJoins=await Promise.all(duelIds.map((userId,index)=>enqueueArenaPlayer(pool,{
      guildId,userId,rating:1100+index*50,mode:'1v1',element:index===0?'fire':'ice'
    })));
    assert.equal(duelJoins.filter(result=>result.status==='matched').length,1);
    const duel=await pool.query(
      "SELECT state FROM arena_matches WHERE guild_id=$1 AND status='active' AND state->>'mode'='1v1'",
      [guildId]
    );
    assert.equal(duel.rowCount,1);
    assert.equal(duel.rows[0].state.players.length,2);
    assert.deepEqual(duel.rows[0].state.players.map(player=>player.element),['fire','ice']);

    const firstFive=await Promise.all(teamIds.slice(0,5).map((userId,index)=>enqueueArenaPlayer(pool,{
      guildId,userId,rating:900+index*10,mode:'3v3',element:'neutral'
    })));
    assert.ok(firstFive.every(result=>result.status==='queued'));
    const sixth=await enqueueArenaPlayer(pool,{guildId,userId:teamIds[5],rating:1000,mode:'3v3',element:'lightning'});
    assert.equal(sixth.status,'matched');
    const matches=await pool.query(
      "SELECT state,COUNT(p.user_id)::int AS player_count FROM arena_matches m JOIN arena_match_players p USING(match_id) WHERE m.guild_id=$1 AND m.status='active' GROUP BY m.match_id,state->>'mode',state ORDER BY state->>'mode'",
      [guildId]
    );
    assert.equal(matches.rowCount,2);
    const modes=matches.rows.map(row=>({mode:row.state.mode,count:row.player_count})).sort((a,b)=>a.mode.localeCompare(b.mode));
    assert.deepEqual(modes,[{mode:'1v1',count:2},{mode:'3v3',count:6}]);
    assert.equal((await getArenaQueueStatus(pool,guildId,duelIds[0])).status,'in_match');
    assert.equal((await getArenaQueueStatus(pool,guildId,teamIds[0])).status,'in_match');
  } finally {
    await pool.query('DELETE FROM arena_matches WHERE guild_id=$1',[guildId]);
    await pool.query('DELETE FROM arena_queue WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,allIds]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,allIds]);
  }
});
