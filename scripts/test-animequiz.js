import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awardAnimeQuizPoints } from '../animequiz.js';

test('anime quiz awards points atomically and returns the updated guild-scoped total', async () => {
  let call;
  const db = {
    async query(sql, params) {
      call = { sql, params };
      return { rows: [{ points: 30, correct_answers: 3 }] };
    }
  };
  const score = await awardAnimeQuizPoints(db, '1539562273197260860', '111111111111111111', 10);
  assert.deepEqual(score, { points: 30, correctAnswers: 3 });
  assert.match(call.sql, /INSERT INTO anime_quiz_scores/);
  assert.match(call.sql, /ON CONFLICT \(guild_id,user_id\) DO UPDATE/);
  assert.match(call.sql, /points=anime_quiz_scores\.points\+EXCLUDED\.points/);
  assert.deepEqual(call.params, ['1539562273197260860', '111111111111111111', 10]);
});

test('anime quiz rejects invalid guilds, users and point amounts before writing', async () => {
  let writes = 0;
  const db = { async query() { writes++; return { rows: [] }; } };
  await assert.rejects(awardAnimeQuizPoints(db, null, '111111111111111111'), { message: 'ANIME_QUIZ_PLAYER_REQUIRED' });
  await assert.rejects(awardAnimeQuizPoints(db, '1539562273197260860', 'not-a-discord-id'), { message: 'ANIME_QUIZ_PLAYER_REQUIRED' });
  await assert.rejects(awardAnimeQuizPoints(db, '1539562273197260860', '111111111111111111', 0), { message: 'ANIME_QUIZ_POINTS_INVALID' });
  await assert.rejects(awardAnimeQuizPoints(db, '1539562273197260860', '111111111111111111', 101), { message: 'ANIME_QUIZ_POINTS_INVALID' });
  assert.equal(writes, 0);
});

test('anime quiz score schema is additive, guild-scoped and cascades with the RPG player', async () => {
  const source = await readFile(new URL('../database/db.js', import.meta.url), 'utf8');
  assert.match(source, /CREATE TABLE IF NOT EXISTS anime_quiz_scores/);
  assert.match(source, /PRIMARY KEY \(guild_id,user_id\)/);
  assert.match(source, /FOREIGN KEY \(guild_id,user_id\) REFERENCES users\(guild_id,user_id\) ON DELETE CASCADE/);
  assert.match(source, /idx_anime_quiz_scores_leaderboard/);
  assert.doesNotMatch(source, /DROP TABLE[^;]*anime_quiz_scores/i);
});
