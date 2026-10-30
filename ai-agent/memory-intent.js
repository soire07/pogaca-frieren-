function normalizeMemoryIntent(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isExplicitMemoryOverviewQuestion(value) {
  const normalized = normalizeMemoryIntent(value);
  const explicitMemoryScope = /\b(?:kalici )?belleg\w*\b/.test(normalized)
    || /\bbellek kayit\w*\b/.test(normalized)
    || /\bhafiza kayit\w*\b/.test(normalized)
    || /\bkayitli (?:olan )?(?:tum )?ani\w*\b/.test(normalized);
  const explicitlyNegated = /\b(?:listeleme|listelemeyin|gosterme|gostermeyin|siralamayin|siralamama)\b/.test(normalized);
  const explicitOverviewIntent = /\b(?:listele|liste|sirala|goster|say)\w*\b/.test(normalized)
    || /\b(?:tum|butun|hepsini|her birini)\b/.test(normalized);
  return explicitMemoryScope && explicitOverviewIntent && !explicitlyNegated;
}
