import { randomUUID } from 'node:crypto';
import { ensureUser } from './database/db.js';
export const CREATURE_SPAWN_CHANCE=.005,CREATURE_SPAWN_COOLDOWN_MS=1800000;
export const CREATURE_CATALOG=Object.freeze([
 {key:'mana_slime',name:'Mana Slime',emoji:'🫧',rarity:'Yaygın',weight:60},
 {key:'forest_sprite',name:'Orman Perisi',emoji:'🧚',rarity:'Yaygın',weight:25},
 {key:'frost_hare',name:'Buz Tavşanı',emoji:'🐇',rarity:'Nadir',weight:10},
 {key:'rune_fox',name:'Rün Tilkisi',emoji:'🦊',rarity:'Destansı',weight:4},
 {key:'ancient_drake',name:'Kadim Ejder',emoji:'🐉',rarity:'Efsanevi',weight:1}
]);
export function rollCreature(random=Math.random){
 const total=CREATURE_CATALOG.reduce((n,x)=>n+x.weight,0),point=Math.min(.999999999,Math.max(0,Number(random())||0))*total;
 let cursor=0;for(const item of CREATURE_CATALOG){cursor+=item.weight;if(point<cursor)return item;}return CREATURE_CATALOG.at(-1);
}
export async function initCreatureSchema(db){
 await db.query('CREATE TABLE IF NOT EXISTS guild_creature_spawn_state(guild_id TEXT PRIMARY KEY,last_spawn_at TIMESTAMPTZ)');
 await db.query(`CREATE TABLE IF NOT EXISTS active_creature_spawns(spawn_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,creature_key TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,message_id TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,caught_by TEXT,caught_at TIMESTAMPTZ)`);
 await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_active_creature_spawn_guild ON active_creature_spawns(guild_id) WHERE active=TRUE');
 await db.query(`CREATE TABLE IF NOT EXISTS user_creature_collection(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,creature_key TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0),first_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,creature_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS idx_user_creature_collection_count ON user_creature_collection(guild_id,user_id,quantity DESC)');
}
export async function maybeSpawnCreature(dbPool,{guildId,channelId},{random=Math.random,force=false}={}){
 if(!guildId||!channelId)return{status:'invalid_input'};if(!force&&random()>=CREATURE_SPAWN_CHANCE)return{status:'no_spawn'};
 const db=await dbPool.connect();
 try{
  await db.query('BEGIN');await db.query('INSERT INTO guild_creature_spawn_state(guild_id) VALUES($1) ON CONFLICT DO NOTHING',[guildId]);
  const state=await db.query('SELECT last_spawn_at FROM guild_creature_spawn_state WHERE guild_id=$1 FOR UPDATE',[guildId]);
  await db.query('UPDATE active_creature_spawns SET active=FALSE WHERE guild_id=$1 AND active=TRUE AND expires_at<=NOW()',[guildId]);
  const active=await db.query('SELECT spawn_id FROM active_creature_spawns WHERE guild_id=$1 AND active=TRUE',[guildId]);
  const last=state.rows[0]?.last_spawn_at?new Date(state.rows[0].last_spawn_at).getTime():0;
  if(active.rowCount||Date.now()-last<CREATURE_SPAWN_COOLDOWN_MS){await db.query('ROLLBACK');return{status:'spawn_blocked'};}
  const creature=rollCreature(random),spawnId=randomUUID();
  await db.query("INSERT INTO active_creature_spawns(spawn_id,guild_id,channel_id,creature_key,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '3 minutes')",[spawnId,guildId,channelId,creature.key]);
  await db.query('UPDATE guild_creature_spawn_state SET last_spawn_at=NOW() WHERE guild_id=$1',[guildId]);
  await db.query('COMMIT');return{status:'spawned',spawnId,creature};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function setCreatureSpawnMessageId(db,spawnId,messageId){await db.query('UPDATE active_creature_spawns SET message_id=$2 WHERE spawn_id=$1 AND active=TRUE',[spawnId,messageId]);}
export async function deactivateCreatureSpawn(db,spawnId){await db.query('UPDATE active_creature_spawns SET active=FALSE WHERE spawn_id=$1 AND active=TRUE',[spawnId]);}
export async function claimCreature(dbPool,{guildId,userId,spawnId}){
 if(!guildId||!userId||!spawnId)return{status:'invalid_input'};await ensureUser(guildId,userId);const db=await dbPool.connect();
 try{
  await db.query('BEGIN');const result=await db.query('SELECT creature_key,active,(expires_at>NOW()) AS not_expired FROM active_creature_spawns WHERE spawn_id=$1 AND guild_id=$2 FOR UPDATE',[spawnId,guildId]);
  const spawn=result.rows[0];if(!spawn||!spawn.active){await db.query('ROLLBACK');return{status:'already_caught'};}
  if(!spawn.not_expired){await db.query('UPDATE active_creature_spawns SET active=FALSE WHERE spawn_id=$1',[spawnId]);await db.query('COMMIT');return{status:'expired'};}
  await db.query('UPDATE active_creature_spawns SET active=FALSE,caught_by=$2,caught_at=NOW() WHERE spawn_id=$1',[spawnId,userId]);
  await db.query('INSERT INTO user_creature_collection(guild_id,user_id,creature_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,creature_key) DO UPDATE SET quantity=user_creature_collection.quantity+1,last_caught_at=NOW()',[guildId,userId,spawn.creature_key]);
  await db.query('COMMIT');return{status:'caught',creature:CREATURE_CATALOG.find(x=>x.key===spawn.creature_key)||null};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function getCreatureCollection(db,guildId,userId){
 const result=await db.query('SELECT creature_key,quantity FROM user_creature_collection WHERE guild_id=$1 AND user_id=$2 ORDER BY quantity DESC,creature_key',[guildId,userId]);
 const rows=result.rows||[];return{total:rows.reduce((n,x)=>n+Number(x.quantity||0),0),unique:rows.length,entries:rows.map(row=>({...row,creature:CREATURE_CATALOG.find(x=>x.key===row.creature_key)||null}))};
}
