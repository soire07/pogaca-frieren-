import { ensureUser } from './database/db.js';

const ID=/^\d{17,20}$/;
export const HOME_ROOMS=Object.freeze([
 {key:'starter',name:'Gezgin Odası',level:1,cost:0},
 {key:'library',name:'Büyü Kütüphanesi',level:5,cost:1500},
 {key:'alchemy',name:'Simya Laboratuvarı',level:10,cost:2500},
 {key:'trophy',name:'Zafer Salonu',level:15,cost:3500},
 {key:'garden',name:'Kristal Bahçe',level:20,cost:4500},
 {key:'workshop',name:'Zanaat Atölyesi',level:25,cost:5500},
 {key:'observatory',name:'Yıldız Gözlemevi',level:30,cost:7000},
 {key:'guild_hall',name:'Lonca Salonu',level:35,cost:8500},
 {key:'seasonal',name:'Mevsim Odası',level:40,cost:10000}
]);
export const HOME_DECORATIONS=Object.freeze(['book_shelf','mana_lamp','crystal_vase','fern_herbarium','trophy_case','star_map','alchemy_table','workbench']);
export const PLAYER_COSMETICS=Object.freeze([
 {key:'moon_frame',slot:'profile_frame',name:'Ay Işığı Çerçevesi',level:3,cost:500},
 {key:'fern_frame',slot:'profile_frame',name:'Fern Çerçevesi',level:12,cost:1800},
 {key:'star_nameplate',slot:'nameplate',name:'Yıldızlı İsimlik',level:5,cost:750},
 {key:'rune_nameplate',slot:'nameplate',name:'Kadim Rün İsimliği',level:18,cost:2200},
 {key:'mana_title',slot:'title_effect',name:'Mana Parıltısı',level:8,cost:1200},
 {key:'aurora_title',slot:'title_effect',name:'Kuzey Işığı Etkisi',level:22,cost:3000},
 {key:'arcane_trail',slot:'spell_trail',name:'Gizemli Büyü İzi',level:10,cost:1500},
 {key:'frost_trail',slot:'spell_trail',name:'Buz Büyüsü İzi',level:24,cost:3200},
 {key:'victory_bloom',slot:'victory_pose',name:'Zafer Çiçeği',level:14,cost:2000},
 {key:'hero_pose',slot:'victory_pose',name:'Kahraman Duruşu',level:28,cost:4000},
 {key:'silver_border',slot:'avatar_border',name:'Gümüş Avatar Kenarı',level:6,cost:900},
 {key:'gold_border',slot:'avatar_border',name:'Altın Avatar Kenarı',level:26,cost:3800},
 {key:'frieren_banner',slot:'guild_banner',name:'Gezgin Büyücü Sancağı',level:16,cost:2500},
 {key:'north_banner',slot:'guild_banner',name:'Kuzey Kıtası Sancağı',level:32,cost:5000},
 {key:'spring_theme',slot:'seasonal_theme',name:'Bahar Teması',level:4,cost:600},
 {key:'winter_theme',slot:'seasonal_theme',name:'Kuzey Kışı Teması',level:20,cost:2800},
 {key:'relic_display',slot:'collection_display',name:'Kadim Eser Sergisi',level:12,cost:1700},
 {key:'star_display',slot:'collection_display',name:'Yıldız Koleksiyonu Sergisi',level:30,cost:4200}
]);
export const EVENT_MILESTONES=Object.freeze([
 {key:'participant',progressKey:'participation',target:1,coins:100,xp:25,cosmeticKey:'spring_theme'},
 {key:'checkin',progressKey:'checkin',target:1,coins:150,xp:40,cosmeticKey:'winter_theme'}
]);
const player=(g,u)=>{if(!ID.test(String(g||''))||!ID.test(String(u||'')))throw new Error('PLAYER_FEATURE_ID_INVALID');};
export function validateHomeLayout(layout){
 if(!Array.isArray(layout)||layout.length>12)throw new Error('HOME_LAYOUT_INVALID');
 const positions=new Set();
 return layout.map(x=>{
  const roomKey=String(x?.roomKey||''),decorationKey=String(x?.decorationKey||''),position=Number(x?.position);
  if(!/^[a-z0-9_]{2,32}$/.test(roomKey)||!HOME_DECORATIONS.includes(decorationKey)||!Number.isInteger(position)||position<0||position>11||positions.has(position))throw new Error('HOME_LAYOUT_INVALID');
  positions.add(position);return {roomKey,decorationKey,position};
 });
}
export async function ensurePlayerExperienceSchema(db){
 await db.query(`
 CREATE TABLE IF NOT EXISTS player_homes(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,active_room TEXT NOT NULL DEFAULT 'starter',layout JSONB NOT NULL DEFAULT '[]'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS player_home_rooms(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,room_key TEXT NOT NULL,unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,room_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS player_home_trophies(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,achievement_key TEXT NOT NULL,display_slot INTEGER NOT NULL CHECK(display_slot BETWEEN 0 AND 5),displayed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,achievement_key),UNIQUE(guild_id,user_id,display_slot),FOREIGN KEY(guild_id,user_id,achievement_key) REFERENCES achievement_claims(guild_id,user_id,achievement_key) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS player_cosmetic_ownership(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,cosmetic_key TEXT NOT NULL,acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),acquisition_source TEXT NOT NULL DEFAULT 'shop',PRIMARY KEY(guild_id,user_id,cosmetic_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS player_cosmetic_loadout(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,slot TEXT NOT NULL,cosmetic_key TEXT NOT NULL,equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,slot),FOREIGN KEY(guild_id,user_id,cosmetic_key) REFERENCES player_cosmetic_ownership(guild_id,user_id,cosmetic_key) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS player_cosmetic_presets(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,preset_name VARCHAR(32) NOT NULL,loadout JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id,preset_name),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS guild_event_progress(event_id UUID NOT NULL REFERENCES guild_events(event_id) ON DELETE CASCADE,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,progress_key VARCHAR(40) NOT NULL,progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(event_id,user_id,progress_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS guild_event_checkins(event_id UUID NOT NULL REFERENCES guild_events(event_id) ON DELETE CASCADE,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(event_id,user_id),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS guild_event_reward_claims(event_id UUID NOT NULL REFERENCES guild_events(event_id) ON DELETE CASCADE,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,reward_key VARCHAR(40) NOT NULL,coins INTEGER NOT NULL CHECK(coins>=0),xp INTEGER NOT NULL CHECK(xp>=0),cosmetic_key TEXT,claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(event_id,user_id,reward_key),FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE);
 CREATE INDEX IF NOT EXISTS guild_event_progress_player_idx ON guild_event_progress(guild_id,user_id,updated_at DESC);
 `);
 await db.query("ALTER TABLE player_cosmetic_ownership ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'shop'");
 await db.query('ALTER TABLE guild_event_reward_claims ADD COLUMN IF NOT EXISTS cosmetic_key TEXT');
}
export async function getCosmeticAcquisitionHistory(db,{guildId,userId}){
 player(guildId,userId);const r=await db.query('SELECT cosmetic_key,acquisition_source,acquired_at FROM player_cosmetic_ownership WHERE guild_id=$1 AND user_id=$2 ORDER BY acquired_at DESC,cosmetic_key',[guildId,userId]);return r.rows;
}
export async function getHomeTrophies(db,{guildId,userId}){
 player(guildId,userId);const r=await db.query('SELECT a.achievement_key,a.claimed_at,h.display_slot FROM achievement_claims a LEFT JOIN player_home_trophies h ON h.guild_id=a.guild_id AND h.user_id=a.user_id AND h.achievement_key=a.achievement_key WHERE a.guild_id=$1 AND a.user_id=$2 ORDER BY a.claimed_at DESC,a.achievement_key',[guildId,userId]);return r.rows;
}
export async function placeHomeTrophy(pool,{guildId,userId,achievementKey,displaySlot}){
 player(guildId,userId);const key=String(achievementKey||'').trim(),slot=Number(displaySlot);if(!/^[a-z0-9_:-]{2,80}$/i.test(key)||!Number.isInteger(slot)||slot<0||slot>5)return {status:'invalid_trophy'};const c=await pool.connect();
 try{await c.query('BEGIN');const room=await c.query(\"SELECT 1 FROM player_home_rooms WHERE guild_id=$1 AND user_id=$2 AND room_key='trophy' FOR UPDATE\",[guildId,userId]);if(!room.rowCount){await c.query('ROLLBACK');return {status:'room_locked'};}const earned=await c.query('SELECT 1 FROM achievement_claims WHERE guild_id=$1 AND user_id=$2 AND achievement_key=$3',[guildId,userId,key]);if(!earned.rowCount){await c.query('ROLLBACK');return {status:'trophy_missing'};}await c.query('DELETE FROM player_home_trophies WHERE guild_id=$1 AND user_id=$2 AND achievement_key=$3',[guildId,userId,key]);await c.query('INSERT INTO player_home_trophies(guild_id,user_id,achievement_key,display_slot) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,display_slot) DO UPDATE SET achievement_key=EXCLUDED.achievement_key,displayed_at=NOW()',[guildId,userId,key,slot]);await c.query('COMMIT');return {status:'placed',achievementKey:key,displaySlot:slot};}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
export async function getPlayerHome(db,{guildId,userId}){
 player(guildId,userId);await ensureUser(guildId,userId,db);await db.query("INSERT INTO player_home_rooms(guild_id,user_id,room_key) VALUES($1,$2,'starter') ON CONFLICT DO NOTHING",[guildId,userId]);await db.query('INSERT INTO player_homes(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[guildId,userId]);
 const [h,r]=await Promise.all([db.query('SELECT active_room,layout FROM player_homes WHERE guild_id=$1 AND user_id=$2',[guildId,userId]),db.query('SELECT room_key,unlocked_at FROM player_home_rooms WHERE guild_id=$1 AND user_id=$2 ORDER BY unlocked_at',[guildId,userId])]);
 return {home:h.rows[0]||{active_room:'starter',layout:[]},rooms:r.rows};
}
export async function unlockHomeRoom(pool,{guildId,userId,roomKey}){
 player(guildId,userId);const room=HOME_ROOMS.find(x=>x.key===roomKey);if(!room)return {status:'invalid_room'};
 await ensureUser(guildId,userId,pool);await pool.query("INSERT INTO player_home_rooms(guild_id,user_id,room_key) VALUES($1,$2,'starter') ON CONFLICT DO NOTHING",[guildId,userId]);const c=await pool.connect();
 try{await c.query('BEGIN');const p=await c.query('SELECT level,coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);if(!p.rowCount){await c.query('ROLLBACK');return {status:'player_missing'};}
 const owned=await c.query('SELECT 1 FROM player_home_rooms WHERE guild_id=$1 AND user_id=$2 AND room_key=$3',[guildId,userId,roomKey]);if(owned.rowCount){await c.query('ROLLBACK');return {status:'already_unlocked'};}
 if(Number(p.rows[0].level)<room.level){await c.query('ROLLBACK');return {status:'level_locked',requiredLevel:room.level};}
 if(Number(p.rows[0].coins)<room.cost){await c.query('ROLLBACK');return {status:'insufficient_funds',cost:room.cost};}
 if(room.cost)await c.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',[guildId,userId,room.cost]);
 await c.query('INSERT INTO player_home_rooms(guild_id,user_id,room_key) VALUES($1,$2,$3)',[guildId,userId,roomKey]);await c.query('INSERT INTO player_homes(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[guildId,userId]);await c.query('COMMIT');return {status:'unlocked',room,balance:Number(p.rows[0].coins)-room.cost};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
export async function saveHomeLayout(db,{guildId,userId,layout,activeRoom='starter'}){
 player(guildId,userId);const clean=validateHomeLayout(layout);await ensureUser(guildId,userId,db);await db.query("INSERT INTO player_home_rooms(guild_id,user_id,room_key) VALUES($1,$2,'starter') ON CONFLICT DO NOTHING",[guildId,userId]);const r=await db.query('SELECT room_key FROM player_home_rooms WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);const owned=new Set(r.rows.map(x=>x.room_key));if(!owned.has(activeRoom)||clean.some(x=>!owned.has(x.roomKey)))return {status:'room_locked'};
 await db.query('INSERT INTO player_homes(guild_id,user_id,active_room,layout) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(guild_id,user_id) DO UPDATE SET active_room=EXCLUDED.active_room,layout=EXCLUDED.layout,updated_at=NOW()',[guildId,userId,activeRoom,JSON.stringify(clean)]);return {status:'saved',activeRoom,layout:clean};
}
export async function purchaseCosmetic(pool,{guildId,userId,cosmeticKey}){
 player(guildId,userId);const item=PLAYER_COSMETICS.find(x=>x.key===cosmeticKey);if(!item)return {status:'invalid_cosmetic'};await ensureUser(guildId,userId,pool);const c=await pool.connect();
 try{await c.query('BEGIN');const p=await c.query('SELECT level,coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,userId]);if(!p.rowCount){await c.query('ROLLBACK');return {status:'player_missing'};}const owned=await c.query('SELECT 1 FROM player_cosmetic_ownership WHERE guild_id=$1 AND user_id=$2 AND cosmetic_key=$3',[guildId,userId,cosmeticKey]);if(owned.rowCount){await c.query('ROLLBACK');return {status:'already_owned'};}if(Number(p.rows[0].level)<item.level){await c.query('ROLLBACK');return {status:'level_locked',requiredLevel:item.level};}if(Number(p.rows[0].coins)<item.cost){await c.query('ROLLBACK');return {status:'insufficient_funds',cost:item.cost};}
 await c.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',[guildId,userId,item.cost]);await c.query("INSERT INTO player_cosmetic_ownership(guild_id,user_id,cosmetic_key,acquisition_source) VALUES($1,$2,$3,'shop')",[guildId,userId,cosmeticKey]);await c.query('COMMIT');return {status:'purchased',cosmetic:item,balance:Number(p.rows[0].coins)-item.cost};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
export async function equipCosmetic(pool,{guildId,userId,cosmeticKey}){
 player(guildId,userId);const item=PLAYER_COSMETICS.find(x=>x.key===cosmeticKey);if(!item)return {status:'invalid_cosmetic'};const c=await pool.connect();
 try{await c.query('BEGIN');const owned=await c.query('SELECT 1 FROM player_cosmetic_ownership WHERE guild_id=$1 AND user_id=$2 AND cosmetic_key=$3 FOR UPDATE',[guildId,userId,cosmeticKey]);if(!owned.rowCount){await c.query('ROLLBACK');return {status:'not_owned'};}await c.query('INSERT INTO player_cosmetic_loadout(guild_id,user_id,slot,cosmetic_key) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,slot) DO UPDATE SET cosmetic_key=EXCLUDED.cosmetic_key,equipped_at=NOW()',[guildId,userId,item.slot,cosmeticKey]);await c.query('COMMIT');return {status:'equipped',cosmetic:item};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
export async function saveCosmeticPreset(db,{guildId,userId,presetName}){
 player(guildId,userId);const name=String(presetName||'').trim();if(!/^[\p{L}\p{N} _-]{1,32}$/u.test(name))return {status:'invalid_preset'};const r=await db.query('SELECT slot,cosmetic_key FROM player_cosmetic_loadout WHERE guild_id=$1 AND user_id=$2 ORDER BY slot',[guildId,userId]);await db.query('INSERT INTO player_cosmetic_presets(guild_id,user_id,preset_name,loadout) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(guild_id,user_id,preset_name) DO UPDATE SET loadout=EXCLUDED.loadout,updated_at=NOW()',[guildId,userId,name,JSON.stringify(r.rows)]);return {status:'saved',presetName:name};
}
export async function applyCosmeticPreset(pool,{guildId,userId,presetName}) {
 player(guildId,userId);
 const name=String(presetName||'').trim();
 if(!/^[\p{L}\p{N} _-]{1,32}$/u.test(name)) return {status:'invalid_preset'};
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const preset=await c.query('SELECT loadout FROM player_cosmetic_presets WHERE guild_id=$1 AND user_id=$2 AND preset_name=$3 FOR UPDATE',[guildId,userId,name]);
  if(!preset.rowCount){await c.query('ROLLBACK');return {status:'preset_missing'};}
  const loadout=Array.isArray(preset.rows[0].loadout)?preset.rows[0].loadout:[];
  for(const entry of loadout) {
   const item=PLAYER_COSMETICS.find(x=>x.key===entry.cosmetic_key&&x.slot===entry.slot);
   if(!item){await c.query('ROLLBACK');return {status:'preset_invalid'};}
   const owned=await c.query('SELECT 1 FROM player_cosmetic_ownership WHERE guild_id=$1 AND user_id=$2 AND cosmetic_key=$3',[guildId,userId,item.key]);
   if(!owned.rowCount){await c.query('ROLLBACK');return {status:'ownership_missing'};}
  }
  await c.query('DELETE FROM player_cosmetic_loadout WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  for(const entry of loadout) await c.query('INSERT INTO player_cosmetic_loadout(guild_id,user_id,slot,cosmetic_key) VALUES($1,$2,$3,$4)',[guildId,userId,entry.slot,entry.cosmetic_key]);
  await c.query('COMMIT');
  return {status:'applied',count:loadout.length};
 } catch(e) {await c.query('ROLLBACK').catch(()=>{});throw e;}
 finally {c.release();}
}
export async function checkInGuildEvent(pool,{guildId,userId,eventId}) {
 player(guildId,userId);
 if(!/^[0-9a-f-]{36}$/i.test(String(eventId||''))) return {status:'invalid_event'};
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const joined=await c.query("SELECT e.event_id FROM guild_events e JOIN guild_event_participants p ON p.event_id=e.event_id AND p.user_id=$3 WHERE e.event_id=$1 AND e.guild_id=$2 AND e.status='scheduled' AND e.starts_at<=NOW() AND e.ends_at>NOW() FOR UPDATE",[eventId,guildId,userId]);
  if(!joined.rowCount){await c.query('ROLLBACK');return {status:'not_eligible'};}
  const inserted=await c.query('INSERT INTO guild_event_checkins(event_id,guild_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[eventId,guildId,userId]);
  if(!inserted.rowCount){await c.query('ROLLBACK');return {status:'already_checked_in'};}
  await c.query("INSERT INTO guild_event_progress(event_id,guild_id,user_id,progress_key,progress) VALUES($1,$2,$3,'checkin',1) ON CONFLICT(event_id,user_id,progress_key) DO UPDATE SET progress=1,updated_at=NOW()",[eventId,guildId,userId]);
  await c.query('COMMIT');
  return {status:'checked_in'};
 } catch(e) {await c.query('ROLLBACK').catch(()=>{});throw e;}
 finally {c.release();}
}
export async function claimEventMilestone(pool,{guildId,userId,eventId,rewardKey}){
 player(guildId,userId);const m=EVENT_MILESTONES.find(x=>x.key===rewardKey);if(!m||!/^[0-9a-f-]{36}$/i.test(String(eventId||'')))return {status:'invalid_reward'};const c=await pool.connect();
 try{await c.query('BEGIN');const e=await c.query("SELECT event_id FROM guild_events WHERE event_id=$1 AND guild_id=$2 AND ends_at<=NOW() AND status IN ('scheduled','completed') FOR UPDATE",[eventId,guildId]);if(!e.rowCount){await c.query('ROLLBACK');return {status:'event_not_finished'};}const p=await c.query("SELECT progress FROM guild_event_progress WHERE event_id=$1 AND guild_id=$2 AND user_id=$3 AND progress_key=$4 FOR UPDATE",[eventId,guildId,userId,m.progressKey]);if(Number(p.rows[0]?.progress||0)<m.target){await c.query('ROLLBACK');return {status:'milestone_locked',target:m.target};}const claim=await c.query('INSERT INTO guild_event_reward_claims(event_id,guild_id,user_id,reward_key,coins,xp,cosmetic_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING reward_key',[eventId,guildId,userId,rewardKey,m.coins,m.xp,m.cosmeticKey]);if(!claim.rowCount){await c.query('ROLLBACK');return {status:'already_claimed'};}const cosmetic=PLAYER_COSMETICS.find(x=>x.key===m.cosmeticKey);const cosmeticGrant=cosmetic?await c.query("INSERT INTO player_cosmetic_ownership(guild_id,user_id,cosmetic_key,acquisition_source) VALUES($1,$2,$3,'event') ON CONFLICT DO NOTHING RETURNING cosmetic_key",[guildId,userId,m.cosmeticKey]):{rowCount:0};await c.query('UPDATE users SET coins=coins+$3,xp=xp+$4,level=GREATEST(level,FLOOR(SQRT((xp+$4)::numeric/100))::int+1),stat_points=stat_points+GREATEST(0,(FLOOR(SQRT((xp+$4)::numeric/100))::int+1)-level) WHERE guild_id=$1 AND user_id=$2',[guildId,userId,m.coins,m.xp]);await c.query('COMMIT');return {status:'claimed',coins:m.coins,xp:m.xp,cosmeticKey:m.cosmeticKey,cosmeticGranted:cosmeticGrant.rowCount===1};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
