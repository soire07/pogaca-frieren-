export function parseCommandNames(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return [...new Set(
    value.split(/[;,\s]+/)
      .map(name => name.trim().replace(/^\/+/, '').toLocaleLowerCase('en-US'))
      .filter(name => /^[a-z0-9-]{1,80}$/.test(name))
  )].slice(0, 5);
}
