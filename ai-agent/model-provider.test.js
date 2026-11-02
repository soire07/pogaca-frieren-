import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiModelProvider } from './model-provider.js';

test('AI provider defaults to the supported free Groq adapter', () => {
  class FakeOpenAI {
    constructor(options) { this.options = options; }
  }
  const provider = createAiModelProvider({
    env: { GROQ_API_KEY: 'test-groq-key' },
    OpenAIClient: FakeOpenAI,
  });
  assert.equal(provider.name, 'groq');
  assert.equal(provider.configured, true);
  assert.equal(provider.reason, null);
  assert.deepEqual(provider.client.options, {
    apiKey: 'test-groq-key',
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: 45_000,
    maxRetries: 1,
  });
});

test('unsupported provider names fail closed instead of silently calling Groq', () => {
  class FakeOpenAI {
    constructor() { throw new Error('client must not be created'); }
  }
  const provider = createAiModelProvider({
    env: { FRIEREN_MODEL_PROVIDER: 'openrouter', GROQ_API_KEY: 'test-groq-key' },
    OpenAIClient: FakeOpenAI,
  });
  assert.equal(provider.name, 'openrouter');
  assert.equal(provider.configured, false);
  assert.equal(provider.client, null);
  assert.equal(provider.reason, 'UNSUPPORTED_AI_PROVIDER');
});

test('Groq provider reports missing credentials without constructing a client', () => {
  class FakeOpenAI {
    constructor() { throw new Error('client must not be created'); }
  }
  const provider = createAiModelProvider({
    env: { FRIEREN_MODEL_PROVIDER: 'groq', GROQ_API_KEY: '   ' },
    OpenAIClient: FakeOpenAI,
  });
  assert.equal(provider.name, 'groq');
  assert.equal(provider.configured, false);
  assert.equal(provider.client, null);
  assert.equal(provider.reason, 'GROQ_API_KEY_MISSING');
});
