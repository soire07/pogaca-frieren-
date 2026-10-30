export function splitDiscordMessage(content, maxLength = 1900) {
  const text = String(content ?? '');
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 2000) {
    throw new RangeError('Discord message chunk size must be between 1 and 2000.');
  }
  if (!text) return [''];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    let remaining = line;
    while (remaining.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    const candidate = current ? current + '\n' + remaining : remaining;
    if (candidate.length > maxLength) {
      if (current) chunks.push(current);
      current = remaining;
    } else {
      current = candidate;
    }
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}
