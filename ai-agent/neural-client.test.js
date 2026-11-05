import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNeuralPrompt, generateNeuralReply, isNeuralConfigured } from './neural-client.js';

const env = {
  FRIEREN_NEURAL_API_URL: 'https://neural.example.test',
  FRIEREN_NEURAL_API_TOKEN: 't'.repeat(40),
};

test('Neural provider requires HTTPS and a sufficiently long token', () => {
  assert.equal(isNeuralConfigured(env), true);
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
