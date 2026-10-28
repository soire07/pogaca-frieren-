export function resolveAiModel(env = process.env) {
  const preferred = typeof env.FRIEREN_MODEL === 'string' ? env.FRIEREN_MODEL.trim() : '';
  return preferred || 'openai/gpt-oss-20b';
}
