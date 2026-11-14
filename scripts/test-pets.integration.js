import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedAuditDatabase} from './isolated-audit-db-guard.js';
import {pool,initDatabase} from '../database/db.js';
import {initPetSchema,adoptPet,listPets,setActivePet,renamePet,careForPet} from '../pets.js';
const guild='pets-audit-guild',user='pets-audit-user',poor='pets-audit-poor',race='pets-audit-race',otherGuild='pets-audit-other';
before(async()=>{
 assertIsolatedAuditDatabase();await initDatabase();await initPetSchema(pool);
 await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id=ANY($2::text[])) OR (guild_id=$3 AND user_id=$4)',[guild,[user,poor,race],otherGuild,user]);
 await pool.query('INSERT INTO users(guild_id,user_id,coins) VALUES($1,$2,5000),($1,$3,0),($1,$4,5000),($5,$2,5000)',[guild,user,poor,race,otherGuild]);
});
after(async()=>{assertIsolatedAuditDatabase();await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id=ANY($2::text[])) OR (guild_id=$3 AND user_id=$4)',[guild,[user,poor,race],otherGuild,user]);await pool.end();});
test('pet adoption is player-and-guild scoped and enforces the collection limit',async()=>{
 const first=await adoptPet(pool,{guildId:guild,userId:user,petKey:'forest_fox'});assert.equal(first.status,'adopted');assert.equal(first.isActive,true);
 assert.equal((await adoptPet(pool,{guildId:guild,userId:user,petKey:'forest_fox'})).status,'already_owned');
 assert.equal((await adoptPet(pool,{guildId:guild,userId:user,petKey:'snow_hare'})).status,'adopted');
 assert.equal((await adoptPet(pool,{guildId:guild,userId:user,petKey:'arcane_moth'})).status,'adopted');
 assert.equal((await adoptPet(pool,{guildId:guild,userId:user,petKey:'dragon_hatchling'})).status,'collection_full');
 assert.equal((await adoptPet(pool,{guildId:guild,userId:poor,petKey:'forest_fox'})).status,'insufficient_funds');
 const other=await adoptPet(pool,{guildId:otherGuild,userId:user,petKey:'forest_fox'});assert.equal(other.status,'adopted');
 assert.equal((await listPets(pool,{guildId:guild,userId:user})).length,3);
});
test('concurrent pet adoption cannot exceed collection cap or overdraw the player',async()=>{
 const results=await Promise.all([
  adoptPet(pool,{guildId:guild,userId:race,petKey:'forest_fox'}),
  adoptPet(pool,{guildId:guild,userId:race,petKey:'snow_hare'}),
  adoptPet(pool,{guildId:guild,userId:race,petKey:'arcane_moth'}),
  adoptPet(pool,{guildId:guild,userId:race,petKey:'dragon_hatchling'})
 ]);
 assert.equal(results.filter(r=>r.status==='adopted').length,3);
 assert.equal(results.filter(r=>r.status==='collection_full').length,1);
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,race]);
 assert.ok(Number(balance.rows[0].coins)>=0);
 assert.equal((await listPets(pool,{guildId:guild,userId:race})).length,3);
});
test('active pet switching and naming affect only owned pets',async()=>{
 assert.equal((await setActivePet(pool,{guildId:guild,userId:user,petKey:'snow_hare'})).status,'activated');
 assert.equal((await renamePet(pool,{guildId:guild,userId:user,petKey:'snow_hare',name:'Kar Tanesi'})).status,'renamed');
 const pets=await listPets(pool,{guildId:guild,userId:user});
 assert.equal(pets.filter(p=>p.is_active).length,1);
 assert.equal(pets.find(p=>p.is_active).nickname,'Kar Tanesi');
 assert.equal((await setActivePet(pool,{guildId:guild,userId:user,petKey:'dragon_hatchling'})).status,'not_owned');
 assert.equal((await renamePet(pool,{guildId:guild,userId:user,petKey:'dragon_hatchling',name:'Kayıp Dost'})).status,'not_owned');
});
test('pet care is cooldown-protected, charges atomically and advances care streak',async()=>{
 const result=await careForPet(pool,{guildId:guild,userId:user,petKey:'snow_hare',action:'feed'});
 assert.equal(result.status,'cared');assert.equal(result.cost,30);assert.equal(result.pet.mood,87);
 assert.equal((await careForPet(pool,{guildId:guild,userId:user,petKey:'snow_hare',action:'play'})).status,'cooldown');
 const balance=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);
 assert.equal(Number(balance.rows[0].coins),5000-350-400-500-30);
 assert.equal((await careForPet(pool,{guildId:guild,userId:user,petKey:'snow_hare',action:'invalid'})).status,'invalid_action');
});
