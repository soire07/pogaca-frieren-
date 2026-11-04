import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';
import {adoptCompanion,careForCompanion,equipCompanionCosmetic,evolveCompanion,getCompanion,getCompanionEvolutionHistory,initCompanionSchema} from '../companions.js';
const guild='companion-audit-guild',user='companion-audit-user',poorUser='companion-audit-poor',lockUser='companion-audit-lock',evolutionUser='companion-audit-evolution',evolutionPoor='companion-audit-evolution-poor',evolutionRace='companion-audit-evolution-race';
before(async()=>{
 await initDatabase();await initCompanionSchema(pool);
 await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id IN ($2,$3,$4,$5,$6,$7)',[guild,user,poorUser,lockUser,evolutionUser,evolutionPoor,evolutionRace]);
 await pool.query('INSERT INTO users(guild_id,user_id,coins) VALUES($1,$2,1000),($1,$3,0),($1,$4,1000),($1,$5,20000),($1,$6,500),($1,$7,20000)',[guild,user,poorUser,lockUser,evolutionUser,evolutionPoor,evolutionRace]);
});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id IN ($2,$3,$4,$5,$6,$7)',[guild,user,poorUser,lockUser,evolutionUser,evolutionPoor,evolutionRace]);await pool.end();});
test('concurrent adoption charges once and persists exactly one companion',async()=>{
 const results=await Promise.all([
  adoptCompanion(pool,{guildId:guild,userId:user,companionKey:'flamme_fox'}),
  adoptCompanion(pool,{guildId:guild,userId:user,companionKey:'moon_owl'})
 ]);
 assert.equal(results.filter(x=>x.status==='adopted').length,1);
 assert.equal(results.filter(x=>x.status==='already_has_companion').length,1);
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(balance.rows[0].coins),1000-results.find(x=>x.status==='adopted').companion.cost);
 assert.ok(await getCompanion(pool,guild,user));
});
test('companion care serializes cooldowns, bounds stats and charges training atomically',async()=>{
 const beforeBalance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 const trained=await Promise.all([
  careForCompanion(pool,{guildId:guild,userId:user,action:'train'}),
  careForCompanion(pool,{guildId:guild,userId:user,action:'train'})
 ]);
 assert.equal(trained.filter(x=>x.status==='cared').length,1);
 assert.equal(trained.filter(x=>x.status==='cooldown').length,1);
 const pet=await getCompanion(pool,guild,user);
 assert.equal(Number(pet.xp),25);assert.equal(Number(pet.level),1);
 assert.ok(pet.happiness>=0&&pet.happiness<=100);
 assert.ok(pet.energy>=0&&pet.energy<=100);
 assert.ok(pet.hunger>=0&&pet.hunger<=100);
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(balance.rows[0].coins),Number(beforeBalance.rows[0].coins)-100);
});
test('insufficient funds and missing companion do not mutate player state',async()=>{
 const noPet=await careForCompanion(pool,{guildId:guild,userId:poorUser,action:'feed'});
 assert.equal(noPet.status,'no_companion');
 const adoption=await adoptCompanion(pool,{guildId:guild,userId:poorUser,companionKey:'flamme_fox'});
 assert.equal(adoption.status,'insufficient_funds');
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,poorUser]);
 assert.equal(Number(balance.rows[0].coins),0);
});

test('companion cosmetics charge once, can be re-equipped free and can be reset',async()=>{
 const before=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 const first=await equipCompanionCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:'starlight_ribbon'});
 assert.equal(first.status,'equipped');
 const afterPurchase=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(afterPurchase.rows[0].coins),Number(before.rows[0].coins)-250);
 const again=await equipCompanionCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:'starlight_ribbon'});
 assert.equal(again.status,'equipped');assert.equal(again.alreadyOwned,true);
 const afterAgain=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(afterAgain.rows[0].coins),Number(afterPurchase.rows[0].coins));
 assert.equal((await getCompanion(pool,guild,user)).cosmetic.key,'starlight_ribbon');
 assert.equal((await equipCompanionCosmetic(pool,{guildId:guild,userId:user,cosmeticKey:'default'})).status,'equipped');
 assert.equal((await getCompanion(pool,guild,user)).cosmetic,null);
});


test('concurrent companion training and cosmetic equip complete with a consistent lock order',async()=>{
 const adopted=await adoptCompanion(pool,{guildId:guild,userId:lockUser,companionKey:'flamme_fox'});
 assert.equal(adopted.status,'adopted');
 const results=await Promise.all([
  careForCompanion(pool,{guildId:guild,userId:lockUser,action:'train'}),
  equipCompanionCosmetic(pool,{guildId:guild,userId:lockUser,cosmeticKey:'frost_cloak'})
 ]);
 assert.equal(results[0].status,'cared');
 assert.equal(results[1].status,'equipped');
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,lockUser]);
 assert.equal(Number(balance.rows[0].coins),1000-adopted.companion.cost-100-400);
});


test('companion evolution is level-gated, charges atomically and records each stage once',async()=>{
 const adopted=await adoptCompanion(pool,{guildId:guild,userId:evolutionUser,companionKey:'flamme_fox'});
 assert.equal(adopted.status,'adopted');
 await pool.query('UPDATE user_companions SET xp=8100,level=10 WHERE guild_id=$1 AND user_id=$2',[guild,evolutionUser]);
 const first=await evolveCompanion(pool,{guildId:guild,userId:evolutionUser});
 assert.equal(first.status,'evolved');
 assert.equal(first.evolution.stage,1);
 assert.equal(first.evolution.name,'Kor Alev Tilkisi');
 const pet=await getCompanion(pool,guild,evolutionUser);
 assert.equal(Number(pet.evolution_stage),1);
 assert.equal(pet.displayName,'Kor Alev Tilkisi');
 const locked=await evolveCompanion(pool,{guildId:guild,userId:evolutionUser});
 assert.equal(locked.status,'level_locked');
 assert.equal(locked.requiredLevel,25);
 const history=await pool.query('SELECT stage,coin_cost FROM user_companion_evolution_history WHERE guild_id=$1 AND user_id=$2 ORDER BY stage',[guild,evolutionUser]);
 assert.deepEqual(history.rows.map(row=>[Number(row.stage),Number(row.coin_cost)]),[[1,1000]]);
 const historyView=await getCompanionEvolutionHistory(pool,{guildId:guild,userId:evolutionUser});
 assert.deepEqual(historyView.map(row=>[Number(row.stage),row.evolution_name]),[[1,'Kor Alev Tilkisi']]);
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,evolutionUser]);
 assert.equal(Number(balance.rows[0].coins),20000-adopted.companion.cost-1000);
});

test('companion evolution rejects insufficient funds without changing form or history',async()=>{
 const adopted=await adoptCompanion(pool,{guildId:guild,userId:evolutionPoor,companionKey:'moon_owl'});
 assert.equal(adopted.status,'insufficient_funds');
 await pool.query('UPDATE users SET coins=650 WHERE guild_id=$1 AND user_id=$2',[guild,evolutionPoor]);
 assert.equal((await adoptCompanion(pool,{guildId:guild,userId:evolutionPoor,companionKey:'moon_owl'})).status,'adopted');
 await pool.query('UPDATE user_companions SET xp=8100,level=10 WHERE guild_id=$1 AND user_id=$2',[guild,evolutionPoor]);
 const result=await evolveCompanion(pool,{guildId:guild,userId:evolutionPoor});
 assert.equal(result.status,'insufficient_funds');
 const pet=await getCompanion(pool,guild,evolutionPoor);
 assert.equal(Number(pet.evolution_stage),0);
 const history=await pool.query('SELECT COUNT(*)::int AS count FROM user_companion_evolution_history WHERE guild_id=$1 AND user_id=$2',[guild,evolutionPoor]);
 assert.equal(history.rows[0].count,0);
});

test('concurrent evolution attempts cannot charge or record the same stage twice',async()=>{
  const adopted=await adoptCompanion(pool,{guildId:guild,userId:evolutionRace,companionKey:'flamme_fox'});
 assert.equal(adopted.status,'adopted');
 await pool.query('UPDATE user_companions SET xp=8100,level=10 WHERE guild_id=$1 AND user_id=$2',[guild,evolutionRace]);
 const before=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,evolutionRace]);
 const results=await Promise.all([
  evolveCompanion(pool,{guildId:guild,userId:evolutionRace}),
  evolveCompanion(pool,{guildId:guild,userId:evolutionRace})
 ]);
 assert.equal(results.filter(result=>result.status==='evolved').length,1);
 assert.equal(results.filter(result=>result.status==='level_locked').length,1);
 const after=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,evolutionRace]);
 assert.equal(Number(after.rows[0].coins),Number(before.rows[0].coins)-1000);
 const history=await pool.query('SELECT COUNT(*)::int AS count FROM user_companion_evolution_history WHERE guild_id=$1 AND user_id=$2 AND stage=1',[guild,evolutionRace]);
 assert.equal(history.rows[0].count,1);
});
