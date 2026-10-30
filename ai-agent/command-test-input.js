export function parseCommandNames(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const candidates = value.split(/[;,]+/)
    .map(name => name.trim().replace(/^\\/+/, '').toLocaleLowerCase('en-US'))
    .filter(Boolean);
  const invalid = candidates.filter(name => !/^[a-z0-9-]{1,80}$/.test(name));
  if (invalid.length) throw new Error('Geçersiz komut adı: ' + invalid.join(', '));
  if (candidates.length > 5) throw new Error('Tek seferde en fazla 5 komut denetlenebilir.');
  return [...new Set(candidates)];
}
