import { characters } from '../character-data.js';

const timeoutMs = 20000;
const results = [];

async function checkImage(character) {
  const url = character.image;
  if (!url) {
    return { name: character.name, rarity: character.rarity, url: null, ok: false, status: 'MISSING_URL', classification: 'broken', contentType: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PogacaFrierenImageAudit/1.1)',
          'Range': 'bytes=0-2047',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
    } catch (error) {
      return {
        name: character.name,
        rarity: character.rarity,
        url,
        ok: false,
        status: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        classification: 'unverified',
        contentType: '',
        error: error.message
      };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const status = response.status;
    const isImage = contentType.startsWith('image/');
    const ok = response.ok && isImage;
    let classification = 'ok';
    let reason;

    if (ok) {
      classification = 'ok';
    } else if (status === 403 || status === 429 || status >= 500) {
      classification = 'blocked_or_server_issue';
      reason = 'Host may block automated checks or be temporarily unavailable';
    } else if (status === 404 || status === 410) {
      classification = 'broken';
      reason = 'URL not found';
    } else if (!response.ok) {
      classification = 'unverified';
      reason = 'HTTP response could not verify an image';
    } else if (!isImage) {
      classification = 'broken';
      reason = 'Successful response did not return an image content type';
    }

    const result = {
      name: character.name,
      rarity: character.rarity,
      url,
      finalUrl: response.url,
      ok,
      status,
      classification,
      contentType: contentType || '(missing)'
    };
    if (reason) result.reason = reason;
    await response.body?.cancel().catch(() => {});
    return result;
  } catch (error) {
    return {
      name: character.name,
      rarity: character.rarity,
      url,
      ok: false,
      status: 'CHECK_ERROR',
      classification: 'unverified',
      contentType: '',
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

const concurrency = 4;
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
  verifiedImages: results.filter(r => r.classification === 'ok').length,
  definitelyBroken: results.filter(r => r.classification === 'broken').length,
  blockedOrServerIssue: results.filter(r => r.classification === 'blocked_or_server_issue').length,
  unverified: results.filter(r => r.classification === 'unverified').length,
  duplicateUrlGroups: [...duplicates.entries()].filter(([, names]) => names.length > 1).map(([url, names]) => ({ url, names })),
  results
};
console.log(JSON.stringify(report, null, 2));

// This is an informational audit only. Never fail the workflow:
// the bot can continue deploying while inaccessible hosts are reviewed separately.

