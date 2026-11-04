import { ensureUser } from './database/db.js';

const DISCORD_ID = /^\\d{17,20}$/;
export const FISHING_COOLDOWN_MS = 1_800_000;
export const FISHING_ZONES = Object.freeze([
  { key: 'kuzey_kiyisi', name: 'Kuzey Kıyısı', minLevel: 1 },
  { key: 'buzul_golu', name: 'Buzul Gölü', minLevel: 10 },
  { key: 'mana_nehri', name: 'Mana Nehri', minLevel: 20 }
]);
export const FISHING_RODS = Object.freeze([
  { level: 1, name: 'Ahşap Olta', upgradeCost: 0 },
  { level: 2, name: 'Buz Kristali Olta', upgradeCost: 500 },
  { level: 3, name: 'Mana Dokuma Olta', upgradeCost: 1500 }
]);
export const FISHING_BAITS = Object.freeze([
  { key: 'mana', name: 'Mana Yemi', price: 150, packSize: 5, zones: ['mana_nehri'], tags: ['mana'], multiplier: 1.8 },
  { key: 'frost', name: 'Buz Yemi', price: 120, packSize: 5, zones: ['buzul_golu'], tags: ['frost'], multiplier: 1.8 },
  { key: 'rare', name: 'Nadirlik Yemi', price: 250, packSize: 5, zones: FISHING_ZONES.map(zone => zone.key), rarityMultiplier: 1.6 }
]);
export const FISH_CATALOG = Object.freeze([
  { key: 'silver_trout', name: 'Gümüş Alabalık', emoji: '🐟', rarity: 'Yaygın', weight: 55, zones: ['kuzey_kiyisi','buzul_golu'], tags: ['fresh'] },
  { key: 'frost_carp', name: 'Buz Sazanı', emoji: '🐠', rarity: 'Yaygın', weight: 35, zones: ['kuzey_kiyisi','buzul_golu'], tags: ['frost'] },
  { key: 'moon_jelly', name: 'Ay Denizanası', emoji: '🪼', rarity: 'Nadir', weight: 9, zones: ['kuzey_kiyisi','mana_nehri'], tags: ['mana'] },
  { key: 'crystal_koi', name: 'Kristal Koi', emoji: '🐡', rarity: 'Destansı', weight: 1, zones: ['buzul_golu','mana_nehri'], tags: ['frost','mana'] },
  { key: 'mana_eel', name: 'Mana Yılanbalığı', emoji: '🐟', rarity: 'Nadir', weight: 18, zones: ['mana_nehri'], tags: ['mana'] },
  { key: 'ancient_sturgeon', name: 'Kadim Mersin Balığı', emoji: '🦈', rarity: 'Efsanevi', weight: 2, zones: ['mana_nehri'], tags: ['mana','ancient'] }
]);
export function getFishingZone(key, level = 1) {
  const zone = FISHING_ZONES.find(item => item.key === key);
  if (!zone) return { status: 'invalid_zone' };
  return Number.isInteger(Number(level)) && Number(level) >= zone.minLevel
    ? { status: 'available', zone } : { status: 'locked_zone', zone, requiredLevel: zone.minLevel };
}
export function getFishingWeightTable(key, { rodLevel = 1, baitKey = 'basic' } = {}) {
  const rod = Math.max(1, Math.min(3, Math.trunc(Number(rodLevel) || 1)));
  const bait = FISHING_BAITS.find(item => item.key === baitKey && item.zones.includes(key));
  return FISH_CATALOG.filter(item => item.zones.includes(key)).map(fish => {
    let weight = fish.weight;
    if (fish.rarity !== 'Yaygın') weight *= 1 + (rod - 1) * 0.2;
    if (bait?.tags?.some(tag => fish.tags.includes(tag))) weight *= bait.multiplier;
    if (bait?.rarityMultiplier && fish.rarity !== 'Yaygın') weight *= bait.rarityMultiplier;
    return { fish, weight };
  });
}
export function rollFish(key, random = Math.random, gear = {}) {
  const weighted = getFishingWeightTable(key, gear);
  if (!weighted.length) return null;
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  const randomValue = Number(random());
  const normalized = Number.isFinite(randomValue) ? Math.min(.999999999, Math.max(0, randomValue)) : 0;
  const point = normalized * total;
  let cursor = 0;
  for (const item of weighted) { cursor += item.weight; if (point < cursor) return item.fish; }
  return weighted[weighted.length - 1].fish;
}
function validatePlayer(guildId,userId) {
  if (!DISCORD_ID.test(String(guildId||'')) || !DISCORD_ID.test(String(userId||''))) throw new Error('FISHING_PLAYER_INVALID');
}
export async function initFishingSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS user_fishing_state (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, last_fished_at TIMESTAMPTZ,
    total_catches INTEGER NOT NULL DEFAULT 0 CHECK(total_catches >= 0),
    rod_level INTEGER NOT NULL DEFAULT 1 CHECK(rod_level BETWEEN 1 AND 3),
    active_bait_key TEXT NOT NULL DEFAULT 'basic',
    bait_count INTEGER NOT NULL DEFAULT 0 CHECK(bait_count >= 0),
    PRIMARY KEY(guild_id,user_id),
    FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
  await db.query('ALTER TABLE user_fishing_state ADD COLUMN IF NOT EXISTS rod_level INTEGER NOT NULL DEFAULT 1');
  await db.query('ALTER TABLE user_fishing_state ADD COLUMN IF NOT EXISTS active_bait_key TEXT NOT NULL DEFAULT \'basic\'');
  await db.query('ALTER TABLE user_fishing_state ADD COLUMN IF NOT EXISTS bait_count INTEGER NOT NULL DEFAULT 0');
  await db.query(`CREATE TABLE IF NOT EXISTS user_fish_collection (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fish_key TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    first_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,user_id,fish_key),
    FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE)`);
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_fish_collection_count ON user_fish_collection(guild_id,user_id,quantity DESC)');
}
export async function getFishingGear(db,guildId,userId) {
  validatePlayer(guildId,userId);
  const result=await db.query(
    'SELECT COALESCE(s.rod_level,1)::int AS rod_level,COALESCE(s.active_bait_key,\'basic\') AS active_bait_key,COALESCE(s.bait_count,0)::int AS bait_count,u.coins FROM users u LEFT JOIN user_fishing_state s ON s.guild_id=u.guild_id AND s.user_id=u.user_id WHERE u.guild_id=$1 AND u.user_id=$2',
    [String(guildId),String(userId)]
  );
  const row=result.rows?.[0];
  const rodLevel=Number(row?.rod_level||1);
  const baitKey=String(row?.active_bait_key||'basic');
  const bait=FISHING_BAITS.find(item=>item.key===baitKey)||null;
  return {
    rodLevel,rod:FISHING_RODS.find(item=>item.level===rodLevel)||FISHING_RODS[0],
    activeBaitKey:baitKey,activeBait:bait?.name||'Standart yem',baitCount:Number(row?.bait_count||0),
    coins:Number(row?.coins||0),nextRod:FISHING_RODS.find(item=>item.level===rodLevel+1)||null
  };
}
export async function upgradeFishingRod(dbPool,{guildId,userId}) {
  validatePlayer(guildId,userId);
  await ensureUser(guildId,userId);
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    const user=await client.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[String(guildId),String(userId)]);
    await client.query('INSERT INTO user_fishing_state(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[String(guildId),String(userId)]);
    const state=await client.query('SELECT rod_level FROM user_fishing_state WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[String(guildId),String(userId)]);
    const level=Number(state.rows[0]?.rod_level||1);
    const next=FISHING_RODS.find(item=>item.level===level+1);
    if(!next){await client.query('COMMIT');return {status:'max_level',rodLevel:level};}
    const cost=next.upgradeCost;
    const balance=Number(user.rows[0]?.coins||0);
    if(balance<cost){await client.query('ROLLBACK');return {status:'insufficient_funds',rodLevel:level,cost,balance};}
    await client.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',[String(guildId),String(userId),cost]);
    await client.query('UPDATE user_fishing_state SET rod_level=$3 WHERE guild_id=$1 AND user_id=$2',[String(guildId),String(userId),next.level]);
    await client.query('COMMIT');
    return {status:'upgraded',rodLevel:next.level,rod:next,cost,balance:balance-cost};
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
export async function purchaseFishingBait(dbPool,{guildId,userId,baitKey}) {
  validatePlayer(guildId,userId);
  const bait=FISHING_BAITS.find(item=>item.key===String(baitKey||''));
  if(!bait) return {status:'invalid_bait'};
  await ensureUser(guildId,userId);
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    const user=await client.query('SELECT coins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[String(guildId),String(userId)]);
    await client.query('INSERT INTO user_fishing_state(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[String(guildId),String(userId)]);
    const state=await client.query('SELECT active_bait_key,bait_count FROM user_fishing_state WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[String(guildId),String(userId)]);
    const currentKey=String(state.rows[0]?.active_bait_key||'basic');
    const currentCount=Number(state.rows[0]?.bait_count||0);
    if(currentCount>0&&currentKey!==bait.key){await client.query('ROLLBACK');return {status:'bait_stack_active',activeBaitKey:currentKey,baitCount:currentCount};}
    const balance=Number(user.rows[0]?.coins||0);
    if(balance<bait.price){await client.query('ROLLBACK');return {status:'insufficient_funds',cost:bait.price,balance};}
    await client.query('UPDATE users SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2',[String(guildId),String(userId),bait.price]);
    await client.query('UPDATE user_fishing_state SET active_bait_key=$3,bait_count=$4 WHERE guild_id=$1 AND user_id=$2',[String(guildId),String(userId),bait.key,(currentKey===bait.key?currentCount:0)+bait.packSize]);
    await client.query('COMMIT');
    return {status:'purchased',bait,baitCount:(currentKey===bait.key?currentCount:0)+bait.packSize,balance:balance-bait.price};
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
export async function fishAtZone(dbPool,input,{random=Math.random}={}) {
  if(!input?.guildId||!input?.userId) return {status:'invalid_input'};
  const zone=FISHING_ZONES.find(item=>item.key===input.zoneKey);
  if(!zone) return {status:'invalid_zone'};
  await ensureUser(input.guildId,input.userId);
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    const player=await client.query('SELECT level FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[input.guildId,input.userId]);
    const level=Number(player.rows[0]?.level||1);
    const access=getFishingZone(zone.key,level);
    if(access.status!=='available'){await client.query('ROLLBACK');return {...access,level};}
    await client.query('INSERT INTO user_fishing_state(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[input.guildId,input.userId]);
    const state=await client.query(
      `SELECT last_fished_at,rod_level,active_bait_key,bait_count,
        last_fished_at > NOW() - INTERVAL '30 minutes' AS cooling_down
       FROM user_fishing_state WHERE guild_id=$1 AND user_id=$2 FOR UPDATE`,
      [input.guildId,input.userId]
    );
    if(state.rows[0]?.cooling_down){await client.query('ROLLBACK');return {status:'cooldown'};}
    const rodLevel=Number(state.rows[0]?.rod_level||1);
    const baitCount=Number(state.rows[0]?.bait_count||0);
    const activeBaitKey=String(state.rows[0]?.active_bait_key||'basic');
    const bait=FISHING_BAITS.find(item=>item.key===activeBaitKey&&item.zones.includes(zone.key));
    const baitUsed=bait&&baitCount>0?bait.key:'basic';
    const caught=rollFish(zone.key,random,{rodLevel,baitKey:baitUsed});
    if(!caught){await client.query('ROLLBACK');return {status:'no_fish'};}
    await client.query(
      'INSERT INTO user_fish_collection(guild_id,user_id,fish_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,fish_key) DO UPDATE SET quantity=user_fish_collection.quantity+1,last_caught_at=NOW()',
      [input.guildId,input.userId,caught.key]
    );
    await client.query(
      `UPDATE user_fishing_state SET last_fished_at=NOW(),total_catches=total_catches+1,
       bait_count=CASE WHEN $3 THEN GREATEST(0,bait_count-1) ELSE bait_count END,
       active_bait_key=CASE WHEN $3 AND bait_count<=1 THEN 'basic' ELSE active_bait_key END
       WHERE guild_id=$1 AND user_id=$2`,
      [input.guildId,input.userId,baitUsed!=='basic']
    );
    await client.query('COMMIT');
    return {status:'caught',fish:caught,zone,level,rodLevel,baitUsed:baitUsed==='basic'?null:baitUsed};
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
export async function getFishCollection(db,guildId,userId) {
  const result=await db.query('SELECT fish_key,quantity FROM user_fish_collection WHERE guild_id=$1 AND user_id=$2 AND quantity>0 ORDER BY quantity DESC,fish_key',[guildId,userId]);
  const rows=result.rows||[];
  return {caught:rows.reduce((sum,row)=>sum+Number(row.quantity||0),0),unique:rows.length,totalSpecies:FISH_CATALOG.length,
    entries:rows.map(row=>({...row,fish:FISH_CATALOG.find(item=>item.key===row.fish_key)||null}))};
}
