import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_CATALOG, FISHING_COOLDOWN_MS, FISHING_ZONES, FISHING_RODS, FISHING_BAITS, getFishingZone, getFishingWeightTable, rollFish } from '../fishing.js';
import fishingCommand from '../balik.js';
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

test('rod upgrades and bait packs are bounded, priced and zone-specific', () => {
  assert.deepEqual(FISHING_RODS.map(item=>item.level),[1,2,3]);
  assert.equal(FISHING_RODS[0].upgradeCost,0);
  assert.ok(FISHING_RODS[1].upgradeCost>0&&FISHING_RODS[2].upgradeCost>FISHING_RODS[1].upgradeCost);
  assert.ok(FISHING_BAITS.length>=3);
  assert.ok(FISHING_BAITS.every(item=>item.packSize===5&&item.price>0&&item.zones.length>0));
});

test('rod and bait improve weighted fishing outcomes without adding fish outside a zone', () => {
  const base=getFishingWeightTable('kuzey_kiyisi');
  const upgraded=getFishingWeightTable('kuzey_kiyisi',{rodLevel:3,baitKey:'rare'});
  const baseRare=base.filter(item=>item.fish.rarity!=='Yaygın').reduce((sum,item)=>sum+item.weight,0);
  const upgradedRare=upgraded.filter(item=>item.fish.rarity!=='Yaygın').reduce((sum,item)=>sum+item.weight,0);
  const baseTotal=base.reduce((sum,item)=>sum+item.weight,0);
  const upgradedTotal=upgraded.reduce((sum,item)=>sum+item.weight,0);
  assert.ok(upgradedRare/upgradedTotal>baseRare/baseTotal);
  const frostBaseTable=getFishingWeightTable('buzul_golu');
  const frost=getFishingWeightTable('buzul_golu',{baitKey:'frost'});
  const frostBase=frostBaseTable.find(item=>item.fish.key==='frost_carp').weight;
  const frostBoost=frost.find(item=>item.fish.key==='frost_carp').weight;
  assert.ok(frostBoost>frostBase);
  assert.ok(upgraded.every(item=>item.fish.zones.includes('kuzey_kiyisi')));
});

test('fishing command exposes gear, rod and bait management alongside collection', () => {
  const schema=fishingCommand.data.toJSON();
  assert.equal(schema.name,'balik');
  assert.deepEqual(schema.options.map(option=>option.name),['avlan','defter','ekipman','olta','yem']);
  const bait=schema.options.find(option=>option.name==='yem');
  assert.equal(bait.options[0].name,'tur');
  assert.equal(bait.options[0].choices.length,FISHING_BAITS.length);
});
