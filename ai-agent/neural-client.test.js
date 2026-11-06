import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNeuralPrompt, generateNeuralReply, isNeuralConfigured, isNeuralRequested } from './neural-client.js';

const env = {
  FRIEREN_NEURAL_API_URL: 'https://neural.example.test',
  FRIEREN_NEURAL_API_TOKEN: 't'.repeat(40),
  FRIEREN_NEURAL_QUALITY_APPROVED: '1',
};

test('Neural provider stays disabled until its quality gate is explicitly approved', () => {
  const unapproved = { ...env };
  delete unapproved.FRIEREN_NEURAL_QUALITY_APPROVED;
  assert.equal(isNeuralRequested(unapproved), false);
  assert.equal(isNeuralConfigured(unapproved), false);
  assert.equal(isNeuralRequested(env), true);
  assert.equal(isNeuralConfigured(env), true);
});

test('Neural provider requires HTTPS and a sufficiently long token', () => {
  assert.equal(isNeuralRequested(env), true);
  assert.equal(isNeuralConfigured(env), true);
  assert.equal(isNeuralRequested({ FRIEREN_NEURAL_API_URL: 'https://neural.example.test' }), true);
  assert.equal(isNeuralConfigured({ FRIEREN_NEURAL_API_URL: 'https://neural.example.test' }), false);
  assert.equal(isNeuralConfigured({ ...env, FRIEREN_NEURAL_API_URL: 'http://neural.example.test' }), false);
  assert.equal(isNeuralConfigured({ ...env, FRIEREN_NEURAL_API_TOKEN: 'short' }), false);
  assert.equal(isNeuralConfigured({}), false);
});

test('Neural prompt preserves the current request and stays inside the API input limit', () => {
  const prompt = buildNeuralPrompt({
    conversationHistory: [{ role: 'user', content: 'Önceki mesaj' }],
    memoryContext: 'Tercih: kısa Türkçe yanıt',
    question: 'Şimdi bunu açıkla',
    context: 'FILE: example.js\nsource',
    conversational: false,
  });
  assert.ok(prompt.includes('Şimdi bunu açıkla'));
  assert.ok(prompt.includes('Önceki mesaj'));
  assert.ok(prompt.length <= 1900);
});

test('Neural client posts to /generate with bearer auth and returns completion', async () => {
  let request;
  const result = await generateNeuralReply({
    env,
    prompt: 'Merhaba',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => JSON.stringify({ completion: 'Merhaba.', model: 'ufakai/ufakzeka-1' }) };
    },
  });
  assert.equal(request.url, 'https://neural.example.test/generate');
  assert.equal(request.options.headers.authorization, 'Bearer ' + env.FRIEREN_NEURAL_API_TOKEN);
  assert.equal(JSON.parse(request.options.body).prompt, 'Merhaba');
  assert.deepEqual(result, { text: 'Merhaba.', model: 'ufakai/ufakzeka-1' });
});

test('Neural client accepts an explicit /generate endpoint without duplicating the path', async () => {
  let requestedUrl;
  await generateNeuralReply({
    env: { ...env, FRIEREN_NEURAL_API_URL: 'https://neural.example.test/generate' },
    prompt: 'Test',
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify({ completion: 'OK' }) };
    },
  });
  assert.equal(requestedUrl, 'https://neural.example.test/generate');
});

test('Neural client aborts a stalled request at the configured timeout', async () => {
  await assert.rejects(generateNeuralReply({
    env,
    prompt: 'Test',
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    }),
  }), /FRIEREN_NEURAL_TIMEOUT/);
});

test('Neural client cancels streamed responses before buffering more than 32 KB', async () => {
  let cancelled = false;
  const chunks = [
    new TextEncoder().encode('x'.repeat(20_000)),
    new TextEncoder().encode('y'.repeat(20_000)),
  ];
  let index = 0;
  await assert.rejects(generateNeuralReply({
    env,
    prompt: 'Test',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => index < chunks.length
            ? { done: false, value: chunks[index++] }
            : { done: true },
          cancel: async () => { cancelled = true; },
          releaseLock() {},
        }),
      },
      text: async () => { throw new Error('unbounded text() path must not be used'); },
    }),
  }), /FRIEREN_NEURAL_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled, true);
});

test('Neural client fails closed on HTTP errors and empty responses', async () => {
  await assert.rejects(generateNeuralReply({
    env, prompt: 'Test',
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ detail: 'busy' }) }),
  }), /FRIEREN_NEURAL_HTTP_503/);
  await assert.rejects(generateNeuralReply({
    env, prompt: 'Test',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ completion: '' }) }),
  }), /FRIEREN_NEURAL_EMPTY_RESPONSE/);
});


test('Neural prompt truncation preserves the beginning of the current request', () => {
  const question = 'UNIQUE-QUESTION-START ' + 'q'.repeat(1400);
  const prompt = buildNeuralPrompt({ question, context: 'SOURCE-END ' + 'c'.repeat(900), conversational: false });
  assert.ok(prompt.length <= 1900);
  assert.ok(prompt.includes('UNIQUE-QUESTION-START'));
});
