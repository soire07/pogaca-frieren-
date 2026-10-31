const RENDER_API_BASE = 'https://api.render.com/v1/metrics';
const METRIC_WINDOW_MS = 60 * 60 * 1000;

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

async function requestMetric(name, { apiKey, resourceId, startTime, endTime, fetchImpl }) {
  const url = new URL(RENDER_API_BASE + '/' + name);
  url.searchParams.set('resource', resourceId);
  url.searchParams.set('startTime', startTime);
  url.searchParams.set('endTime', endTime);
  url.searchParams.set('resolutionSeconds', '60');
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
  now = Date.now()
} = {}) {
  if (!apiKey) return { status: 'not_configured', source: 'local', points: [], message: 'Render API anahtarı yapılandırılmadı.' };
  if (!resourceId) return { status: 'not_configured', source: 'local', points: [], message: 'Render servis kimliği bulunamadı.' };
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', source: 'local', points: [], message: 'Bu Node.js sürümünde fetch kullanılamıyor.' };

  const endTime = new Date(now).toISOString();
  const startTime = new Date(now - METRIC_WINDOW_MS).toISOString();
  try {
    const [cpu, cpuLimit, memory, memoryLimit] = await Promise.all([
      requestMetric('cpu', { apiKey, resourceId, startTime, endTime, fetchImpl }),
      requestMetric('cpu-limit', { apiKey, resourceId, startTime, endTime, fetchImpl }),
      requestMetric('memory', { apiKey, resourceId, startTime, endTime, fetchImpl }),
      requestMetric('memory-limit', { apiKey, resourceId, startTime, endTime, fetchImpl })
    ]);
    const cpuPoints = aggregateAgainstLimit(cpu, cpuLimit);
    const memoryPoints = aggregateAgainstLimit(memory, memoryLimit);
    const latestCpu = latestValue(cpuPoints);
    const latestMemory = latestValue(memoryPoints);
    if (!latestCpu || !latestMemory) {
      return { status: 'unavailable', source: 'render', points: [], message: 'Render metrikleri henüz veri döndürmedi.' };
    }
    const cpuUsed = latestCpu.used;
    const cpuCapacity = latestCpu.limit;
    const memoryUsedBytes = latestMemory.used;
    const memoryLimitBytes = latestMemory.limit;
    const cpuPercent = latestCpu.percent;
    const memoryPercent = latestMemory.percent;
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
      cpuUsed,
      cpuCapacity,
      cpuPercent,
      memoryUsedBytes,
      memoryLimitBytes,
      memoryPercent,
      points,
      updatedAt: [latestCpu.timestamp, latestMemory.timestamp].sort().at(-1)
    };
  } catch (error) {
    const message = String(error?.message || '');
    const safeMessage = /^RENDER_METRICS_HTTP_\d{3}$/.test(message)
      ? 'Render API isteği başarısız oldu (' + message.slice(-3) + ').'
      : 'Render metrikleri şu anda alınamıyor.';
    return { status: 'unavailable', source: 'render', points: [], message: safeMessage };
  }
}

export function renderMetricBars(points, key, label) {
  const values = points.map(point => Number(point?.[key])).filter(Number.isFinite).slice(-24);
  if (!values.length) return '<p class="muted">Grafik için henüz veri yok.</p>';
  return '<div class="metric-bars" role="img" aria-label="' + label + '">' + values.map(value => {
    const height = Math.max(2, Math.min(100, value));
    return '<i title="' + value.toFixed(1) + '%" style="height:' + height.toFixed(1) + '%"></i>';
  }).join('') + '</div>';
}
