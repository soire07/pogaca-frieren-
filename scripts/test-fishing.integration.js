import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, initDatabase } from '../database/db.js';
import { fishAtZone, getFishCollection, initFishingSchema } from '../fishing.js';
const guildId='fishing-audit-guild', userId='fishing-audit-user';
before(async () => {
  await initDatabase(); await initFishingSchema(pool);
  await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  await pool.query('INSERT INTO users(guild_id,user_id,level) VALUES($1,$2,1)',[guildId,userId]);
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
