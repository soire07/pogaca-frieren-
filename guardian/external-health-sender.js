import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_EVENT_URL = 'https://pogaca-frieren.onrender.com/internal/guardian/security-event';

export async function probeReadiness(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new Error('GUARDIAN_PROBE_URL_INVALID');
  }
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* Invalid JSON is an unhealthy readiness response. */ }
    const healthy = response.status === 200 && payload?.status === 'ok';
    return {
      healthy,
      statusCode: Number(response.status) || 0,
      readiness: typeof payload?.status === 'string' ? payload.status.slice(0, 32) : 'invalid_response',
      checks: payload?.checks && typeof payload.checks === 'object' ? payload.checks : {},
    };
  } catch {
    return { healthy: false, statusCode: 0, readiness: 'network_error', checks: {} };
  }
}

export function buildReadinessFailureEvent(result, { now = new Date(), service = 'pogaca-frieren' } = {}) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('GUARDIAN_EVENT_TIME_INVALID');
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  const status = Number(result?.statusCode) || 0;
  const readiness = String(result?.readiness || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  return {
    eventId: `guard-health-${service}-${day}`,
    source: 'frieren_guard',
    system: 'guardian',
    code: 'POGACA_READINESS_FAILED',
    severity: 'high',
    title: 'Poğaça Frieren readiness check failed',
    summary: `External monitor observed an unhealthy Poğaça readiness endpoint (HTTP ${status}, state ${readiness}).`,
    observedAt: date.toISOString(),
    evidence: [{
      message: `GET /ready returned HTTP ${status}; readiness=${readiness}; checks=${JSON.stringify(result?.checks || {}).slice(0, 700)}`,
    }],
  };
}

export async function sendSignedGuardianEvent(event, {
  secret,
  endpoint = DEFAULT_EVENT_URL,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('FRIEREN_GUARD_EVENT_SECRET_MISSING_OR_WEAK');
  if (typeof endpoint !== 'string' || !/^https:\/\//i.test(endpoint)) throw new Error('GUARDIAN_EVENT_ENDPOINT_INVALID');
  const body = JSON.stringify(event);
  if (Buffer.byteLength(body, 'utf8') > 32_768) throw new Error('GUARDIAN_EVENT_BODY_TOO_LARGE');
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-frieren-timestamp': timestamp,
      'x-frieren-signature': 'sha256=' + signature,
    },
    body,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (![200, 201].includes(response.status)) throw new Error('GUARDIAN_EVENT_DELIVERY_FAILED_' + response.status);
  return { delivered: true, statusCode: response.status, eventId: event.eventId };
}

export async function runExternalHealthMonitor({
  probeUrl,
  endpoint = DEFAULT_EVENT_URL,
  secret,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const result = await probeReadiness(probeUrl, { fetchImpl });
  if (result.healthy) return { healthy: true, delivered: false, probe: result };
  const event = buildReadinessFailureEvent(result, { now });
  const delivery = await sendSignedGuardianEvent(event, {
    secret,
    endpoint,
    fetchImpl,
    now: new Date(now).getTime(),
  });
  return { healthy: false, delivered: true, probe: result, delivery };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const probeUrl = process.env.GUARDIAN_PROBE_URL || 'https://pogaca-frieren.onrender.com/ready';
  const endpoint = process.env.GUARDIAN_EVENT_ENDPOINT || DEFAULT_EVENT_URL;
  const secret = process.env.FRIEREN_GUARD_EVENT_SECRET || '';
  const result = await runExternalHealthMonitor({ probeUrl, endpoint, secret });
  process.stdout.write(JSON.stringify(result) + '\n');
}