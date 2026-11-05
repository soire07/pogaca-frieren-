import test from 'node:test';
import assert from 'node:assert/strict';
import {HOME_ROOMS,HOME_DECORATIONS,HOME_STATIONS,ALCHEMY_RECIPES,PLAYER_COSMETICS,EVENT_MILESTONES,validateHomeLayout} from '../player-experience.js';
import * as playerExperience from '../player-experience.js';

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
 assert.ok(HOME_DECORATIONS.includes('book_shelf'));
 assert.deepEqual(validateHomeLayout([{roomKey:'starter',decorationKey:'book_shelf',position:0}]),[{roomKey:'starter',decorationKey:'book_shelf',position:0}]);
 assert.throws(()=>validateHomeLayout([{roomKey:'starter',decorationKey:'unknown_item',position:0}]),/HOME_LAYOUT_INVALID/);
 assert.throws(()=>validateHomeLayout([{roomKey:'starter',decorationKey:'book_shelf',position:0},{roomKey:'starter',decorationKey:'lamp',position:0}]),/HOME_LAYOUT_INVALID/);
 assert.throws(()=>validateHomeLayout([{roomKey:'../users',decorationKey:'lamp',position:0}]),/HOME_LAYOUT_INVALID/);
 assert.throws(()=>validateHomeLayout(Array.from({length:13},(_,i)=>({roomKey:'starter',decorationKey:'lamp_'+i,position:i}))),/HOME_LAYOUT_INVALID/);
});
test('event rewards use only attainable one-time registration and check-in milestones',()=>{
 assert.deepEqual(EVENT_MILESTONES.map(x=>x.key),['participant','checkin']);
 assert.ok(EVENT_MILESTONES.every(x=>x.target===1&&x.coins>0&&x.xp>0));
});

test('home stations reference existing commands and alchemy recipes consume known materials',()=>{assert.equal(new Set(HOME_STATIONS.map(x=>x.roomKey)).size,HOME_STATIONS.length);assert.ok(HOME_STATIONS.some(x=>x.roomKey==='garden'&&x.commands.includes('/bahce durum')));assert.ok(ALCHEMY_RECIPES.length>0);assert.ok(ALCHEMY_RECIPES.every(x=>x.materials.length>0&&x.output));});


test('profile settings normalize all privacy flags and reject malformed values',()=>{
 assert.equal(typeof playerExperience.normalizeProfileSettings,'function');
 assert.equal(playerExperience.DEFAULT_PLAYER_PROFILE_SETTINGS.show_collections,true);
 assert.equal(playerExperience.DEFAULT_PLAYER_PROFILE_SETTINGS.show_activity,false);
 assert.deepEqual(playerExperience.normalizeProfileSettings({
  showStats:true,showAchievements:false,showCollections:true,showActivity:false,showCosmetics:true,activeTitle:'Kıdemli Maceracı'
 }),{showStats:true,showAchievements:false,showCollections:true,showActivity:false,showCosmetics:true,activeTitle:'Kıdemli Maceracı'});
 assert.throws(()=>playerExperience.normalizeProfileSettings({showStats:'yes'}),/PROFILE_SETTINGS_INVALID/);
 assert.throws(()=>playerExperience.normalizeProfileSettings({showStats:true,showAchievements:true,showCollections:true,showActivity:true,showCosmetics:true,activeTitle:'x'.repeat(81)}),/PROFILE_SETTINGS_INVALID/);
});

test('profile settings update only when selected title is owned by the linked player',async()=>{
 assert.equal(typeof playerExperience.setPlayerProfileSettings,'function');
 const calls=[];
 const db={async query(sql,params){calls.push({sql,params});if(sql.includes('SELECT 1 FROM user_titles'))return{rows:[{title:params[2]}],rowCount:1};return{rows:[],rowCount:1};}};
 const result=await playerExperience.setPlayerProfileSettings(db,{guildId:'1539562273197260860',userId:'123456789012345678',settings:{
  showStats:true,showAchievements:true,showCollections:false,showActivity:false,showCosmetics:true,activeTitle:'Kıdemli Maceracı'
 }});
 assert.equal(result.status,'updated');
 assert.ok(calls.some(x=>x.sql.includes('INSERT INTO player_profile_settings')));
 assert.ok(calls.some(x=>x.sql.includes('FROM user_titles')));
 const deniedCalls=[];
 const deniedDb={async query(sql){deniedCalls.push(sql);if(sql.includes('SELECT 1 FROM user_titles'))return{rows:[],rowCount:0};return{rows:[],rowCount:1};}};
 const denied=await playerExperience.setPlayerProfileSettings(deniedDb,{guildId:'1539562273197260860',userId:'123456789012345678',settings:{
  showStats:false,showAchievements:true,showCollections:false,showActivity:false,showCosmetics:true,activeTitle:'Başkasının Unvanı'
 }});
 assert.equal(denied.status,'title_not_owned');
 assert.equal(deniedCalls.some(sql=>sql.includes('INSERT INTO player_profile_settings')),false);
});


test('missing profile preferences return conservative defaults without exposing new private sections',async()=>{
 assert.equal(typeof playerExperience.getPlayerProfileSettings,'function');
 const db={async query(sql){if(sql.includes('FROM player_profile_settings'))return{rows:[],rowCount:0};return{rows:[],rowCount:0};}};
 const settings=await playerExperience.getPlayerProfileSettings(db,{guildId:'1539562273197260860',userId:'123456789012345678'});
 assert.equal(settings.show_stats,false);
 assert.equal(settings.show_achievements,true);
 assert.equal(settings.show_collections,true);
 assert.equal(settings.show_activity,false);
 assert.equal(settings.show_cosmetics,true);
 assert.equal(settings.active_title,null);
});
