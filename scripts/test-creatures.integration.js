import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';
import {claimCreature,getCreatureCollection,initCreatureSchema,maybeSpawnCreature} from '../creatures.js';
const guild='creature-audit-guild',channel='creature-audit-channel',userA='creature-user-a',userB='creature-user-b';
before(async()=>{await initDatabase();await initCreatureSchema(pool);});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id IN ($2,$3)',[guild,userA,userB]);await pool.query('DELETE FROM active_creature_spawns WHERE guild_id=$1',[guild]);await pool.query('DELETE FROM guild_creature_spawn_state WHERE guild_id=$1',[guild]);await pool.end();});
test('one active spawn can be claimed by only one player',async()=>{
 const results=await Promise.all([
  maybeSpawnCreature(pool,{guildId:guild,channelId:channel},{force:true,random:()=>0}),
  maybeSpawnCreature(pool,{guildId:guild,channelId:channel},{force:true,random:()=>0})
 ]);
 const spawn=results.find(x=>x.status==='spawned');assert.ok(spawn);
 assert.equal(results.filter(x=>x.status==='spawn_blocked').length,1);
 const claims=await Promise.all([
  claimCreature(pool,{guildId:guild,userId:userA,spawnId:spawn.spawnId}),
  claimCreature(pool,{guildId:guild,userId:userB,spawnId:spawn.spawnId})
 ]);
 assert.equal(claims.filter(x=>x.status==='caught').length,1);
 assert.equal(claims.filter(x=>x.status==='already_caught').length,1);
 const winner=claims[0].status==='caught'?userA:userB;
 const book=await getCreatureCollection(pool,guild,winner);assert.equal(book.total,1);
});
