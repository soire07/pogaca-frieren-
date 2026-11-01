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

/**
 * Cache read-only dashboard data. The first request waits for one shared load;
 * subsequent requests receive the last good value while an expired entry refreshes.
 */
export async function getOwnerData(key, loader, ttlMs = 30_000) {
  const cacheKey = String(key);
  let entry = entries.get(cacheKey);
  if (!entry) {
    entry = { value: undefined, hasValue: false, expiresAt: 0, refresh: null };
    entries.set(cacheKey, entry);
  }

  if (entry.expiresAt <= Date.now() && !entry.refresh) {
    entry.refresh = Promise.resolve()
      .then(loader)
      .then(value => {
        entry.value = value;
        entry.hasValue = true;
        entry.expiresAt = Date.now() + Math.max(1, Number(ttlMs) || 30_000);
        return value;
      })
      .catch(error => {
        if (!entry.hasValue) throw error;
        return entry.value;
      })
      .finally(() => {
        entry.refresh = null;
      });
  }

  if (entry.hasValue) return entry.value;
  return entry.refresh;
}

export function clearOwnerDataCacheForTests() {
  entries.clear();
}
