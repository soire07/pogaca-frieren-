import OpenAI from 'openai';

export function createAiModelProvider({ env = process.env, OpenAIClient = OpenAI } = {}) {
  const requestedName = String(env.FRIEREN_MODEL_PROVIDER || 'groq').trim().toLowerCase();
  if (requestedName !== 'groq') {
    return {
      name: requestedName || 'unknown',
      configured: false,
      client: null,
      reason: 'UNSUPPORTED_AI_PROVIDER',
    };
  }

  const apiKey = String(env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    return {
      name: 'groq',
      configured: false,
      client: null,
      reason: 'GROQ_API_KEY_MISSING',
    };
  }

  return {
    name: 'groq',
    configured: true,
    client: new OpenAIClient({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 45_000,
      maxRetries: 1,
    }),
    reason: null,
  };
}
