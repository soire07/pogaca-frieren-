import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';
import {ensureAdventurerPlatformTables,createGuildEvent,joinGuildEvent} from '../adventurer-platform.js';
import {HOME_ROOMS,PLAYER_COSMETICS,getPlayerHome,unlockHomeRoom,saveHomeLayout,getHomeTrophies,placeHomeTrophy,getCosmeticAcquisitionHistory,purchaseCosmetic,equipCosmetic,saveCosmeticPreset,applyCosmeticPreset,checkInGuildEvent,claimEventMilestone} from '../player-experience.js';
const guild='1539562273197260860',user='123456789012345678';
let eventId;
before(async()=>{
 await initDatabase();await ensureAdventurerPlatformTables(pool);
 await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 await pool.query('INSERT INTO users(guild_id,user_id,level,coins) VALUES($1,$2,50,50000)',[guild,user]);
 const event=await createGuildEvent(pool,{guildId:guild,createdBy:'123456789012345678',title:'Audit Event',startsAt:new Date(Date.now()+60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
 eventId=event.eventId;
});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);await pool.end();});
test('home room unlock and layout persist only supported unlocked rooms and decorations',async()=>{
 const home=await getPlayerHome(pool,{guildId:guild,userId:user});
 assert.equal(home.home.active_room,'starter');
 assert.ok(home.rooms.some(x=>x.room_key==='starter'));
 const unlocked=await unlockHomeRoom(pool,{guildId:guild,userId:user,roomKey:'library'});
 assert.equal(unlocked.status,'unlocked');
 assert.equal((await unlockHomeRoom(pool,{guildId:guild,userId:user,roomKey:'trophy'})).status,'unlocked');
 await pool.query('INSERT INTO achievement_claims(guild_id,user_id,achievement_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[guild,user,'audit_trophy']);
 assert.equal((await placeHomeTrophy(pool,{guildId:guild,userId:user,achievementKey:'audit_trophy',displaySlot:0})).status,'placed');
 assert.equal((await getHomeTrophies(pool,{guildId:guild,userId:user})).find(x=>x.achievement_key==='audit_trophy').display_slot,0);
 const saved=await saveHomeLayout(pool,{guildId:guild,userId:user,activeRoom:'library',layout:[{roomKey:'library',decorationKey:'book_shelf',position:0},{roomKey:'starter',decorationKey:'mana_lamp',position:1}]});
 assert.equal(saved.status,'saved');
 await assert.rejects(()=>saveHomeLayout(pool,{guildId:guild,userId:user,activeRoom:'library',layout:[{roomKey:'library',decorationKey:'unknown',position:0}]}),/HOME_LAYOUT_INVALID/);
});
test('cosmetic purchase is single-charge, equip is ownership-gated and presets persist',async()=>{
 const item=PLAYER_COSMETICS[0];
 const before=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 const results=await Promise.all([purchaseCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:item.key}),purchaseCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:item.key})]);
 assert.equal(results.filter(x=>x.status==='purchased').length,1);
 assert.equal(results.filter(x=>x.status==='already_owned').length,1);
 const after=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(after.rows[0].coins),Number(before.rows[0].coins)-item.cost);
 assert.equal((await equipCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:item.key})).status,'equipped');
 assert.equal((await saveCosmeticPreset(pool,{guildId:guild,userId:user,presetName:'Gece'})).status,'saved');
 assert.equal((await applyCosmeticPreset(pool,{guildId:guild,userId:user,presetName:'Gece'})).status,'applied');
 const history=await getCosmeticAcquisitionHistory(pool,{guildId:guild,userId:user});
 assert.equal(history.find(x=>x.cosmetic_key===item.key).acquisition_source,'shop');
 assert.equal((await applyCosmeticPreset(pool,{guildId:guild,userId:user,presetName:'Eksik'})).status,'preset_missing');
});
test('event registration and check-in progress award each milestone once',async()=>{
 const before=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 await joinGuildEvent(pool,{guildId:guild,eventId,userId:user});
 await pool.query('UPDATE guild_events SET starts_at=NOW()-INTERVAL \'1 minute\' WHERE event_id=$1',[eventId]);
 assert.equal((await checkInGuildEvent(pool,{guildId:guild,userId:user,eventId})).status,'checked_in');
 assert.equal((await checkInGuildEvent(pool,{guildId:guild,userId:user,eventId})).status,'already_checked_in');
 await pool.query("UPDATE guild_events SET ends_at=NOW()-INTERVAL '1 second',status='completed' WHERE event_id=$1",[eventId]);
 const claims=await Promise.all([
  claimEventMilestone(pool,{guildId:guild,userId:user,eventId,rewardKey:'participant'}),
  claimEventMilestone(pool,{guildId:guild,userId:user,eventId,rewardKey:'participant'})
 ]);
 assert.equal(claims.filter(x=>x.status==='claimed').length,1);
 assert.equal(claims.filter(x=>x.status==='already_claimed').length,1);
 assert.equal((await claimEventMilestone(pool,{guildId:guild,userId:user,eventId,rewardKey:'checkin'})).status,'claimed');
 assert.equal((await claimEventMilestone(pool,{guildId:guild,userId:user,eventId,rewardKey:'checkin'})).status,'already_claimed');
 const balance=await pool.query('SELECT coins,xp FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(balance.rows[0].coins),Number(before.rows[0].coins)+100+150);
 assert.equal(Number(balance.rows[0].xp),Number(before.rows[0].xp)+25+40);
 const history=await getCosmeticAcquisitionHistory(pool,{guildId:guild,userId:user});
 assert.equal(history.find(x=>x.cosmetic_key==='spring_theme').acquisition_source,'event');
 assert.equal(history.find(x=>x.cosmetic_key==='winter_theme').acquisition_source,'event');
});
