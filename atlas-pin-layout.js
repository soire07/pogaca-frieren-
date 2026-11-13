const PRIORITY = Object.freeze({ region: 0, city: 1, boss: 2, dungeon: 3 });
const OFFSETS = Object.freeze(Array.from({ length: 24 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 24;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}));

/**
 * Presentation-only collision avoidance for map pins.
 * Canonical RPG/anime coordinates remain untouched in their source catalogs.
 */
export function declutterAtlasPins(pins, { minDistance = 3.2 } = {}) {
  const source = Array.isArray(pins) ? pins : [];
  const arranged = new Map();
  const placed = [];
  const ordered = source.map((pin, index) => ({ ...pin, _index: index }))
    .sort((a, b) => (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9) || a._index - b._index);

  const collides = candidate => placed.some(other => {
    const dx = candidate.x - other.x;
    const dy = (candidate.y - other.y) * 1.5;
    return Math.hypot(dx, dy) < minDistance;
  });

  for (const pin of ordered) {
    const origin = { x: Number(pin.x), y: Number(pin.y) };
    let selected = origin;
    if (Number.isFinite(origin.x) && Number.isFinite(origin.y) && collides(origin)) {
      search: for (const radius of [3.4, 5.1, 6.8, 8.5, 10.2]) {
        for (const offset of OFFSETS) {
          const candidate = {
            x: Math.max(1, Math.min(99, origin.x + offset.x * radius)),
            y: Math.max(1, Math.min(99, origin.y + offset.y * radius))
          };
          if (!collides(candidate)) {
            selected = candidate;
            break search;
          }
        }
      }
      if (collides(selected)) {
        const fallback = OFFSETS.map(offset => ({
          x: Math.max(1, Math.min(99, origin.x + offset.x * 12)),
          y: Math.max(1, Math.min(99, origin.y + offset.y * 12))
        })).find(candidate => !collides(candidate));
        if (fallback) selected = fallback;
      }
    }
    const result = { ...pin, x: selected.x, y: selected.y };
    delete result._index;
    arranged.set(pin.id, result);
    placed.push(selected);
  }
  return source.map(pin => arranged.get(pin.id) || { ...pin });
}
