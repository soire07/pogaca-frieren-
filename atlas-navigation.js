import { FRIEREN_WORLD_SETTLEMENTS, FRIEREN_WORLD_BOSS_LOCATIONS } from './exploration-world-locations.js';

const settlementByKey = new Map(FRIEREN_WORLD_SETTLEMENTS.map(place => [place.key, place]));
const routeNode = (id, label, x, y, kind = 'settlement') => Object.freeze({ id, label, x, y, kind });
const settlementNode = key => {
  const place = settlementByKey.get(key);
  if (!place) throw new Error('Atlas route references an unknown settlement: ' + key);
  return routeNode(place.key, place.name, place.x, place.y);
};

export const ATLAS_ROUTE_STOPS = Object.freeze([
  'royal-capital', 'strahl', 'waal', 'graf-granat', 'fabel-village',
  'village-of-sword', 'aeusserst', 'weise', 'ende', 'demon-kings-castle'
].map(settlementNode));

const waypoints = Object.freeze([
  routeNode('riegel-canyon', 'Riegel Kanyonu geçidi', 47, 69, 'pass'),
  routeNode('schwer-pass', 'Schwer Dağları geçidi', 66, 59, 'pass'),
  routeNode('offen-pass', 'Offen Dağları geçidi', 61, 46, 'pass'),
  routeNode('northern-plateau-gate', 'Kuzey Platosu geçidi', 76, 35, 'pass'),
  routeNode('kino-pass', 'Kino Geçidi', 85, 27, 'pass')
]);

export const ATLAS_ROUTE_NODES = Object.freeze([...ATLAS_ROUTE_STOPS, ...waypoints]);
const nodesById = new Map(ATLAS_ROUTE_NODES.map(node => [node.id, node]));

// The connections are a fan-made traversal graph between named canon locations.
// Passes are explicit intermediate nodes; decorative trails are not treated as roads.
export const ATLAS_ROUTE_EDGES = Object.freeze([
  ['royal-capital', 'strahl'],
  ['strahl', 'riegel-canyon'], ['riegel-canyon', 'waal'],
  ['waal', 'graf-granat'], ['graf-granat', 'fabel-village'],
  ['waal', 'schwer-pass'], ['schwer-pass', 'village-of-sword'],
  ['village-of-sword', 'fabel-village'],
  ['fabel-village', 'offen-pass'], ['offen-pass', 'aeusserst'],
  ['aeusserst', 'northern-plateau-gate'], ['northern-plateau-gate', 'weise'],
  ['weise', 'kino-pass'], ['kino-pass', 'ende'],
  ['ende', 'demon-kings-castle']
].map(edge => Object.freeze(edge)));

const distanceBetween = (a, b) => Math.hypot((a.x - b.x) * 1.5, a.y - b.y);

export function findAtlasRoute(fromId, toId) {
  if (!nodesById.has(fromId) || !nodesById.has(toId)) return null;
  if (fromId === toId) return Object.freeze({ from: fromId, to: toId, nodes: Object.freeze([nodesById.get(fromId)]), distanceUnits: 0 });

  const distances = new Map(ATLAS_ROUTE_NODES.map(node => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const remaining = new Set(nodesById.keys());
  distances.set(fromId, 0);

  while (remaining.size) {
    let current = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of remaining) {
      const candidate = distances.get(id);
      if (candidate < best) { best = candidate; current = id; }
    }
    if (current === null || !Number.isFinite(best)) break;
    if (current === toId) break;
    remaining.delete(current);

    for (const [left, right] of ATLAS_ROUTE_EDGES) {
      const next = left === current ? right : right === current ? left : null;
      if (!next || !remaining.has(next)) continue;
      const candidate = best + distanceBetween(nodesById.get(current), nodesById.get(next));
      if (candidate < distances.get(next)) {
        distances.set(next, candidate);
        previous.set(next, current);
      }
    }
  }

  if (!Number.isFinite(distances.get(toId))) return null;
  const path = [];
  for (let cursor = toId; cursor; cursor = previous.get(cursor)) {
    path.unshift(nodesById.get(cursor));
    if (cursor === fromId) break;
  }
  if (path[0]?.id !== fromId) return null;
  return Object.freeze({
    from: fromId,
    to: toId,
    nodes: Object.freeze(path),
    distanceUnits: Number(distances.get(toId).toFixed(2))
  });
}

export const ATLAS_ZOOM_LEVELS = Object.freeze({ regional: 1.35, local: 2.2 });

export function getAtlasDetailLevel(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 'overview';
  if (value >= ATLAS_ZOOM_LEVELS.local) return 'local';
  if (value >= ATLAS_ZOOM_LEVELS.regional) return 'regional';
  return 'overview';
}

const officialMap = 'https://frieren-anime.jp/special/map/';
const locationGuide = 'https://frieren.fandom.com/wiki/Locations';
const bossMapPoint = FRIEREN_WORLD_BOSS_LOCATIONS.level_10;

export const ATLAS_HISTORICAL_EVENTS = Object.freeze([
  Object.freeze({
    id: 'journey-begins', title: 'Kahraman Partisi ve yolculuğun başlangıcı',
    episodeStart: 1, episodeEnd: 1, episodeLabel: '1. bölüm',
    location: 'Kraliyet Başkenti', anchorKey: 'royal-capital', regionKey: 'merkez',
    ...settlementByKey.get('royal-capital'),
    description: 'Himmel ve kahraman partisinin yolculuğunun başladığı başkent.',
    officialSource: officialMap, locationSource: locationGuide,
    episodeSources: Object.freeze([{ label: 'Bölüm 01', url: 'https://frieren-anime.jp/story/1st/ep01/' }])
  }),
  Object.freeze({
    id: 'riegel-canyon-village-hero', title: 'Riegel Kanyonu köyünün kahramanı',
    episodeStart: 6, episodeEnd: 6, episodeLabel: '6. bölüm',
    location: 'Riegel Kanyonu kıyısındaki köy', anchorKey: 'riegel-canyon', regionKey: 'merkez',
    ...nodesById.get('riegel-canyon'),
    description: 'Resmî 6. bölüm özeti, Riegel Kanyonu boyunca uzanan köyü ve Stark’ın köyü korumasını doğrular.',
    officialSource: officialMap, locationSource: 'https://frieren-anime.jp/story/ep06/',
    episodeSources: Object.freeze([{ label: 'Bölüm 06', url: 'https://frieren-anime.jp/story/ep06/' }])
  }),
  Object.freeze({
    id: 'graf-granat-aura', title: 'Graf Granat bölgesinde Aura olayı',
    episodeStart: 8, episodeEnd: 9, episodeLabel: '8–9. bölümler',
    location: 'Graf Granat Bölgesi', anchorKey: 'graf-granat', regionKey: 'harabeler',
    ...settlementByKey.get('graf-granat'),
    description: 'Graf Granat ve Aura çatışmasının bölüm özetleriyle doğrulanan olay kaydı.',
    officialSource: officialMap, locationSource: 'https://frieren.fandom.com/wiki/Story_Arcs',
    episodeSources: Object.freeze([{ label: 'Bölüm 08', url: 'https://frieren-anime.jp/story/ep08/' }, { label: 'Bölüm 09', url: 'https://frieren-anime.jp/story/ep09/' }])
  }),
  Object.freeze({
    id: 'first-class-mage-exam', title: 'Birinci Sınıf Büyücü Sınavı',
    episodeStart: 18, episodeEnd: 28, episodeLabel: '18–28. bölümler',
    location: 'Äußerst', anchorKey: 'aeusserst', regionKey: 'kuzey',
    ...settlementByKey.get('aeusserst'),
    description: 'Sınavın başlangıcı ve finali resmî bölüm özetleriyle kaynaklandırılmıştır.',
    officialSource: officialMap, locationSource: locationGuide,
    episodeSources: Object.freeze([{ label: 'Bölüm 18', url: 'https://frieren-anime.jp/story/ep18/' }, { label: 'Bölüm 28', url: 'https://frieren-anime.jp/story/ep28/' }])
  }),
  Object.freeze({
    id: 'kings-tomb-exam', title: 'Kralın Mezarı Harabeleri sınavı',
    episodeStart: 23, episodeEnd: 26, episodeLabel: '23–26. bölümler',
    location: 'Kralın Mezarı Harabeleri', anchorKey: 'harabeler', regionKey: 'harabeler',
    x: bossMapPoint.x, y: bossMapPoint.y,
    description: 'Zindan sınavı ve Spiegel karşılaşması resmî bölüm özetleriyle kaynaklandırılmıştır.',
    officialSource: officialMap, locationSource: locationGuide,
    episodeSources: Object.freeze([{ label: 'Bölüm 23', url: 'https://frieren-anime.jp/story/ep23/' }, { label: 'Bölüm 26', url: 'https://frieren-anime.jp/story/ep26/' }])
  })
]);

export const ATLAS_EVENT_ANCHORS = Object.freeze(ATLAS_HISTORICAL_EVENTS.map(event => Object.freeze({
  id: event.id, label: event.title, x: event.x, y: event.y, regionKey: event.regionKey
})));
