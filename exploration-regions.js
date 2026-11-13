/**
 * Single source of truth for the six regions exposed by /kesif and the web atlas.
 * Coordinates are presentation-only SVG positions; progression uses the real region keys.
 */
export const EXPLORATION_REGION_CATALOG = Object.freeze([
  Object.freeze({ key: 'merkez', name: 'Merkez Topraklar', emoji: '🌾', minLevel: 1, x: 10, y: 58 }),
  Object.freeze({ key: 'orman', name: 'Büyük Orman Yolu', emoji: '🌲', minLevel: 5, x: 27, y: 30 }),
  Object.freeze({ key: 'harabeler', name: 'Kadim Harabeler', emoji: '🏚️', minLevel: 12, x: 44, y: 55 }),
  Object.freeze({ key: 'kuzey', name: 'Kuzey Topraklarına Giden Yol', emoji: '❄️', minLevel: 20, x: 62, y: 27 }),
  Object.freeze({ key: 'yayla', name: 'Kuzey Yaylaları', emoji: '🏔️', minLevel: 35, x: 79, y: 52 }),
  Object.freeze({ key: 'aus', name: 'Äußerst Sınav Rotası', emoji: '🏰', minLevel: 50, x: 94, y: 19 })
]);

export const EXPLORATION_REGION_BY_KEY = Object.freeze(
  Object.fromEntries(EXPLORATION_REGION_CATALOG.map(region => [region.key, region]))
);
