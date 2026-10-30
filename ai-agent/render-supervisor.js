export const AI_AGENT_HEALTH_PORT = 10001;
export const AI_AGENT_TEST_GUILD_ID = '1564945192803639356';

export function createAiAgentChildEnv(sourceEnv = {}) {
  const mapped = {
    DISCORD_TOKEN: sourceEnv.FRIEREN_AI_DISCORD_TOKEN,
    DISCORD_CLIENT_ID: sourceEnv.FRIEREN_AI_DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID: sourceEnv.FRIEREN_AI_DISCORD_GUILD_ID,
    FRIEREN_ADMIN_IDS: sourceEnv.FRIEREN_AI_ADMIN_IDS,
    DATABASE_URL: sourceEnv.FRIEREN_AI_DATABASE_URL,
    GROQ_API_KEY: sourceEnv.FRIEREN_AI_GROQ_API_KEY || sourceEnv.GROQ_API_KEY,
    FRIEREN_BRIDGE_SECRET: sourceEnv.FRIEREN_AI_BRIDGE_SECRET || sourceEnv.FRIEREN_BRIDGE_SECRET,
  };
  const missing = Object.entries(mapped)
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([key]) => key);
  if (missing.length) return { ok: false, missing };

  if (mapped.DISCORD_GUILD_ID !== AI_AGENT_TEST_GUILD_ID) {
    return { ok: false, error: 'invalid_test_guild', missing: [] };
  }

  return {
    ok: true,
    env: {
      ...sourceEnv,
      ...mapped,
      FRIEREN_MODEL_PROVIDER: sourceEnv.FRIEREN_AI_MODEL_PROVIDER || 'groq',
      FRIEREN_MODEL: sourceEnv.FRIEREN_AI_MODEL || 'openai/gpt-oss-20b',
      FRIEREN_TEST_TIMEOUT_MS: sourceEnv.FRIEREN_AI_TEST_TIMEOUT_MS || '180000',
      FRIEREN_BRIDGE_URL: sourceEnv.FRIEREN_AI_BRIDGE_URL
        || 'http://127.0.0.1:' + (Number(sourceEnv.PORT) || 3000),
      FRIEREN_AI_HEALTH_PORT: String(AI_AGENT_HEALTH_PORT),
      FRIEREN_AI_HEALTH_HOST: '127.0.0.1',
    },
  };
}
