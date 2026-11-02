import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';
import {adoptCompanion,careForCompanion,getCompanion,initCompanionSchema} from '../companions.js';
const guild='companion-audit-guild',user='companion-audit-user',poorUser='companion-audit-poor';
before(async()=>{
 await initDatabase();await initCompanionSchema(pool);
 await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id IN ($2,$3)',[guild,user,poorUser]);
 await pool.query('INSERT INTO users(guild_id,user_id,coins) VALUES($1,$2,1000),($1,$3,0)',[guild,user,poorUser]);
});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id IN ($2,$3)',[guild,user,poorUser]);await pool.end();});
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
