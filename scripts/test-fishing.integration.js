import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, initDatabase } from '../database/db.js';
import { fishAtZone, getFishCollection, getFishingGear, initFishingSchema, upgradeFishingRod, purchaseFishingBait } from '../fishing.js';
const guildId='99000000000000004', userId='82000000000000001';
before(async () => {
  await initDatabase(); await initFishingSchema(pool);
  await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  await pool.query('INSERT INTO users(guild_id,user_id,level,coins) VALUES($1,$2,1,10000)',[guildId,userId]);
});
after(async () => { await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]); await pool.end(); });
test('concurrent fishing requests award one catch and enforce cooldown atomically', async () => {
  const results=await Promise.all([
    fishAtZone(pool,{guildId,userId,zoneKey:'kuzey_kiyisi'},{random:()=>0}),
    fishAtZone(pool,{guildId,userId,zoneKey:'kuzey_kiyisi'},{random:()=>.5})
  ]);
  assert.equal(results.filter(item=>item.status==='caught').length,1);
  assert.equal(results.filter(item=>item.status==='cooldown').length,1);
  const book=await getFishCollection(pool,guildId,userId);
  assert.equal(book.caught,1); assert.equal(book.unique,1);
});
test('locked region does not consume a fishing attempt', async () => {
  const result=await fishAtZone(pool,{guildId,userId,zoneKey:'mana_nehri'},{random:()=>0});
  assert.equal(result.status,'locked_zone'); assert.equal(result.requiredLevel,20);
  const state=await pool.query('SELECT total_catches FROM user_fishing_state WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  assert.equal(Number(state.rows[0].total_catches),1);
});

test('rod upgrades and bait purchases settle atomically and bait is consumed on a successful catch', async () => {
  const initial=await getFishingGear(pool,guildId,userId);
  assert.equal(initial.rodLevel,1);
  assert.equal(initial.baitCount,0);
  const rodTwo=await upgradeFishingRod(pool,{guildId,userId});
  assert.equal(rodTwo.status,'upgraded');
  assert.equal(rodTwo.rodLevel,2);
  const rodThree=await upgradeFishingRod(pool,{guildId,userId});
  assert.equal(rodThree.status,'upgraded');
  assert.equal(rodThree.rodLevel,3);
  const maxed=await upgradeFishingRod(pool,{guildId,userId});
  assert.equal(maxed.status,'max_level');

  const bait=await purchaseFishingBait(pool,{guildId,userId,baitKey:'mana'});
  assert.equal(bait.status,'purchased');
  assert.equal(bait.baitCount,5);
  const blockedSwitch=await purchaseFishingBait(pool,{guildId,userId,baitKey:'frost'});
  assert.equal(blockedSwitch.status,'bait_stack_active');

  await pool.query("UPDATE users SET level=20 WHERE guild_id=$1 AND user_id=$2",[guildId,userId]);
  await pool.query("UPDATE user_fishing_state SET last_fished_at=NOW()-INTERVAL '31 minutes' WHERE guild_id=$1 AND user_id=$2",[guildId,userId]);
  const caught=await fishAtZone(pool,{guildId,userId,zoneKey:'mana_nehri'},{random:()=>0});
  assert.equal(caught.status,'caught');
  assert.equal(caught.rodLevel,3);
  assert.equal(caught.baitUsed,'mana');
  const afterCatch=await getFishingGear(pool,guildId,userId);
  assert.equal(afterCatch.baitCount,4);
  assert.equal(afterCatch.activeBaitKey,'mana');

  await pool.query('UPDATE users SET coins=0 WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  const insufficient=await purchaseFishingBait(pool,{guildId,userId,baitKey:'mana'});
  assert.equal(insufficient.status,'insufficient_funds');
  const unchanged=await getFishingGear(pool,guildId,userId);
  assert.equal(unchanged.baitCount,4);
  assert.equal(unchanged.activeBaitKey,'mana');
});
