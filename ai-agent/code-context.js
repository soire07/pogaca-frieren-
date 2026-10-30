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
  const lines = source.split('\n');
  const normalizedTerms = [...new Set(terms.map(normalizeForSearch).filter(Boolean))];
  if (!normalizedTerms.length) return source.slice(0, limit);

  let bestScore = -1;
  let offset = 0;
  let bestOffset = 0;
  for (const line of lines) {
    const normalizedLine = normalizeForSearch(line);
    let score = 0;
    for (const term of normalizedTerms) {
      if (!normalizedLine.includes(term)) continue;
      score += 4;
      const matches = normalizedLine.split(term).length - 1;
      score += Math.min(matches - 1, 3);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
    offset += line.length + 1;
  }

  if (bestScore <= 0) return source.slice(0, limit);
  // Center the excerpt around the densest match, not the first generic keyword
  // anywhere in a large file. This keeps the relevant implementation in context.
  const start = Math.max(0, Math.min(source.length - limit, bestOffset - Math.floor(limit * 0.25)));
  return source.slice(start, start + limit);
}
