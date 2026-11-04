import test from 'node:test';import assert from 'node:assert/strict';
import {characters} from '../character-data.js';import {CHARACTER_WISHLIST_LIMIT,searchCharacterChoices} from '../character-wishlist.js';
test('character wishlist has a bounded limit and uses the canonical character catalog',()=>{assert.equal(CHARACTER_WISHLIST_LIMIT,10);assert.ok(characters.length>=25);assert.equal(new Set(characters.map(x=>x.name)).size,characters.length);});
test('character autocomplete is case-insensitive, bounded and returns canonical names',()=>{const frieren=searchCharacterChoices('fri');assert.ok(frieren.some(x=>x.value==='Frieren'));assert.ok(frieren.length<=25);assert.deepEqual(searchCharacterChoices('no-such-character'),[]);});
