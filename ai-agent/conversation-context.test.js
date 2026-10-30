import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareConversationHistory } from './conversation-context.js';

test('conversation history keeps only valid user and assistant messages', () => {
  const history = prepareConversationHistory([
    { role: 'system', content: 'must not become a system prompt' },
    { role: 'user', content: '  Önceki soru  ' },
    { role: 'tool', content: 'tool output' },
    { role: 'assistant', content: '  Önceki cevap  ' },
    { role: 'user', content: 42 },
    null,
  ]);

  assert.deepEqual(history, [
    { role: 'user', content: 'Önceki soru' },
    { role: 'assistant', content: 'Önceki cevap' },
  ]);
});

test('conversation history retains the newest contiguous messages within message and character budgets', () => {
  const history = prepareConversationHistory([
    { role: 'user', content: 'old'.repeat(500) },
    { role: 'assistant', content: 'middle'.repeat(500) },
    { role: 'user', content: 'new question' },
    { role: 'assistant', content: 'new answer' },
  ], { maxMessages: 3, maxTotalChars: 100 });

  assert.deepEqual(history, [
    { role: 'user', content: 'new question' },
    { role: 'assistant', content: 'new answer' },
  ]);
  assert.ok(history.reduce((total, item) => total + item.content.length, 0) <= 100);
});

test('conversation history caps individual message length and rejects invalid budgets', () => {
  const history = prepareConversationHistory([
    { role: 'user', content: 'x'.repeat(2000) },
    { role: 'assistant', content: 'latest' },
  ], { maxMessages: 8, maxTotalChars: 1300 });

  assert.equal(history.length, 2);
  assert.equal(history[0].content.length, 1200);
  assert.equal(history[1].content, 'latest');
  assert.deepEqual(prepareConversationHistory([{ role: 'user', content: 'ok' }], {
    maxMessages: 0,
    maxTotalChars: -1,
  }), [{ role: 'user', content: 'ok' }]);
});

test('conversation history safely handles missing or non-array input', () => {
  assert.deepEqual(prepareConversationHistory(null), []);
  assert.deepEqual(prepareConversationHistory('not history'), []);
});
