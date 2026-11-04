import test from 'node:test';import assert from 'node:assert/strict';
import {FARM_SEEDS,farmYield,seasonForDate} from '../farming.js';
test('farm seeds have unique stable keys and positive growth/cost values',()=>{const keys=FARM_SEEDS.map(x=>x.key);assert.equal(new Set(keys).size,keys.length);assert.ok(FARM_SEEDS.every(x=>x.cost>0&&x.growMinutes>0&&x.minLevel>=1));});
test('UTC seasons are deterministic at month boundaries',()=>{assert.equal(seasonForDate(new Date('2026-02-28T23:59:00Z')),'winter');assert.equal(seasonForDate(new Date('2026-03-01T00:00:00Z')),'spring');assert.equal(seasonForDate(new Date('2026-06-01T00:00:00Z')),'summer');assert.equal(seasonForDate(new Date('2026-09-01T00:00:00Z')),'autumn');});
test('matching season grants one additional harvest item',()=>{assert.equal(farmYield('starflower',new Date('2026-10-01T00:00:00Z')),2);assert.equal(farmYield('starflower',new Date('2026-06-01T00:00:00Z')),1);assert.equal(farmYield('unknown',new Date()),0);});
