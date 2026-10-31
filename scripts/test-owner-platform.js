import test from 'node:test';
import assert from 'node:assert/strict';
import { saveOwnerPartnerLink, deleteOwnerPartnerLink, getOwnerRpgMetrics, updateGuildConfiguration, searchOwnerRpgPlayers, getOwnerRpgPlayerDetails, adjustOwnerRpgResources, adjustOwnerRpgInventory, setOwnerRpgEquipment } from '../owner-platform.js';

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


test('RPG player search is guild-scoped and bounded', async () => {
  let params;
  const db = { query: async (_sql, values) => { params = values; return { rows: [{ user_id: '123456789012345678' }] }; } };
  const result = await searchOwnerRpgPlayers(db, { guildId: '223456789012345678', query: 'Frieren', limit: 500 });
  assert.equal(result.length, 1);
  assert.equal(params[0], '223456789012345678');
  assert.equal(params[3], 25);
  await assert.rejects(searchOwnerRpgPlayers(db, { guildId: 'bad' }), /INVALID_GUILD_ID/);
});

test('RPG player detail returns inventory only for the selected guild and player', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push(params);
    return sql.includes('FROM users')
      ? { rows: [{ user_id: params[1], coins: 50 }] }
      : { rows: [{ item_key: 'healing_potion', quantity: 2 }] };
  } };
  const detail = await getOwnerRpgPlayerDetails(db, { guildId: '223456789012345678', userId: '123456789012345678' });
  assert.equal(detail.coins, 50);
  assert.deepEqual(detail.inventory, [{ item_key: 'healing_potion', quantity: 2 }]);
  assert.deepEqual(calls, [['223456789012345678','123456789012345678'],['223456789012345678','123456789012345678']]);
});

test('RPG resource adjustment locks player, writes audit, and commits atomically', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT coins,xp')) return { rows: [{ coins: 100, xp: 20, level: 1 }] };
      if (sql.includes('UPDATE users')) return { rows: [{ coins: 150, xp: 25, level: 1 }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  const result = await adjustOwnerRpgResources({ connect: async () => client }, {
    guildId: '223456789012345678', userId: '123456789012345678',
    coinsDelta: 50, xpDelta: 5, reason: 'Düzeltme', actorId: '1553794496234262641'
  });
  assert.deepEqual(result, { before: { coins: 100, xp: 20, level: 1 }, after: { coins: 150, xp: 25, level: 1 } });
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql.includes('FOR UPDATE')));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('RPG resource adjustment rolls back if audit insertion fails', async () => {
  const calls = [];
  const client = {
    query: async sql => {
      calls.push(sql);
      if (sql.includes('SELECT coins,xp')) return { rows: [{ coins: 100, xp: 20, level: 1 }] };
      if (sql.includes('UPDATE users')) return { rows: [{ coins: 110, xp: 20, level: 1 }] };
      if (sql.includes('owner_audit_logs')) throw new Error('audit unavailable');
      return { rows: [] };
    },
    release() {}
  };
  await assert.rejects(adjustOwnerRpgResources({ connect: async () => client }, {
    guildId: '223456789012345678', userId: '123456789012345678',
    coinsDelta: 10, reason: 'Düzeltme'
  }), /audit unavailable/);
  assert.ok(calls.includes('ROLLBACK'));
});

test('RPG resource adjustment rejects unbounded or reasonless edits before opening a transaction', async () => {
  let connected = false;
  const db = { connect: async () => { connected = true; throw new Error('should not connect'); } };
  await assert.rejects(adjustOwnerRpgResources(db, {
    guildId: '223456789012345678', userId: '123456789012345678', coinsDelta: 1000001, reason: 'x'
  }), /INVALID_RPG_ADJUSTMENT/);
  await assert.rejects(adjustOwnerRpgResources(db, {
    guildId: '223456789012345678', userId: '123456789012345678', coinsDelta: 1, reason: ''
  }), /INVALID_RPG_ADJUSTMENT/);
  assert.equal(connected, false);
});


test('RPG resource adjustment rejects negative XP to preserve previously earned stat points', async () => {
  let connected = false;
  const db = { connect: async () => { connected = true; throw new Error('should not connect'); } };
  await assert.rejects(adjustOwnerRpgResources(db, {
    guildId: '223456789012345678', userId: '123456789012345678',
    xpDelta: -5, reason: 'correction'
  }), /INVALID_RPG_ADJUSTMENT/);
  assert.equal(connected, false);
});


test('owner inventory grants known equipment and audits the change atomically', async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT user_id FROM users')) return { rows: [{ user_id: '123456789012345678' }] };
    if (sql.includes('SELECT quantity FROM inventory')) return { rows: [{ quantity: 1 }] };
    if (sql.includes('SELECT slot,item_key FROM user_equipment')) return { rows: [] };
    return { rows: [] };
  }, release() {} };
  const result = await adjustOwnerRpgInventory({ connect: async () => client }, {
    guildId: '223456789012345678', userId: '123456789012345678',
    itemId: 'iron_sword', quantityDelta: 2, reason: 'Etkinlik ödülü',
    actorId: '1553794496234262641'
  });
  assert.equal(result.quantity, 3);
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});

test('owner inventory refuses to remove equipped copies and rolls back', async () => {
  const calls = [];
  const client = { query: async (sql) => {
    calls.push(sql);
    if (sql.includes('SELECT user_id FROM users')) return { rows: [{ user_id: '123456789012345678' }] };
    if (sql.includes('SELECT quantity FROM inventory')) return { rows: [{ quantity: 1 }] };
    if (sql.includes('SELECT slot,item_key FROM user_equipment')) return { rows: [{ slot: 'weapon', item_key: '⚔️ Gezginin Demir Kılıcı' }] };
    return { rows: [] };
  }, release() {} };
  await assert.rejects(adjustOwnerRpgInventory({ connect: async () => client }, {
    guildId: '223456789012345678', userId: '123456789012345678',
    itemId: 'iron_sword', quantityDelta: -1, reason: 'Düzeltme',
    actorId: '1553794496234262641'
  }), /EQUIPPED_ITEM_CANNOT_BE_REMOVED/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
});

test('owner equipment change validates ownership, slot and preserves base max stats', async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT level FROM users')) return { rows: [{ level: 10, hp: 90, max_hp: 100, mana: 80, max_mana: 100 }] };
    if (sql.includes('SELECT quantity FROM inventory')) return { rows: [{ quantity: 1 }] };
    if (sql.includes('SELECT item_key FROM user_equipment')) return { rows: [{ item_key: '⚔️ Gezginin Demir Kılıcı' }] };
    return { rows: [] };
  }, release() {} };
  const result = await setOwnerRpgEquipment({ connect: async () => client }, {
    guildId: '223456789012345678', userId: '123456789012345678',
    slot: 'weapon', itemId: 'iron_sword', reason: 'Test kuşanma',
    actorId: '1553794496234262641'
  });
  assert.equal(result.slot, 'weapon');
  assert.ok(calls.some(call => call.sql.includes('LEAST(hp')));
  assert.ok(!calls.some(call => call.sql.includes('SET max_hp')));
  assert.ok(calls.some(call => call.sql.includes('owner_audit_logs')));
});

test('owner equipment rejects ring slots for non-ring items before connecting', async () => {
  let connected = false;
  const db = { connect: async () => { connected = true; throw new Error('should not connect'); } };
  await assert.rejects(setOwnerRpgEquipment(db, {
    guildId: '223456789012345678', userId: '123456789012345678',
    slot: 'ring1', itemId: 'iron_sword', reason: 'invalid',
    actorId: '1553794496234262641'
  }), /INVALID_EQUIPMENT_SLOT/);
  assert.equal(connected, false);
});
