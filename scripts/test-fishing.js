import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_CATALOG, FISHING_COOLDOWN_MS, FISHING_ZONES, getFishingZone, rollFish } from '../fishing.js';
test('fish catalog keys, rarities and weights are valid', () => {
  const keys = FISH_CATALOG.map(item => item.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(FISH_CATALOG.length >= 6);
  assert.ok(FISH_CATALOG.every(item => item.weight > 0 && item.zones.length > 0 && ['Yaygın','Nadir','Destansı','Efsanevi'].includes(item.rarity)));
});
test('fishing zones enforce level gates and reject unknown zones', () => {
  assert.equal(getFishingZone('kuzey_kiyisi',1).status,'available');
  assert.equal(getFishingZone('buzul_golu',9).requiredLevel,10);
  assert.equal(getFishingZone('mana_nehri',20).status,'available');
  assert.equal(getFishingZone('unknown',99).status,'invalid_zone');
});
test('weighted fish selection stays inside the requested region', () => {
  const first=rollFish('kuzey_kiyisi',()=>0), last=rollFish('mana_nehri',()=>.999999);
  assert.ok(first.zones.includes('kuzey_kiyisi'));
  assert.ok(last.zones.includes('mana_nehri'));
  assert.equal(rollFish('unknown',()=>0),null);
});
test('fishing cooldown is fixed at 30 minutes', () => {
  assert.equal(FISHING_COOLDOWN_MS,1800000);
  assert.ok(FISHING_ZONES.every(zone=>Number.isInteger(zone.minLevel)));
});
