import test from 'node:test';
import assert from 'node:assert/strict';
import {HOME_ROOMS,PLAYER_COSMETICS,EVENT_MILESTONES,validateHomeLayout} from '../player-experience.js';

test('personal home rooms have unique keys and nonnegative progression costs',()=>{
 assert.equal(new Set(HOME_ROOMS.map(x=>x.key)).size,HOME_ROOMS.length);
 assert.equal(HOME_ROOMS[0].key,'starter');
 assert.ok(HOME_ROOMS.every(x=>Number.isInteger(x.level)&&x.level>=1&&Number.isInteger(x.cost)&&x.cost>=0));
});
test('general cosmetics cover distinct player-facing slots without duplicate keys',()=>{
 assert.equal(new Set(PLAYER_COSMETICS.map(x=>x.key)).size,PLAYER_COSMETICS.length);
 for(const slot of ['profile_frame','nameplate','title_effect','spell_trail','victory_pose','avatar_border','guild_banner','seasonal_theme','collection_display']){
  assert.ok(PLAYER_COSMETICS.some(x=>x.slot===slot),slot+' catalog is missing');
 }
 assert.ok(PLAYER_COSMETICS.every(x=>x.cost>=0&&x.level>=1));
});
test('home layout rejects duplicate positions, malformed keys and more than twelve decorations',()=>{
 assert.deepEqual(validateHomeLayout([{roomKey:'starter',decorationKey:'book_shelf',position:0}]),[{roomKey:'starter',decorationKey:'book_shelf',position:0}]);
 assert.throws(()=>validateHomeLayout([{roomKey:'starter',decorationKey:'book_shelf',position:0},{roomKey:'starter',decorationKey:'lamp',position:0}]),/HOME_LAYOUT_INVALID/);
 assert.throws(()=>validateHomeLayout([{roomKey:'../users',decorationKey:'lamp',position:0}]),/HOME_LAYOUT_INVALID/);
 assert.throws(()=>validateHomeLayout(Array.from({length:13},(_,i)=>({roomKey:'starter',decorationKey:'lamp_'+i,position:i}))),/HOME_LAYOUT_INVALID/);
});
test('event rewards use only attainable one-time registration and check-in milestones',()=>{
 assert.deepEqual(EVENT_MILESTONES.map(x=>x.key),['participant','checkin']);
 assert.ok(EVENT_MILESTONES.every(x=>x.target===1&&x.coins>0&&x.xp>0));
});
