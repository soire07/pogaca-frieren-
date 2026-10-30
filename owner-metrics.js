const RENDER_API_BASE = 'https://api.render.com/v1/metrics';
const METRIC_WINDOW_MS = 60 * 60 * 1000;

function seriesFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function pointMap(payload) {
  const points = new Map();
  for (const series of seriesFrom(payload)) {
    if (!Array.isArray(series?.values)) continue;
    for (const item of series.values) {
      const timestamp = Date.parse(item?.timestamp);
      const value = Number(item?.value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const key = new Date(timestamp).toISOString();
      points.set(key, (points.get(key) || 0) + value);
    }
  }
  return [...points.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([timestamp, value]) => ({ timestamp, value }));
}

function latestValue(points) {
  return points.length ? points[points.length - 1].value : null;
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
  apiKey = process.env.RENDER_API_KEY,
  resourceId = process.env.RENDER_SERVICE_ID,
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
    const cpuPoints = pointMap(cpu);
    const cpuLimitPoints = pointMap(cpuLimit);
    const memoryPoints = pointMap(memory);
    const memoryLimitPoints = pointMap(memoryLimit);
    const cpuUsed = latestValue(cpuPoints);
    const cpuCapacity = latestValue(cpuLimitPoints);
    const memoryUsedBytes = latestValue(memoryPoints);
    const memoryLimitBytes = latestValue(memoryLimitPoints);
    if ([cpuUsed, cpuCapacity, memoryUsedBytes, memoryLimitBytes].some(value => value === null)) {
      return { status: 'unavailable', source: 'render', points: [], message: 'Render metrikleri henüz veri döndürmedi.' };
    }
    const cpuPercent = cpuCapacity > 0 ? cpuUsed / cpuCapacity * 100 : null;
    const memoryPercent = memoryLimitBytes > 0 ? memoryUsedBytes / memoryLimitBytes * 100 : null;
    const cpuByTime = new Map(cpuPoints.map(point => [point.timestamp, point.value]));
    const cpuLimitByTime = new Map(cpuLimitPoints.map(point => [point.timestamp, point.value]));
    const memoryByTime = new Map(memoryPoints.map(point => [point.timestamp, point.value]));
    const memoryLimitByTime = new Map(memoryLimitPoints.map(point => [point.timestamp, point.value]));
    const timestamps = [...new Set([...cpuByTime.keys(), ...memoryByTime.keys()])].sort();
    const points = timestamps.map(timestamp => {
      const usedCpu = cpuByTime.get(timestamp);
      const maxCpu = cpuLimitByTime.get(timestamp) ?? cpuCapacity;
      const usedMemory = memoryByTime.get(timestamp);
      const maxMemory = memoryLimitByTime.get(timestamp) ?? memoryLimitBytes;
      return {
        timestamp,
        cpuPercent: Number.isFinite(usedCpu) && maxCpu > 0 ? usedCpu / maxCpu * 100 : null,
        memoryPercent: Number.isFinite(usedMemory) && maxMemory > 0 ? usedMemory / maxMemory * 100 : null
      };
    }).slice(-60);
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
      updatedAt: new Date(Math.max(...timestamps.map(Date.parse))).toISOString()
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
