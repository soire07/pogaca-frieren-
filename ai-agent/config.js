export function resolveAiModel(env = process.env) {
  const preferred = typeof env.FRIEREN_AI_MODEL === 'string' ? env.FRIEREN_AI_MODEL.trim() : '';
  if (preferred) return preferred;

  const legacy = typeof env.OPENAI_MODEL === 'string' ? env.OPENAI_MODEL.trim() : '';
  if (legacy) return legacy;

  return 'gpt-4.1-mini';
}
