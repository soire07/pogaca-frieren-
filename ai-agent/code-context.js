function normalizeForSearch(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function scoreCodeCandidate(filePath, source, terms) {
  const normalizedPath = normalizeForSearch(filePath);
  const normalizedSource = normalizeForSearch(source);
  return terms.reduce((score, term) => {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm) return score;
    return score
      + (normalizedPath.includes(normalizedTerm) ? 4 : 0)
      + (normalizedSource.includes(normalizedTerm) ? 1 : 0);
  }, 0);
}

export function findRelevantExcerpt(source, terms, maxLength = 1800) {
  if (typeof source !== 'string' || !source || !Number.isFinite(maxLength) || maxLength <= 0) return '';
  const limit = Math.floor(maxLength);
  const normalizedSource = normalizeForSearch(source);
  let firstMatch = -1;
  for (const term of terms) {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm) continue;
    const index = normalizedSource.indexOf(normalizedTerm);
    if (index >= 0 && (firstMatch < 0 || index < firstMatch)) firstMatch = index;
  }
  if (firstMatch < 0) return source.slice(0, limit);
  const start = Math.max(0, firstMatch - Math.floor(limit * 0.25));
  return source.slice(start, start + limit);
}
