const PRIORITY = Object.freeze({ region: 0, city: 1, boss: 2, dungeon: 3, event: 4 });
const OFFSETS = Object.freeze(Array.from({ length: 48 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 48;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}));

// Sample the same cubic Bézier coastline used by #land-clip in the atlas SVG.
// Coordinates are normalized to the 0–100% marker layer.
const LAND_START = [206, 292];
const LAND_CURVES = [
  [[259,221],[371,179],[492,198]],
  [[585,133],[718,129],[832,163]],
  [[940,100],[1075,119],[1170,157]],
  [[1304,107],[1442,167],[1524,248]],
  [[1632,309],[1665,412],[1618,516]],
  [[1677,625],[1634,741],[1582,826]],
  [[1631,929],[1521,1033],[1390,1038]],
  [[1284,1104],[1160,1073],[1073,1043]],
  [[948,1118],[825,1086],[739,1032]],
  [[624,1092],[505,1057],[414,1000]],
  [[300,989],[220,901],[233,793]],
  [[159,708],[160,590],[192,501]],
  [[139,412],[151,339],[206,292]]
];
const LAND_POLYGON = (() => {
  const points = [LAND_START];
  let start = LAND_START;
  for (const [control1, control2, end] of LAND_CURVES) {
    for (let step = 1; step <= 16; step++) {
      const t = step / 16;
      const inverse = 1 - t;
      const x = inverse ** 3 * start[0] + 3 * inverse ** 2 * t * control1[0] +
        3 * inverse * t ** 2 * control2[0] + t ** 3 * end[0];
      const y = inverse ** 3 * start[1] + 3 * inverse ** 2 * t * control1[1] +
        3 * inverse * t ** 2 * control2[1] + t ** 3 * end[1];
      points.push([x / 18, y / 12]);
    }
    start = end;
  }
  return points;
})();

function pointInLand(x, y) {
  let inside = false;
  for (let i = 0, j = LAND_POLYGON.length - 1; i < LAND_POLYGON.length; j = i++) {
    const [xi, yi] = LAND_POLYGON[i];
    const [xj, yj] = LAND_POLYGON[j];
    const crosses = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** True when the marker center and its small visual safety margin sit on land. */
export function isInsideAtlasLand(x, y, margin = 0.85) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !pointInLand(x, y)) return false;
  for (const offset of OFFSETS.filter((_, index) => index % 6 === 0)) {
    if (!pointInLand(x + offset.x * margin, y + offset.y * margin)) return false;
  }
  return true;
}

function nearestLandPosition(origin) {
  let best = null;
  let bestDistance = Infinity;
  for (let y = 8; y <= 93; y += 0.75) {
    for (let x = 8; x <= 93; x += 0.75) {
      if (!isInsideAtlasLand(x, y)) continue;
      const distance = (x - origin.x) ** 2 + ((y - origin.y) * 1.5) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Presentation-only collision avoidance and coastline containment.
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
    const originIsValid = isInsideAtlasLand(origin.x, origin.y);
    if (!originIsValid || collides(origin)) {
      selected = null;
      search: for (const radius of [2, 3.4, 5.1, 6.8, 8.5, 10.2, 12, 15, 18, 22, 26, 30, 35, 40, 45, 50]) {
        for (const offset of OFFSETS) {
          const candidate = { x: origin.x + offset.x * radius, y: origin.y + offset.y * radius };
          if (isInsideAtlasLand(candidate.x, candidate.y) && !collides(candidate)) {
            selected = candidate;
            break search;
          }
        }
      }
      if (!selected) {
        const nearest = nearestLandPosition(origin);
        if (nearest && !collides(nearest)) selected = nearest;
        else if (nearest) selected = nearest;
      }
    }
    const result = { ...pin, x: selected?.x ?? origin.x, y: selected?.y ?? origin.y };
    delete result._index;
    arranged.set(pin.id ?? pin._index, result);
    placed.push({ x: result.x, y: result.y });
  }
  return source.map((pin, index) => arranged.get(pin.id ?? index) || { ...pin });
}
