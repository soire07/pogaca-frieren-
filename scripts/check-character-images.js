import { characters } from '../character-data.js';

const timeoutMs = 15000;
const results = [];

async function checkImage(character) {
  const url = character.image;
  if (!url) return { name: character.name, rarity: character.rarity, url: null, ok: false, status: 'MISSING_URL', contentType: '' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'PogacaFrieren-ImageAudit/1.0', 'Range': 'bytes=0-2047' }
      });
    } catch (error) {
      return { name: character.name, rarity: character.rarity, url, ok: false, status: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', contentType: '', error: error.message };
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const status = response.status;
    const isImage = contentType.startsWith('image/');
    const ok = response.ok && isImage;
    const result = {
      name: character.name,
      rarity: character.rarity,
      url,
      finalUrl: response.url,
      ok,
      status,
      contentType: contentType || '(missing)'
    };
    await response.body?.cancel().catch(() => {});
    if (!response.ok) result.reason = 'HTTP_STATUS_NOT_OK';
    else if (!isImage) result.reason = 'CONTENT_TYPE_NOT_IMAGE';
    return result;
  } catch (error) {
    return { name: character.name, rarity: character.rarity, url, ok: false, status: 'CHECK_ERROR', contentType: '', error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

const concurrency = 6;
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, characters.length) }, async () => {
  while (next < characters.length) {
    const index = next++;
    results[index] = await checkImage(characters[index]);
  }
}));

const duplicates = new Map();
for (const result of results) {
  if (!result.url) continue;
  const names = duplicates.get(result.url) || [];
  names.push(result.name);
  duplicates.set(result.url, names);
}
for (const result of results) {
  const names = duplicates.get(result.url) || [];
  if (names.length > 1) result.duplicateWith = names.filter(name => name !== result.name);
}

const report = {
  checkedAt: new Date().toISOString(),
  total: results.length,
  reachableImageResponses: results.filter(r => r.ok).length,
  failedOrUnverified: results.filter(r => !r.ok).length,
  duplicateUrlGroups: [...duplicates.entries()].filter(([, names]) => names.length > 1).map(([url, names]) => ({ url, names })),
  results
};
console.log(JSON.stringify(report, null, 2));
if (report.failedOrUnverified > 0) process.exitCode = 1;
