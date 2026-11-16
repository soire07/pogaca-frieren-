import test from 'node:test';
import assert from 'node:assert/strict';
import {PET_CATALOG,MAX_PETS_PER_USER,petLevelForXp,normalizePetName} from '../pets.js';
import command from '../pets.js';

test('pet catalog contains nine unique affordable species with support roles',()=>{
 const keys=PET_CATALOG.map(p=>p.key);
 assert.equal(keys.length,9);assert.equal(new Set(keys).size,keys.length);
 assert.ok(PET_CATALOG.every(p=>p.cost>0&&p.cost<=1000&&p.bonus&&p.description));
 assert.equal(MAX_PETS_PER_USER,3);
});
test('pet XP progression is deterministic and capped',()=>{
 assert.equal(petLevelForXp(0),1);assert.equal(petLevelForXp(80),2);
 assert.equal(petLevelForXp(720),4);assert.equal(petLevelForXp(-1),1);
 assert.equal(petLevelForXp(Number.NaN),1);assert.equal(petLevelForXp(10000000),30);
});
test('pet nicknames are normalized and reject unsafe formatting',()=>{
 assert.equal(normalizePetName('  Ay  Dostu  '),'Ay Dostu');
 assert.equal(normalizePetName('A'),null);assert.equal(normalizePetName('x'.repeat(25)),null);
 assert.equal(normalizePetName('@everyone'),null);assert.equal(normalizePetName('<b>fox</b>'),null);
 assert.equal(normalizePetName(null),null);
});
test('pet slash command exposes all core player actions',()=>{
 const json=command.data.toJSON();
 assert.equal(json.name,'evcilhayvan');
 assert.deepEqual(json.options.map(x=>x.name),['katalog','koleksiyon','edin','aktif','ad','bakim','destek']);
});
