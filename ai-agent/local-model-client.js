/**
 * Provider-neutral client for a self-hosted Ollama-compatible model.
 * No paid API vendor SDK or API key is required. The model endpoint must be
 * reachable from the process running Frieren (Render cannot reach localhost
 * on a user's PC; use an always-on host or local deployment).
 */
export function resolveLocalModelConfig(env = process.env) {
  const baseUrl = (env.FRIEREN_MODEL_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  const model = (env.FRIEREN_LOCAL_MODEL || 'qwen2.5:3b').trim();
  const timeoutMs = Number(env.FRIEREN_MODEL_TIMEOUT_MS) || 90_000;
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('FRIEREN_MODEL_URL must be an http(s) URL.');
  if (!model) throw new Error('FRIEREN_LOCAL_MODEL cannot be empty.');
  return { baseUrl, model, timeoutMs: Math.max(5_000, Math.min(timeoutMs, 180_000)) };
}

export async function generateLocalResponse({ messages, env = process.env, fetchImpl = fetch }) {
  const config = resolveLocalModelConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: { temperature: 0.4 },
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error('Local model returned HTTP ' + response.status + (detail ? ': ' + detail : ''));
    }
    const payload = await response.json();
    const content = payload?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Local model returned an empty response.');
    return content.trim();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Frieren local model timed out. Check the model host or increase FRIEREN_MODEL_TIMEOUT_MS.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
