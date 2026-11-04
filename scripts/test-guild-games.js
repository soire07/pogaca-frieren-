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
