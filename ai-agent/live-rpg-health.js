const DEFAULT_RPG_HEALTH_URL = 'https://pogaca-frieren.onrender.com/';

export async function checkLiveRpgHealth({
  url = process.env.RPG_BOT_HEALTH_URL || DEFAULT_RPG_HEALTH_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  attempts = 3,
  retryDelayMs = 2_000,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, summary: 'Bu Node.js ortamında fetch desteği yok.', report: 'FAIL: fetch API is unavailable.' };
  }
  let lastReason = 'Yanıt alınamadı.';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'text/plain' }, signal: controller.signal });
      const body = await response.text().catch(() => '');
      if (response.ok && /Discord ve veritabanı bağlantısı sağlıklı/i.test(body)) {
        return {
          ok: true,
          summary: 'Canlı RPG servisi Discord bağlantısı ve PostgreSQL sorgusuyla doğrulandı.',
          report: 'PASS: canlı RPG health endpoint HTTP ' + response.status + '; Discord gateway hazır ve SELECT 1 başarılı.',
        };
      }
      lastReason = response.status >= 500
        ? 'RPG servisi hazır değil veya veritabanı/Discord bağlantısı başarısız (HTTP ' + response.status + ').'
        : 'RPG sağlık endpointi beklenen yanıtı vermedi (HTTP ' + response.status + ').';
    } catch (error) {
      lastReason = error?.name === 'AbortError'
        ? 'RPG sağlık kontrolü zaman aşımına uğradı.'
        : 'RPG sağlık endpointine erişilemedi (' + (error?.code || error?.name || 'network error') + ').';
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  return { ok: false, summary: lastReason + ' ' + attempts + ' deneme yapıldı.', report: 'FAIL: ' + lastReason + ' Attempts: ' + attempts + '.' };
}
