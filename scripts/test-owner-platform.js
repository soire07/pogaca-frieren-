import test from 'node:test';
import assert from 'node:assert/strict';
import { saveOwnerPartnerLink, deleteOwnerPartnerLink, getOwnerRpgMetrics, updateGuildConfiguration } from '../owner-platform.js';

test('partner records validate Discord invite URLs and write atomically with audit', async () => {
  let call;
  const db = { query: async (sql, params) => { call={sql,params}; return {rows:[{id:4,guild_id:params[0]}]}; } };
  await assert.rejects(saveOwnerPartnerLink(db,{guildId:'123',name:'Partner',inviteUrl:'https://discord.gg/abc'}),/INVALID_PARTNER_DATA/);
  const saved=await saveOwnerPartnerLink(db,{guildId:'123456789012345678',name:'Partner',inviteUrl:'https://discord.gg/abc'});
  assert.equal(saved.id,4);
  assert.match(call.sql,/owner_audit_logs/);
  assert.equal(call.params[0],'123456789012345678');
});

test('partner deletion rejects invalid identifiers and audits valid removal', async () => {
  let sql='';
  const db={query:async q=>{sql=q;return {rows:[{id:2}]};}};
  await assert.rejects(deleteOwnerPartnerLink(db,'-1'),/INVALID_PARTNER_ID/);
  assert.equal((await deleteOwnerPartnerLink(db,'2')).id,2);
  assert.match(sql,/DELETE FROM owner_partner_links/);
  assert.match(sql,/owner_audit_logs/);
});

test('RPG dashboard metrics are aggregated from live gameplay tables', async () => {
  const db={query:async sql=>({rows:[sql.includes('FROM users')&&sql.includes('AVG(level)')?{players:12,average_level:'4.5',total_coins:'900'}:sql.includes('FROM inventory')?{inventory_stacks:6,item_count:'14'}:{boss_wins:'3',dungeon_wins:'8'}]})};
  const metrics=await getOwnerRpgMetrics(db);
  assert.deepEqual(metrics,{players:12,averageLevel:4.5,totalCoins:900,inventoryStacks:6,itemCount:14,bossWins:3,dungeonWins:8});
});

test('guild settings require a real text channel in the selected guild', async () => {
  let queried=false;
  const channel={id:'223456789012345678',guildId:'123456789012345678',isTextBased:()=>true,send:()=>{},permissionsFor:()=>({has:()=>true})};
  const guild={channels:{fetch:async()=>channel},members:{me:{} }};
  const client={guilds:{cache:new Map([['123456789012345678',guild]])}};
  const db={query:async()=>{queried=true;return {rows:[{guild_id:'123456789012345678'}]};}};
  await assert.rejects(updateGuildConfiguration(db,client,{guildId:'999999999999999999',welcomeChannelId:channel.id}),/GUILD_NOT_FOUND/);
  assert.equal(queried,false);
  await updateGuildConfiguration(db,client,{guildId:'123456789012345678',welcomeChannelId:channel.id});
  assert.equal(queried,true);
});
