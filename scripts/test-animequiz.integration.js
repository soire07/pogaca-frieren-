import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { ensureUser, pool, withIsolatedTestSchema } from '../database/db.js';
import { awardAnimeQuizPoints } from '../animequiz.js';

const dedicatedAuditDatabase = /^postgres(?:ql)?:\/\/postgres:postgres@localhost:5432\/frieren_audit(?:\?|$)/.test(
  process.env.DATABASE_URL || ''
);
function testSnowflake(prefix) {
  return prefix + String(randomInt(0, 281_474_976_710_655)).padStart(15, '0');
}

test('concurrent correct anime quiz answers atomically increment guild-scoped points', {
  skip: !dedicatedAuditDatabase && 'Requires the disposable GitHub Actions frieren_audit PostgreSQL service'
}, async () => {
  await withIsolatedTestSchema(async () => {
    const guildId = testSnowflake('91');
    const userId = testSnowflake('90');
    await ensureUser(guildId, userId);

    await Promise.all(Array.from({ length: 10 }, () =>
      awardAnimeQuizPoints(pool, guildId, userId, 10)
    ));

    const result = await pool.query(
      'SELECT points,correct_answers FROM anime_quiz_scores WHERE guild_id=$1 AND user_id=$2',
      [guildId, userId]
    );
    assert.equal(Number(result.rows[0]?.points), 100);
    assert.equal(Number(result.rows[0]?.correct_answers), 10);

    const otherGuildId = testSnowflake('92');
    await ensureUser(otherGuildId, userId);
    await awardAnimeQuizPoints(pool, otherGuildId, userId, 10);
    const scoped = await pool.query(
      'SELECT points FROM anime_quiz_scores WHERE user_id=$1 ORDER BY guild_id',
      [userId]
    );
    assert.equal(scoped.rowCount, 2, 'the same player must have separate scores per guild');
    assert.deepEqual(scoped.rows.map(row => Number(row.points)).sort((a, b) => a - b), [10, 100]);
  });
});

test.after(async () => {
  await pool.end();
});
