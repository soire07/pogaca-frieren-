/** Read the health endpoint of the one central Neural service. */
export async function getFrierenNeuralHealthResponse({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  healthPath = 'health',
} = {}) {
  const unavailable = (reason, status = 503) => ({
    status,
    payload: { status: 'not_ready', service: 'frieren-neural', reason },
  });
  if (typeof fetchImpl !== 'function') return unavailable('fetch_unavailable');
  if (!['health', 'live'].includes(healthPath)) return unavailable('invalid_health_path');
  const configured = String(env.FRIEREN_NEURAL_API_URL || '').trim();
  if (!configured) return unavailable('neural_service_not_configured');
  let endpoint;
  try {
    endpoint = new URL(configured);
    if (
      (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) ||
      endpoint.username || endpoint.password
    ) return unavailable('invalid_neural_service_url');
    const basePath = endpoint.pathname.replace(/\/generate\/?$/i, '').replace(/\/+$/, '');
    endpoint.pathname = basePath + '/' + healthPath;
    endpoint.search = '';
    endpoint.hash = '';
  } catch {
    return unavailable('invalid_neural_service_url');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(Number(timeoutMs) || 5000, 5000)));
  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (raw.length > 16_384) return unavailable('health_response_too_large', 502);
    let payload;
    try { payload = JSON.parse(raw); } catch { return unavailable('invalid_health_response', 502); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return unavailable('invalid_health_response', 502);
    }
    return { status: response.status, payload: { ...payload, service: 'frieren-neural' } };
  } catch (error) {
    return unavailable(error?.name === 'AbortError' ? 'neural_health_timeout' : 'neural_service_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}
