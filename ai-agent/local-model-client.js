/**
 * Provider-neutral inference client.
 * Supports a self-hosted Ollama endpoint or Groq's free-tier OpenAI-compatible API.
 * Never falls back to a paid provider automatically.
 */
export function resolveLocalModelConfig(env = process.env) {
  const provider = (env.FRIEREN_MODEL_PROVIDER || 'ollama').trim().toLowerCase();
  const timeoutMs = Number(env.FRIEREN_MODEL_TIMEOUT_MS) || 90_000;
  const boundedTimeout = Math.max(5_000, Math.min(timeoutMs, 180_000));

  if (provider === 'groq') {
    const apiKey = (env.GROQ_API_KEY || '').trim();
    if (!apiKey) throw new Error('FRIEREN_MODEL_PROVIDER=groq requires GROQ_API_KEY. Add it as a Render secret.');
    const model = (env.FRIEREN_MODEL || 'openai/gpt-oss-20b').trim();
    if (!model) throw new Error('FRIEREN_MODEL cannot be empty.');
    return { provider, baseUrl: 'https://api.groq.com/openai/v1', model, apiKey, timeoutMs: boundedTimeout };
  }

  if (provider !== 'ollama') {
    throw new Error('Unsupported FRIEREN_MODEL_PROVIDER. Supported values: groq, ollama.');
  }
  const baseUrl = (env.FRIEREN_MODEL_URL || 'http://127.0.0.1:11434').trim().replace(/\\/+$/, '');
  const model = (env.FRIEREN_LOCAL_MODEL || 'qwen2.5:3b').trim();
  if (!/^https?:\\/\\//i.test(baseUrl)) throw new Error('FRIEREN_MODEL_URL must be an http(s) URL.');
  if (!model) throw new Error('FRIEREN_LOCAL_MODEL cannot be empty.');
  return { provider, baseUrl, model, timeoutMs: boundedTimeout };
}

export async function generateLocalResponse({ messages, env = process.env, fetchImpl = fetch }) {
  const config = resolveLocalModelConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const isGroq = config.provider === 'groq';
    const url = isGroq ? config.baseUrl + '/chat/completions' : config.baseUrl + '/api/chat';
    const headers = { 'content-type': 'application/json' };
    if (isGroq) headers.authorization = 'Bearer ' + config.apiKey;
    const body = isGroq
      ? { model: config.model, messages, stream: false, temperature: 0.4, max_tokens: 1200 }
      : { model: config.model, messages, stream: false, options: { temperature: 0.4 } };

    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      const hint = response.status === 429
        ? ' Free-tier rate limit may have been reached; wait for the limit to reset.'
        : response.status === 401
          ? ' Check the GROQ_API_KEY Render secret.'
          : '';
      throw new Error((isGroq ? 'Groq' : 'Local model') + ' returned HTTP ' + response.status + (detail ? ': ' + detail : '') + hint);
    }
    const payload = await response.json();
    const content = isGroq ? payload?.choices?.[0]?.message?.content : payload?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error((isGroq ? 'Groq' : 'Local model') + ' returned an empty response.');
    return content.trim();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Frieren model request timed out. Check provider availability or increase FRIEREN_MODEL_TIMEOUT_MS.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
