import test from 'node:test';
import assert from 'node:assert/strict';
import { GUILD_GAME_TYPES, createGuildGameQuestion, normalizeGuildGameAnswer } from '../guild-games.js';

test('guild game catalog exposes four distinct Frieren-themed game modes', () => {
  assert.deepEqual(GUILD_GAME_TYPES.map(game => game.key), ['bilgi','kelime','hafiza','tahmin']);
  assert.equal(new Set(GUILD_GAME_TYPES.map(game => game.key)).size, 4);
  for (const game of GUILD_GAME_TYPES) {
    assert.ok(game.label.length > 2);
    assert.ok(game.questions.length >= 3);
  }
});

test('question generation is deterministic with an injected random source and returns safe answer choices', () => {
  const question = createGuildGameQuestion('bilgi', () => 0);
  assert.equal(question.gameType, 'bilgi');
  assert.equal(question.options.length, 4);
  assert.ok(question.answerIndex >= 0 && question.answerIndex < 4);
  assert.ok(question.options.every(option => typeof option === 'string' && option.length <= 80));
  assert.ok(question.prompt.length <= 500);
  assert.equal(question.options[question.answerIndex], question.answer);
});

test('unknown game modes and invalid random values are rejected', () => {
  assert.throws(() => createGuildGameQuestion('unknown'), /GUILD_GAME_TYPE_INVALID/);
  assert.throws(() => createGuildGameQuestion('bilgi', () => 2), /GUILD_GAME_RANDOM_INVALID/);
});

test('answer normalization handles Turkish case and whitespace consistently', () => {
  assert.equal(normalizeGuildGameAnswer('  BÜYÜ  '), normalizeGuildGameAnswer('büyü'));
  assert.equal(normalizeGuildGameAnswer('İksir'), normalizeGuildGameAnswer('iksir'));
});

import miniGameCommand, { handleGuildGameInteraction } from '../loncaoyun.js';
import { answerGuildMiniGame } from '../guild-games.js';

test('guild mini-game slash command exposes start and leaderboard actions', () => {
  const schema = miniGameCommand.data.toJSON();
  assert.equal(schema.name, 'loncaoyun');
  assert.deepEqual(schema.options.map(option => option.name), ['baslat','siralam']);
  const start = schema.options.find(option => option.name === 'baslat');
  assert.deepEqual(start.options[0].choices.map(choice => choice.value), ['bilgi','kelime','hafiza','tahmin']);
});

test('mini-game button router ignores unrelated interactions', async () => {
  assert.equal(await handleGuildGameInteraction({ isButton: () => false }), false);
  assert.equal(await handleGuildGameInteraction({ isButton: () => true, customId: 'market_open' }), false);
});

function fakeGameDb({ session, alreadyAnswered = false, failScore = false }) {
  const calls = [];
  let score = { points: 10, correct_answers: 1, played_games: 1 };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT session_id,guild_id,channel_id')) return { rowCount: session ? 1 : 0, rows: session ? [session] : [] };
      if (sql.startsWith('UPDATE guild_game_sessions')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO guild_game_answers')) return { rowCount: alreadyAnswered ? 0 : 1, rows: alreadyAnswered ? [] : [{ correct: params[4] }] };
      if (sql.includes('INSERT INTO guild_game_scores')) {
        if (failScore) throw new Error('score write failed');
        return { rowCount: 1, rows: [score] };
      }
      throw new Error('Unexpected mini-game SQL: ' + sql);
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  return { calls, connect: async () => client };
}

test('correct mini-game answer is single-use and commits score in the same transaction', async () => {
  const db = fakeGameDb({ session: { session_id: '123e4567-e89b-42d3-a456-426614174000', guild_id: '1539562273197260860', channel_id: '1564945192803639356', answer_index: 2, explanation: 'Doğru.', status: 'active', expires_at: '2026-11-04T16:00:00.000Z' } });
  const result = await answerGuildMiniGame(db, { guildId: '1539562273197260860', channelId: '1564945192803639356', sessionId: '123e4567-e89b-42d3-a456-426614174000', userId: '123456789012345678', answerIndex: 2, now: '2026-11-04T15:00:00.000Z' });
  assert.equal(result.status, 'correct');
  assert.equal(result.pointsAwarded, 10);
  assert.ok(db.calls.some(call => call.sql === 'COMMIT'));
  assert.ok(db.calls.some(call => call.sql.includes('INSERT INTO guild_game_scores')));
});

test('wrong and repeated answers cannot award points twice', async () => {
  const session = { session_id: '123e4567-e89b-42d3-a456-426614174000', guild_id: '1539562273197260860', channel_id: '1564945192803639356', answer_index: 2, explanation: 'Doğru.', status: 'active', expires_at: '2026-11-04T16:00:00.000Z' };
  const wrongDb = fakeGameDb({ session });
  const wrong = await answerGuildMiniGame(wrongDb, { guildId: '1539562273197260860', channelId: '1564945192803639356', sessionId: session.session_id, userId: '123456789012345678', answerIndex: 1, now: '2026-11-04T15:00:00.000Z' });
  assert.equal(wrong.status, 'incorrect');
  assert.equal(wrong.pointsAwarded, 0);
  assert.equal(wrongDb.calls.some(call => call.sql.includes('INSERT INTO guild_game_scores')), true);
  const duplicateDb = fakeGameDb({ session, alreadyAnswered: true });
  const duplicate = await answerGuildMiniGame(duplicateDb, { guildId: '1539562273197260860', channelId: '1564945192803639356', sessionId: session.session_id, userId: '123456789012345678', answerIndex: 2, now: '2026-11-04T15:00:00.000Z' });
  assert.equal(duplicate.status, 'already_answered');
  assert.equal(duplicateDb.calls.some(call => call.sql.includes('INSERT INTO guild_game_scores')), false);
});

test('expired or cross-channel mini-game sessions cannot be answered', async () => {
  const session = { session_id: '123e4567-e89b-42d3-a456-426614174000', guild_id: '1539562273197260860', channel_id: '1564945192803639356', answer_index: 2, explanation: 'Doğru.', status: 'active', expires_at: '2026-11-04T14:59:00.000Z' };
  const db = fakeGameDb({ session });
  const result = await answerGuildMiniGame(db, { guildId: '1539562273197260860', channelId: '1564945192803639356', sessionId: session.session_id, userId: '123456789012345678', answerIndex: 2, now: '2026-11-04T15:00:00.000Z' });
  assert.equal(result.status, 'expired');
  assert.equal(db.calls.some(call => call.sql.startsWith('INSERT INTO guild_game_answers')), false);
  await assert.rejects(answerGuildMiniGame(fakeGameDb({ session }), { guildId: '1539562273197260860', channelId: '1564945192803639357', sessionId: session.session_id, userId: '123456789012345678', answerIndex: 2 }), /GUILD_GAME_SESSION_NOT_FOUND|not_found/);
});
