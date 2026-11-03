import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';import {farmYield,harvestFarm,initFarmSchema,plantSeed} from '../farming.js';
const guildId='farm-audit-guild',userId='farm-audit-user';
before(async()=>{await initDatabase();await initFarmSchema(pool);await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);await pool.query('INSERT INTO users(guild_id,user_id,level,coins) VALUES($1,$2,1,1000)',[guildId,userId]);});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);await pool.end();});
test('concurrent planting reserves one plot and concurrent harvest grants one reward',async()=>{
 const plants=await Promise.all([plantSeed(pool,{guildId,userId,seedKey:'winter_berry'}),plantSeed(pool,{guildId,userId,seedKey:'winter_berry'})]);
 assert.equal(plants.filter(x=>x.status==='planted').length,1);assert.equal(plants.filter(x=>x.status==='plot_occupied').length,1);
 await pool.query("UPDATE user_farm_plots SET harvest_at=NOW()-INTERVAL '1 second' WHERE guild_id=$1 AND user_id=$2",[guildId,userId]);
 const harvests=await Promise.all([harvestFarm(pool,{guildId,userId}),harvestFarm(pool,{guildId,userId})]);
 assert.equal(harvests.filter(x=>x.status==='harvested').length,1);assert.equal(harvests.filter(x=>x.status==='no_plot').length,1);
 const item=await pool.query('SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_key=$3',[guildId,userId,'Kuzey Meyvesi']);
 assert.equal(Number(item.rows[0].quantity),farmYield('winter_berry',new Date()));
});
test('locked seed cannot debit coins or create a plot',async()=>{
 const before=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
 const result=await plantSeed(pool,{guildId,userId,seedKey:'starflower'});assert.equal(result.status,'locked_seed');
 const after=await pool.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
 assert.equal(Number(after.rows[0].coins),Number(before.rows[0].coins));
});
