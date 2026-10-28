import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationMemory } from './conversation-memory.js';

test('keeps only the most recent configured number of exchanges', () => {
  const memory = createConversationMemory({ maxExchanges: 2 });
  memory.remember('user-1', 'question one', 'answer one');
  memory.remember('user-1', 'question two', 'answer two');
  memory.remember('user-1', 'question three', 'answer three');
  assert.deepEqual(memory.getHistory('user-1'), [
    { role: 'user', content: 'question two' },
    { role: 'assistant', content: 'answer two' },
    { role: 'user', content: 'question three' },
    { role: 'assistant', content: 'answer three' },
  ]);
});

test('isolates histories between users', () => {
  const memory = createConversationMemory();
  memory.remember('alice', 'private question', 'private answer');
  memory.remember('bob', 'other question', 'other answer');
  assert.equal(memory.getHistory('alice')[0].content, 'private question');
  assert.equal(memory.getHistory('bob')[0].content, 'other question');
});

test('expires inactive history after the configured TTL', () => {
  let timestamp = 1000;
  const memory = createConversationMemory({ ttlMs: 500, now: () => timestamp });
  memory.remember('user-1', 'question', 'answer');
  timestamp += 500;
  assert.deepEqual(memory.getHistory('user-1'), []);
});

test('evicts the least recently used user when capacity is reached', () => {
  const memory = createConversationMemory({ maxUsers: 2 });
  memory.remember('first', 'q1', 'a1');
  memory.remember('second', 'q2', 'a2');
  memory.getHistory('first');
  memory.remember('third', 'q3', 'a3');
  assert.deepEqual(memory.getHistory('second'), []);
  assert.equal(memory.getHistory('first')[0].content, 'q1');
  assert.equal(memory.getHistory('third')[0].content, 'q3');
});

test('clear removes one user and oversized messages are bounded', () => {
  const memory = createConversationMemory();
  memory.remember('user-1', 'q'.repeat(2000), 'a'.repeat(2500));
  assert.equal(memory.getHistory('user-1')[0].content.length, 1500);
  assert.equal(memory.getHistory('user-1')[1].content.length, 1900);
  assert.equal(memory.clear('user-1'), true);
  assert.deepEqual(memory.getHistory('user-1'), []);
});
