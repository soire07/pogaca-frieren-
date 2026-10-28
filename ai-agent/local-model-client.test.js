import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalResponse, resolveLocalModelConfig } from './local-model-client.js';

test('local model config defaults to Ollama on localhost without an API key', () => {
  const config = resolveLocalModelConfig({});
  assert.equal(config.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.model, 'qwen2.5:3b');
  assert.equal(config.timeoutMs, 90_000);
});

test('local model config clamps timeout and normalizes URL', () => {
  const config = resolveLocalModelConfig({
    FRIEREN_MODEL_URL: 'http://model-host:11434///',
    FRIEREN_LOCAL_MODEL: 'qwen2.5:7b',
    FRIEREN_MODEL_TIMEOUT_MS: '999999',
  });
  assert.equal(config.baseUrl, 'http://model-host:11434');
  assert.equal(config.model, 'qwen2.5:7b');
  assert.equal(config.timeoutMs, 180_000);
});

test('local model client sends non-streaming chat request and returns text', async () => {
  let request;
  const result = await generateLocalResponse({
    messages: [{ role: 'user', content: 'Merhaba' }],
    env: { FRIEREN_MODEL_URL: 'http://localhost:11434', FRIEREN_LOCAL_MODEL: 'test-model' },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ message: { content: ' Selam! ' } }) };
    },
  });
  assert.equal(result, 'Selam!');
  assert.equal(request.url, 'http://localhost:11434/api/chat');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.stream, false);
});

test('local model client gives a readable error for HTTP failures', async () => {
  await assert.rejects(
    generateLocalResponse({
      messages: [],
      env: {},
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'model unavailable' }),
    }),
    /HTTP 503: model unavailable/,
  );
});

test('local model client rejects empty model output', async () => {
  await assert.rejects(
    generateLocalResponse({
      messages: [],
      env: {},
      fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: '  ' } }) }),
    }),
    /empty response/,
  );
});
