import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiAgentChildEnv, AI_AGENT_HEALTH_PORT, AI_AGENT_TEST_GUILD_ID } from './render-supervisor.js';

const validEnv = {
  FRIEREN_AI_DISCORD_TOKEN: 'ai-token',
  FRIEREN_AI_DISCORD_CLIENT_ID: 'ai-client-id',
  FRIEREN_AI_DISCORD_GUILD_ID: AI_AGENT_TEST_GUILD_ID,
  FRIEREN_AI_ADMIN_IDS: '123,456',
  FRIEREN_AI_DATABASE_URL: 'postgres://ai-memory',
  FRIEREN_AI_GROQ_API_KEY: 'ai-groq-key',
  FRIEREN_AI_BRIDGE_SECRET: 'bridge-secret',
  PORT: '10000',
};

test('AI child environment keeps both Discord tokens and database URLs separate', () => {
  const result = createAiAgentChildEnv({
    ...validEnv,
    DISCORD_TOKEN: 'main-token',
    DATABASE_URL: 'postgres://production',
  });
  assert.equal(result.ok, true);
  assert.equal(result.env.DISCORD_TOKEN, 'ai-token');
  assert.equal(result.env.DATABASE_URL, 'postgres://ai-memory');
  assert.equal(result.env.FRIEREN_AI_HEALTH_PORT, String(AI_AGENT_HEALTH_PORT));
  assert.equal(result.env.FRIEREN_AI_HEALTH_HOST, '127.0.0.1');
  assert.equal(result.env.FRIEREN_BRIDGE_URL, 'http://127.0.0.1:10000');
});

test('AI child refuses to start when required secrets or memory database are missing', () => {
  const result = createAiAgentChildEnv({});
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('DISCORD_TOKEN'));
  assert.ok(result.missing.includes('DATABASE_URL'));
});

test('AI child refuses production or unrelated guild command registration', () => {
  const result = createAiAgentChildEnv({ ...validEnv, FRIEREN_AI_DISCORD_GUILD_ID: '999999999999999999' });
  assert.deepEqual(result, { ok: false, error: 'invalid_test_guild', missing: [] });
});

test('AI child can reuse the main Groq key only when a dedicated AI key is absent', () => {
  const result = createAiAgentChildEnv({ ...validEnv, FRIEREN_AI_GROQ_API_KEY: '', GROQ_API_KEY: 'shared-groq-key' });
  assert.equal(result.env.GROQ_API_KEY, 'shared-groq-key');
});
