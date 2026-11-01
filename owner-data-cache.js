const entries = new Map();

export function getStaleOwnerData(key, loader, fallback, ttlMs = 30_000) {
  const cacheKey = String(key);
  let entry = entries.get(cacheKey);
  if (!entry) {
    entry = { value: fallback, expiresAt: 0, refresh: null };
    entries.set(cacheKey, entry);
  }

  if (entry.expiresAt <= Date.now() && !entry.refresh) {
    entry.refresh = Promise.resolve()
      .then(loader)
      .then(value => {
        entry.value = value;
        entry.expiresAt = Date.now() + Math.max(1, Number(ttlMs) || 30_000);
      })
      .catch(() => {
        // Keep the last known good value and retry on the next request.
      })
      .finally(() => {
        entry.refresh = null;
      });
  }

  return entry.value;
}

export function clearOwnerDataCacheForTests() {
  entries.clear();
}
