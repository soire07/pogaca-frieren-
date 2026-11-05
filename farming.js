import { ensureUser } from './database/db.js';
export const FARM_SEEDS = Object.freeze([
 {key:'winter_berry',name:'Kuzey Meyvesi',seedName:'Kuzey Meyvesi Tohumu',cost:80,growMinutes:30,minLevel:1,season:'winter'},
 {key:'moon_mint',name:'Ay Nanesi',seedName:'Ay Nanesi Tohumu',cost:120,growMinutes:60,minLevel:5,season:'spring'},
 {key:'mana_wheat',name:'Mana Buğdayı',seedName:'Mana Buğdayı Tohumu',cost:160,growMinutes:120,minLevel:10,season:'summer'},
 {key:'starflower',name:'Yıldız Çiçeği',seedName:'Yıldız Çiçeği Tohumu',cost:250,growMinutes:240,minLevel:20,season:'autumn'}
]);
export function seasonForDate(date=new Date()){
 const month=new Date(date).getUTCMonth()+1;
 return month===12||month<=2?'winter':month<=5?'spring':month<=8?'summer':'autumn';
}
export function farmYield(seedKey,date=new Date()){
 const seed=FARM_SEEDS.find(item=>item.key===seedKey);
 if(!seed)return 0;
 return seasonForDate(date)===seed.season?2:1;
}
export async function initFarmSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS user_farm_plots(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,seed_key TEXT NOT NULL,
 planted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),harvest_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(guild_id,user_id),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
 await db.query('CREATE INDEX IF NOT EXISTS idx_user_farm_plots_harvest ON user_farm_plots(harvest_at)');
}
export async function plantSeed(dbPool,input){
 const seed=FARM_SEEDS.find(item=>item.key===input?.seedKey);
 if(!seed||!input?.guildId||!input?.userId)return{status:'invalid_seed'};
 await ensureUser(input.guildId,input.userId);const db=await dbPool.connect();
 try{
  await db.query('BEGIN');
  const player=await db.query('SELECT level,coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[input.guildId,input.userId]);
  const level=Number(player.rows[0]?.level||1);
  if(level<seed.minLevel){await db.query('ROLLBACK');return{status:'locked_seed',seed,level};}
  const existing=await db.query('SELECT seed_key FROM user_farm_plots WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[input.guildId,input.userId]);
  if(existing.rowCount){await db.query('ROLLBACK');return{status:'plot_occupied'};}
  const debit=await db.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins >= $3 RETURNING coins',[input.guildId,input.userId,seed.cost]);
  if(!debit.rowCount){await db.query('ROLLBACK');return{status:'insufficient_funds',cost:seed.cost};}
  await db.query("INSERT INTO user_farm_plots(guild_id,user_id,seed_key,harvest_at) VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 minute'))",[input.guildId,input.userId,seed.key,seed.growMinutes]);
  await db.query('COMMIT');return{status:'planted',seed,balance:Number(debit.rows[0].coins)};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});if(error.code==='23505')return{status:'plot_occupied'};throw error;}finally{db.release();}
}
export async function harvestFarm(dbPool,input,{date=new Date()}={}){
 const db=await dbPool.connect();
 try{
  await db.query('BEGIN');
  await db.query('SELECT user_id FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[input.guildId,input.userId]);
  const result=await db.query('SELECT seed_key,harvest_at FROM user_farm_plots WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[input.guildId,input.userId]);
  const plot=result.rows[0];if(!plot){await db.query('ROLLBACK');return{status:'no_plot'};}
  if(new Date(plot.harvest_at).getTime()>date.getTime()){await db.query('ROLLBACK');return{status:'growing',harvestAt:plot.harvest_at};}
  const seed=FARM_SEEDS.find(item=>item.key===plot.seed_key);if(!seed){await db.query('ROLLBACK');return{status:'invalid_plot'};}
  const quantity=farmYield(seed.key,date);
  await db.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity',[input.guildId,input.userId,seed.name,quantity]);
  await db.query('DELETE FROM user_farm_plots WHERE guild_id=$1 AND user_id=$2',[input.guildId,input.userId]);
  await db.query('COMMIT');return{status:'harvested',seed,quantity};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function getFarmPlot(db,guildId,userId){
 const result=await db.query('SELECT seed_key,planted_at,harvest_at,(harvest_at<=NOW()) AS ready FROM user_farm_plots WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
 const plot=result.rows[0];return plot?{...plot,seed:FARM_SEEDS.find(item=>item.key===plot.seed_key)||null}:null;
}
