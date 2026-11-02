import { characters } from './character-data.js';
import { ensureUser } from './database/db.js';
export const CHARACTER_WISHLIST_LIMIT=10;
export async function initCharacterWishlistSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS user_character_wishlist(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,character_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,character_name),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS idx_character_wishlist_name ON user_character_wishlist(guild_id,character_name)');
}
export async function setCharacterWishlist(dbPool,{guildId,userId,characterName,enabled}){
 if(!guildId||!userId||!characters.some(item=>item.name===characterName)||typeof enabled!=='boolean')return{status:'invalid_character'};
 await ensureUser(guildId,userId);const db=await dbPool.connect();
 try{
  await db.query('BEGIN');await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);
  if(enabled){
   const exists=await db.query('SELECT character_name FROM user_character_wishlist WHERE guild_id=$1 AND user_id=$2 AND character_name=$3',[guildId,userId,characterName]);
   if(exists.rowCount){await db.query('ROLLBACK');return{status:'already_listed'};}
   const count=await db.query('SELECT COUNT(*)::int AS total FROM user_character_wishlist WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
   if(Number(count.rows[0]?.total||0)>=CHARACTER_WISHLIST_LIMIT){await db.query('ROLLBACK');return{status:'limit_reached',limit:CHARACTER_WISHLIST_LIMIT};}
   await db.query('INSERT INTO user_character_wishlist(guild_id,user_id,character_name) VALUES($1,$2,$3)',[guildId,userId,characterName]);
   await db.query('COMMIT');return{status:'added'};
  }
  const result=await db.query('DELETE FROM user_character_wishlist WHERE guild_id=$1 AND user_id=$2 AND character_name=$3 RETURNING character_name',[guildId,userId,characterName]);
  await db.query('COMMIT');return{status:result.rowCount?'removed':'not_listed'};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function getCharacterWishlist(db,guildId,userId){
 const result=await db.query('SELECT character_name,created_at FROM user_character_wishlist WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at,character_name',[guildId,userId]);
 return(result.rows||[]).map(row=>({...row,character:characters.find(item=>item.name===row.character_name)||null}));
}
export function searchCharacterChoices(query=''){
 const value=String(query).trim().toLocaleLowerCase('tr-TR');
 return characters.filter(item=>item.name.toLocaleLowerCase('tr-TR').includes(value)).slice(0,25).map(item=>({name:item.name,value:item.name}));
}
