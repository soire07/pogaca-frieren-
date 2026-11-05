export const RENDER_METRIC_RANGES = Object.freeze({
  '1h': Object.freeze({ durationMs: 60 * 60 * 1000, resolutionSeconds: 60, label: 'Son 1 saat' }),
  '6h': Object.freeze({ durationMs: 6 * 60 * 60 * 1000, resolutionSeconds: 300, label: 'Son 6 saat' }),
  '24h': Object.freeze({ durationMs: 24 * 60 * 60 * 1000, resolutionSeconds: 900, label: 'Son 24 saat' })
});

export function normalizeRenderMetricRange(value) {
  return Object.hasOwn(RENDER_METRIC_RANGES, String(value || '')) ? String(value) : '1h';
}

function seriesFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function groupedSeries(payload) {
  const points = new Map();
  for (const series of seriesFrom(payload)) {
    if (!Array.isArray(series?.values)) continue;
    const instance = series.labels?.find(label => label?.field === 'instance')?.value || 'service';
    for (const item of series.values) {
      const timestamp = Date.parse(item?.timestamp);
      const value = Number(item?.value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const key = new Date(timestamp).toISOString();
      if (!points.has(key)) points.set(key, new Map());
      const instances = points.get(key);
      instances.set(instance, (instances.get(instance) || 0) + value);
    }
  }
  return points;
}

function aggregateAgainstLimit(usagePayload, limitPayload) {
  const usage = groupedSeries(usagePayload);
  const limits = groupedSeries(limitPayload);
  const result = [];
  for (const timestamp of [...usage.keys()].sort()) {
    const usageByInstance = usage.get(timestamp);
    const limitByInstance = limits.get(timestamp);
    let used = 0;
    let limit = 0;
    for (const [instance, value] of usageByInstance) {
      if (!limitByInstance?.has(instance)) continue;
      used += value;
      limit += limitByInstance.get(instance);
    }
    if (limit > 0) result.push({ timestamp, used, limit, percent: used / limit * 100 });
  }
  return result;
}

function latestValue(points) {
  return points.length ? points[points.length - 1] : null;
}

async function requestMetric(name, { apiKey, resourceId, startTime, endTime, resolutionSeconds, fetchImpl }) {
  const url = new URL('https://api.render.com/v1/metrics/' + name);
  url.searchParams.set('resource', resourceId);
  url.searchParams.set('startTime', startTime);
  url.searchParams.set('endTime', endTime);
  url.searchParams.set('resolutionSeconds', String(resolutionSeconds));
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error('RENDER_METRICS_HTTP_' + response.status);
  return response.json();
}

export async function getRenderServiceMetrics({
  apiKey = process.env.RENDER_POGACA_API_KEY || process.env.RENDER_API_KEY,
  resourceId = process.env.RENDER_METRICS_SERVICE_ID || process.env.RENDER_SERVICE_ID || 'srv-dbf4vdvavr4c73cr6s00',
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  range = '1h'
} = {}) {
  const selectedRange = normalizeRenderMetricRange(range);
  const rangeConfig = RENDER_METRIC_RANGES[selectedRange];
  if (!apiKey) return { status: 'not_configured', source: 'local', points: [], range: selectedRange, rangeLabel: rangeConfig.label, message: 'Render API anahtarı yapılandırılmadı.' };
  if (!resourceId) return { status: 'not_configured', source: 'local', points: [], range: selectedRange, rangeLabel: rangeConfig.label, message: 'Render servis kimliği bulunamadı.' };
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', source: 'local', points: [], range: selectedRange, rangeLabel: rangeConfig.label, message: 'Bu Node.js sürümünde fetch kullanılamıyor.' };

  const endTime = new Date(now).toISOString();
  const startTime = new Date(now - rangeConfig.durationMs).toISOString();
  const requestOptions = { apiKey, resourceId, startTime, endTime, resolutionSeconds: rangeConfig.resolutionSeconds, fetchImpl };
  try {
    const [cpu, cpuLimit, memory, memoryLimit] = await Promise.all([
      requestMetric('cpu', requestOptions),
      requestMetric('cpu-limit', requestOptions),
      requestMetric('memory', requestOptions),
      requestMetric('memory-limit', requestOptions)
    ]);
    const cpuPoints = aggregateAgainstLimit(cpu, cpuLimit);
    const memoryPoints = aggregateAgainstLimit(memory, memoryLimit);
    const latestCpu = latestValue(cpuPoints);
    const latestMemory = latestValue(memoryPoints);
    if (!latestCpu || !latestMemory) {
      return { status: 'unavailable', source: 'render', points: [], range: selectedRange, rangeLabel: rangeConfig.label, message: 'Render metrikleri henüz veri döndürmedi.' };
    }
    const cpuByTime = new Map(cpuPoints.map(point => [point.timestamp, point.percent]));
    const memoryByTime = new Map(memoryPoints.map(point => [point.timestamp, point.percent]));
    const timestamps = [...new Set([...cpuByTime.keys(), ...memoryByTime.keys()])].sort();
    const points = timestamps.map(timestamp => ({
      timestamp,
      cpuPercent: cpuByTime.get(timestamp) ?? null,
      memoryPercent: memoryByTime.get(timestamp) ?? null
    })).slice(-60);
    return {
      status: 'available',
      source: 'render',
      range: selectedRange,
      rangeLabel: rangeConfig.label,
      resolutionSeconds: rangeConfig.resolutionSeconds,
      cpuUsed: latestCpu.used,
      cpuCapacity: latestCpu.limit,
      cpuPercent: latestCpu.percent,
      memoryUsedBytes: latestMemory.used,
      memoryLimitBytes: latestMemory.limit,
      memoryPercent: latestMemory.percent,
      points,
      updatedAt: [latestCpu.timestamp, latestMemory.timestamp].sort().at(-1)
    };
  } catch (error) {
    const message = String(error?.message || '');
    const safeMessage = /^RENDER_METRICS_HTTP_\d{3}$/.test(message)
      ? 'Render API isteği başarısız oldu (' + message.slice(-3) + ').'
      : 'Render metrikleri şu anda alınamıyor.';
    return { status: 'unavailable', source: 'render', points: [], range: selectedRange, rangeLabel: rangeConfig.label, message: safeMessage };
  }
}

export function renderMetricBars(points, key, label) {
  const values = points.map(point => Number(point?.[key])).filter(Number.isFinite).slice(-36);
  if (!values.length) return '<p class="muted">Grafik için henüz veri yok.</p>';
  return '<div class="metric-bars" role="img" aria-label="' + label + '">' + values.map(value => {
    const height = Math.max(2, Math.min(100, value));
    return '<i title="' + value.toFixed(1) + '%" style="height:' + height.toFixed(1) + '%"></i>';
  }).join('') + '</div>';
}
