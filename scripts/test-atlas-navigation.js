import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_HISTORICAL_EVENTS, ATLAS_ROUTE_STOPS, findAtlasRoute, getAtlasDetailLevel } from '../atlas-navigation.js';
import { renderExplorationAtlas } from '../exploration-atlas.js';

test('atlas route planner finds a connected road-and-pass route with honest map-unit distance', () => {
  const route = findAtlasRoute('royal-capital', 'ende');
  assert.ok(route, 'Royal Capital to Ende should be connected by the mapped road network');
  assert.equal(route.from, 'royal-capital');
  assert.equal(route.to, 'ende');
  assert.equal(route.nodes[0].id, 'royal-capital');
  assert.equal(route.nodes.at(-1).id, 'ende');
  assert.ok(route.nodes.some(node => node.id === 'riegel-canyon'));
  assert.ok(route.nodes.some(node => node.id === 'offen-pass'));
  assert.ok(route.nodes.some(node => node.id === 'kino-pass'));
  assert.ok(route.distanceUnits > 0);
  assert.ok(route.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(!Object.hasOwn(route, 'kilometers'), 'the fan atlas has no authoritative kilometre scale');
});

test('atlas route planner returns a zero-distance route for the same stop and rejects unknown stops', () => {
  const same = findAtlasRoute('strahl', 'strahl');
  assert.ok(same);
  assert.equal(same.distanceUnits, 0);
  assert.equal(same.nodes.length, 1);
  assert.equal(findAtlasRoute('strahl', 'not-a-place'), null);
  assert.equal(findAtlasRoute('', 'ende'), null);
});

test('route endpoints are known canon settlements and route geometry does not mutate their coordinates', () => {
  const snapshot = structuredClone(ATLAS_ROUTE_STOPS);
  const route = findAtlasRoute('waal', 'aeusserst');
  assert.ok(route);
  assert.deepEqual(ATLAS_ROUTE_STOPS, snapshot);
  assert.ok(ATLAS_ROUTE_STOPS.some(stop => stop.id === 'waal' && stop.label === 'Waal'));
  assert.ok(ATLAS_ROUTE_STOPS.some(stop => stop.id === 'aeusserst' && stop.label === 'Äußerst'));
});

test('historical event markers are anchored to known places and carry episode/source evidence', () => {
  assert.ok(ATLAS_HISTORICAL_EVENTS.length >= 5);
  for (const event of ATLAS_HISTORICAL_EVENTS) {
    assert.ok(event.id && event.title && event.location && event.anchorKey);
    assert.ok(Number.isInteger(event.episodeStart) && event.episodeStart > 0);
    assert.ok(Number.isInteger(event.episodeEnd) && event.episodeEnd >= event.episodeStart);
    assert.match(event.officialSource, /^https:\/\/frieren-anime\.jp\//);
    assert.match(event.locationSource, /^https:\/\//);
    assert.ok(Number.isFinite(event.x) && Number.isFinite(event.y));
  }
  assert.ok(ATLAS_HISTORICAL_EVENTS.some(event => event.anchorKey === 'royal-capital' && event.episodeStart === 1));
  assert.ok(ATLAS_HISTORICAL_EVENTS.some(event => event.anchorKey === 'waal' && event.episodeStart === 6));
  assert.ok(ATLAS_HISTORICAL_EVENTS.some(event => event.anchorKey === 'graf-granat'));
  assert.ok(ATLAS_HISTORICAL_EVENTS.some(event => event.anchorKey === 'aeusserst' && event.episodeStart === 18));
});

test('atlas zoom detail levels progress predictably without changing the camera scale', () => {
  assert.equal(getAtlasDetailLevel(0.85), 'overview');
  assert.equal(getAtlasDetailLevel(1.34), 'overview');
  assert.equal(getAtlasDetailLevel(1.35), 'regional');
  assert.equal(getAtlasDetailLevel(2.19), 'regional');
  assert.equal(getAtlasDetailLevel(2.2), 'local');
  assert.equal(getAtlasDetailLevel(3.2), 'local');
  assert.equal(getAtlasDetailLevel(Number.NaN), 'overview');
});

test('rendered atlas exposes route, event and zoom-level controls accessibly', () => {
  const regions = [
    ['merkez', 'Merkez Topraklar', 1], ['orman', 'Größe Ormanı', 1],
    ['harabeler', 'Harabeler', 10], ['kuzey', 'Kuzey Toprakları', 20],
    ['yayla', 'Kuzey Yaylaları', 35], ['aus', 'Ende', 50]
  ].map(([key, name, minLevel]) => ({
    region: { key, name, minLevel, emoji: '✧' }, visits: 1, discovered: true,
    unlocked: true, state: 'discovered', masteryLevel: 0, visitsToNextMastery: 1,
    masteryProgressPercent: 33, bosses: [], dungeons: [], rareItems: [], dungeonWins: 0
  }));
  const html = renderExplorationAtlas({
    mapContent: { regions, summary: { discoveredRegions: 6, totalRegions: 6, defeatedBosses: 0, totalBosses: 0, totalDungeons: 0 } },
    stats: {}
  });
  assert.match(html, /data-atlas-route-planner/);
  assert.match(html, /data-atlas-route-from/);
  assert.match(html, /data-atlas-route-to/);
  assert.match(html, /data-atlas-route-submit/);
  assert.match(html, /data-atlas-route-path/);
  assert.match(html, /data-atlas-event=/);
  assert.match(html, /data-atlas-zoom-detail="overview"/);
  assert.match(html, /data-atlas-detail-level="regional"/);
  assert.match(html, /data-atlas-detail-level="local"/);
  assert.match(html, /kilometre ölçeği belirtilmemiştir/i);
});
