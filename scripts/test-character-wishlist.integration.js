import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {pool,initDatabase} from '../database/db.js';import {characters} from '../character-data.js';
import {getCharacterWishlist,initCharacterWishlistSchema,setCharacterWishlist} from '../character-wishlist.js';
const guild='character-wishlist-audit',user='character-wishlist-user',names=characters.slice(0,11).map(x=>x.name);
before(async()=>{await initDatabase();await initCharacterWishlistSchema(pool);await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);});
after(async()=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guild,user]);await pool.end();});
test('character wishlist enforces unique entries and a ten-character limit transactionally',async()=>{
 for(const name of names.slice(0,10))assert.equal((await setCharacterWishlist(pool,{guildId:guild,userId:user,characterName:name,enabled:true})).status,'added');
 assert.equal((await setCharacterWishlist(pool,{guildId:guild,userId:user,characterName:names[0],enabled:true})).status,'already_listed');
 assert.equal((await setCharacterWishlist(pool,{guildId:guild,userId:user,characterName:names[10],enabled:true})).status,'limit_reached');
 assert.equal((await getCharacterWishlist(pool,guild,user)).length,10);
 assert.equal((await setCharacterWishlist(pool,{guildId:guild,userId:user,characterName:names[0],enabled:false})).status,'removed');
 assert.equal((await getCharacterWishlist(pool,guild,user)).length,9);
});
