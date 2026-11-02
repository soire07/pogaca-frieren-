import test from 'node:test';import assert from 'node:assert/strict';
import {CREATURE_CATALOG,CREATURE_SPAWN_CHANCE,rollCreature} from '../creatures.js';
test('creature catalog uses unique keys and valid weighted rarities',()=>{const keys=CREATURE_CATALOG.map(x=>x.key);assert.equal(new Set(keys).size,keys.length);assert.equal(CREATURE_CATALOG.reduce((n,x)=>n+x.weight,0),100);assert.ok(CREATURE_CATALOG.every(x=>x.weight>0&&x.name&&x.emoji));});
test('spawn chance is bounded and weighted selection returns catalog entries',()=>{assert.equal(CREATURE_SPAWN_CHANCE,.005);assert.equal(rollCreature(()=>0).key,CREATURE_CATALOG[0].key);assert.equal(rollCreature(()=>.999999).key,CREATURE_CATALOG.at(-1).key);});
