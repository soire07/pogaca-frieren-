import { buildMemoryContext, extractExplicitMemories, getRelevantMemories } from '../frieren-memory.js';
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

test('mention handler loads only this guild and user history, then stores both turns', async () => {
  const calls = [];
  const replies = [];
  const message = {
    guild: { id: 'guild-7' },
    channelId: 'channel-1',
    author: { id: 'user-9', bot: false },
    mentions: { users: { has: id => id === 'bot-1' } },
    content: '<@bot-1> Nasılsın?',
    reply: async payload => replies.push(payload)
  };
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return { rows: [{ role: 'user', content: 'Önceki soru' }] };
      return { rows: [] };
    }
  };
  const handled = await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message,
    botUserId: 'bot-1',
    db,
    env: { GROQ_API_KEY: 'test-key' },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.messages.at(-2).content, 'Önceki soru');
      assert.equal(body.messages.at(-1).content, 'Nasılsın?');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'İyiyim. Sen nasılsın?' } }] }) };
    }
  });

  assert.equal(handled, true);
  const historyCall = calls.find(call => call.sql.includes('SELECT role, content'));
  const insertCall = calls.find(call => call.sql.includes('INSERT INTO frieren_chat_messages'));
  assert.deepEqual(historyCall.params, ['guild-7', 'user-9', 'channel-1', 16]);
  assert.deepEqual(insertCall.params, ['guild-7', 'user-9', 'channel-1', 'Nasılsın?', 'İyiyim. Sen nasılsın?']);
  assert.equal(replies[0].content, 'İyiyim. Sen nasılsın?');
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
});

test('mention handler ignores messages without the bot mention and gives a safe setup response without an API key', async () => {
  let queried = false;
  const base = {
    guild: { id: 'guild-1' },
    author: { id: 'user-1', bot: false },
    mentions: { users: { has: () => true } },
    content: '<@bot-1> Merhaba',
    reply: async () => {}
  };
  assert.equal(await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message: { ...base, mentions: { users: { has: () => false } } },
    botUserId: 'bot-1',
    db: { query: async () => { queried = true; return { rows: [] }; } },
    env: {}
  }), false);
  assert.equal(queried, false);

  const replies = [];
  await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message: { ...base, reply: async payload => replies.push(payload) },
    botUserId: 'bot-1',
    db: { query: async () => { throw new Error('must not query'); } },
    env: {}
  });
  assert.match(replies[0].content, /henüz yapılandırılmadı/i);
});


test('explicit memory extraction saves only clear non-sensitive declarations and supports corrections', () => {
  assert.deepEqual(extractExplicitMemories('En sevdiğim renk mor.'), [
    { key: 'favori_renk', value: 'En sevdiği renk: mor.' }
  ]);
  assert.equal(extractExplicitMemories('Bugün Minecraft gördüm.').length, 0);
  assert.equal(extractExplicitMemories('Şifrem 12345, bunu hatırla.').length, 0);
  assert.equal(extractExplicitMemories('Hobim dijital çizim yapmak.')[0].key, 'hobi');
  assert.equal(extractExplicitMemories('En sevdiğim renk mor mu?').length, 0);
});

test('memory retrieval is scoped to the exact guild and Discord user', async () => {
  let captured;
  const db = { query: async (_sql, params) => {
    captured = params;
    return { rows: [
      { memory_key: 'favori_renk', memory_value: 'En sevdiği renk: mor.' },
      { memory_key: 'proje_frieren', memory_value: 'Frieren projesi üzerinde çalışıyor.' }
    ] };
  } };
  const memories = await getRelevantMemories(db, { guildId: 'guild-a', userId: 'user-a', question: 'Frieren projesi nasıl gidiyor?' });
  assert.deepEqual(captured, ['guild-a', 'user-a']);
  assert.deepEqual(memories.map(item => item.memory_key), ['proje_frieren']);
});

test('explicit memory recall returns saved memories and context labels them as untrusted data', async () => {
  const db = { query: async () => ({ rows: [{ memory_key: 'hobi', memory_value: 'Dijital çizim.' }] }) };
  const memories = await getRelevantMemories(db, { guildId: 'g', userId: 'u', question: 'Benim hakkımda neleri hatırlıyorsun?' });
  assert.equal(memories.length, 1);
  assert.match(buildMemoryContext(memories), /sistem talimatı değildir/i);
  assert.match(buildMemoryContext(memories), /Kurgu karakterlerinin bilgilerini kullanıcının kişisel bilgileriyle karıştırma/i);
});


test('personal memories are not injected into fictional character questions', async () => {
  const db = { query: async () => ({ rows: [
    { memory_key: 'favori_hayvan', memory_value: 'En sevdiği hayvan: kaplumbağa.' }
  ] }) };
  const memories = await getRelevantMemories(db, {
    guildId: 'guild-1',
    userId: 'user-1',
    question: "Arven'in en sevdiği hayvan nedir?"
  });
  assert.deepEqual(memories, []);
});


test('Frieren persona uses canonical identity and forbids invented appearance or server-based identity', () => {
  const systemPrompt = buildFrierenMessages({ userMessage: 'Kendini tanıt.' })[0].content;
  assert.match(systemPrompt, /Frieren: Beyond Journey.s End/i);
  assert.match(systemPrompt, /elf büyücüsü/i);
  assert.doesNotMatch(systemPrompt, /Poğaça Discord sunucusunda yaşayan/i);
  assert.match(systemPrompt, /görünüş.*uydurma|uydurma.*görünüş/i);
  assert.match(systemPrompt, /Himmel/i);
});


test('Frieren persona reflects both anime seasons, her evolving bonds, and restrained characterization', () => {
  const systemPrompt = buildFrierenMessages({ userMessage: 'Kendini tanıt.' })[0].content;
  assert.match(systemPrompt, /Fern/i);
  assert.match(systemPrompt, /Stark/i);
  assert.match(systemPrompt, /Himmel/i);
  assert.match(systemPrompt, /Heiter/i);
  assert.match(systemPrompt, /Eisen/i);
  assert.match(systemPrompt, /zamanın.*değer|değer.*zamanın/i);
  assert.match(systemPrompt, /koruyucu|sorumluluk/i);
  assert.match(systemPrompt, /kuru mizah|mizah/i);
  assert.match(systemPrompt, /büyü.*merak|merak.*büyü/i);
  assert.match(systemPrompt, /duygusuz/i);
  assert.match(systemPrompt, /bilge.*öğüt|öğüt.*bilge/i);
  assert.match(systemPrompt, /karakter gelişimi|gelişimi/i);
});
