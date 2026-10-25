export function levelForXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function xpForNextLevel(level) {
  return level * level * 100;
}

export function truncate(text, max = 450) {
  return String(text ?? '').slice(0, max);
}
