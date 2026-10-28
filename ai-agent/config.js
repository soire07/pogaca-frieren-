export function resolveAiModel(env = process.env) {
  const preferred = typeof env.FRIEREN_AI_MODEL === 'string' ? env.FRIEREN_AI_MODEL.trim() : '';
  return preferred || 'pluto-1.2-flash';
}
