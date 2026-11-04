import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';
import {claimCreature,getCreatureCollection,getCreatureWishlist,initCreatureSchema,maybeSpawnCreature,setCreatureWishlist} from '../creatures.js';
const guild='creature-audit-guild',channel='creature-audit-channel',userA='creature-user-a',userB='creature-user-b',wishlistGuild='creature-wishlist-audit';
before(async()=>{await initDatabase();await initCreatureSchema(pool);});
after(async()=>{
 await pool.query('DELETE FROM users WHERE (guild_id=$1 AND user_id IN ($2,$3)) OR (guild_id=$4 AND user_id=$2)',[guild,userA,userB,wishlistGuild]);
 await pool.query('DELETE FROM active_creature_spawns WHERE guild_id IN ($1,$2)',[guild,wishlistGuild]);
 await pool.query('DELETE FROM guild_creature_spawn_state WHERE guild_id IN ($1,$2)',[guild,wishlistGuild]);
 await pool.end();
});
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
 assert.equal(claims.find(x=>x.status==='caught').creature.variant,'shiny');
 const winner=claims[0].status==='caught'?userA:userB;
 const book=await getCreatureCollection(pool,guild,winner);assert.equal(book.total,1);assert.equal(book.entries[0].creature.variant,'shiny');
 const filtered=await getCreatureCollection(pool,guild,winner,{rarity:'Yaygın',query:'Mana'});assert.equal(filtered.filteredCount,1);
});
test('creature wishlist is opt-in and matching spawns return only opted-in users',async()=>{
 const added=await setCreatureWishlist(pool,{guildId:wishlistGuild,userId:userA,creatureKey:'mana_slime',enabled:true});
 assert.equal(added.status,'added');
 const spawn=await maybeSpawnCreature(pool,{guildId:wishlistGuild,channelId:channel},{force:true,random:()=>0});
 assert.equal(spawn.status,'spawned');assert.deepEqual(spawn.notifyUserIds,[userA]);assert.equal(spawn.creature.variant,'shiny');
 const list=await getCreatureWishlist(pool,wishlistGuild,userA);assert.equal(list.length,1);assert.equal(list[0].key,'mana_slime');
 const removed=await setCreatureWishlist(pool,{guildId:wishlistGuild,userId:userA,creatureKey:'mana_slime',enabled:false});
 assert.equal(removed.status,'removed');assert.equal((await getCreatureWishlist(pool,wishlistGuild,userA)).length,0);
});
