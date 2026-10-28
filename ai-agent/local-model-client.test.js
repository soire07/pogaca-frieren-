import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalResponse, resolveLocalModelConfig } from './local-model-client.js';

test('model config defaults to Ollama for backwards compatibility', () => {
  const config = resolveLocalModelConfig({});
  assert.equal(config.provider, 'ollama');
  assert.equal(config.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.model, 'qwen2.5:3b');
  assert.equal(config.timeoutMs, 90_000);
});

test('Ollama config clamps timeout and normalizes URL', () => {
  const config = resolveLocalModelConfig({
    FRIEREN_MODEL_PROVIDER: 'ollama',
    FRIEREN_MODEL_URL: 'http://model-host:11434///',
    FRIEREN_LOCAL_MODEL: 'qwen2.5:7b',
    FRIEREN_MODEL_TIMEOUT_MS: '999999',
  });
  assert.equal(config.baseUrl, 'http://model-host:11434');
  assert.equal(config.model, 'qwen2.5:7b');
  assert.equal(config.timeoutMs, 180_000);
});

test('Groq config requires an API key and defaults to an open-weight model', () => {
  assert.throws(
    () => resolveLocalModelConfig({ FRIEREN_MODEL_PROVIDER: 'groq' }),
    /requires GROQ_API_KEY/,
  );
  const config = resolveLocalModelConfig({
    FRIEREN_MODEL_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-key',
  });
  assert.equal(config.provider, 'groq');
  assert.equal(config.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(config.model, 'openai/gpt-oss-20b');
  assert.equal(config.apiKey, 'test-key');
});

test('Ollama client sends non-streaming chat request and returns text', async () => {
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

test('Groq client sends bearer auth and parses OpenAI-compatible response', async () => {
  let request;
  const result = await generateLocalResponse({
    messages: [{ role: 'user', content: 'Bir hatayı bul' }],
    env: { FRIEREN_MODEL_PROVIDER: 'groq', GROQ_API_KEY: 'test-secret' },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: ' Test edildi. ' } }] }) };
    },
  });
  assert.equal(result, 'Test edildi.');
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-secret');
  assert.equal(request.body.model, 'openai/gpt-oss-20b');
  assert.equal(request.body.stream, false);
});

test('client gives a readable error for HTTP failures', async () => {
  await assert.rejects(
    generateLocalResponse({
      messages: [],
      env: {},
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'model unavailable' }),
    }),
    /HTTP 503: model unavailable/,
  );
});

test('client gives a useful hint when Groq free-tier rate limits are reached', async () => {
  await assert.rejects(
    generateLocalResponse({
      messages: [],
      env: { FRIEREN_MODEL_PROVIDER: 'groq', GROQ_API_KEY: 'test-key' },
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'rate limit' }),
    }),
    /rate limit may have been reached/,
  );
});

test('client rejects empty model output', async () => {
  await assert.rejects(
    generateLocalResponse({
      messages: [],
      env: {},
      fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: '  ' } }) }),
    }),
    /empty response/,
  );
});

test('client refuses unsupported provider values', () => {
  assert.throws(() => resolveLocalModelConfig({ FRIEREN_MODEL_PROVIDER: 'paid-provider' }), /Unsupported/);
});
