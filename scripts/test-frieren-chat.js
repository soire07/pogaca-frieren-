import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFrierenMessages,
  extractFrierenPrompt,
  isFrierenMentionMessage
} from '../frieren-chat.js';

test('Frieren responds only to a direct mention in a guild by a human user', () => {
  const base = {
    guild: { id: 'guild-1' },
    author: { id: 'user-1', bot: false },
    mentions: { users: { has: id => id === 'bot-1' } },
    content: '<@bot-1> Merhaba Frieren'
  };
  assert.equal(isFrierenMentionMessage(base, 'bot-1'), true);
  assert.equal(isFrierenMentionMessage({ ...base, guild: null }, 'bot-1'), false);
  assert.equal(isFrierenMentionMessage({ ...base, author: { bot: true } }, 'bot-1'), false);
  assert.equal(isFrierenMentionMessage({ ...base, mentions: { users: { has: () => false } } }, 'bot-1'), false);
});

test('mention parser removes both Discord mention formats and rejects empty prompts', () => {
  assert.equal(extractFrierenPrompt('<@bot-1> Merhaba', 'bot-1'), 'Merhaba');
  assert.equal(extractFrierenPrompt('<@!bot-1> Nasılsın?', 'bot-1'), 'Nasılsın?');
  assert.equal(extractFrierenPrompt('<@bot-1>   ', 'bot-1'), '');
  assert.equal(extractFrierenPrompt('Merhaba', 'bot-1'), 'Merhaba');
});

test('conversation builder keeps the Frieren persona and separates prior turns from the new prompt', () => {
  const messages = buildFrierenMessages({
    history: [
      { role: 'user', content: 'Merhaba' },
      { role: 'assistant', content: 'Merhaba. Uzun zaman oldu.' }
    ],
    userMessage: 'Beni hatırlıyor musun?'
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Frieren/i);
  assert.deepEqual(messages.slice(1), [
    { role: 'user', content: 'Merhaba' },
    { role: 'assistant', content: 'Merhaba. Uzun zaman oldu.' },
    { role: 'user', content: 'Beni hatırlıyor musun?' }
  ]);
});
