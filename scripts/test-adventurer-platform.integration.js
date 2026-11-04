import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDatabase, pool, ensureUser } from '../database/db.js';
import {
  ensureAdventurerPlatformTables, ensureActiveArenaSeason, settleArenaMatch, createGuildEvent, joinGuildEvent,
  leaveGuildEvent, listGuildEvents, claimDueGuildEventReminders, markGuildEventReminderSent, releaseGuildEventReminderClaim, createSiteLinkToken, redeemSiteLinkToken, getAdventurerDashboard, getAdventurerInventory
} from '../adventurer-platform.js';

function assertIsolatedAuditDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost','127.0.0.1','::1'].includes(url.hostname) || url.pathname !== '/frieren_audit') {
    throw new Error('Adventurer platform integration tests require isolated local frieren_audit PostgreSQL.');
  }
}
function makeIds(prefix, count) {
  const seed = BigInt(parseInt(randomUUID().replaceAll('-','').slice(0,8),16));
  return Array.from({length:count},(_,i)=>String(BigInt(prefix)+seed*100n+BigInt(i+1)).slice(0,17));
}

test('active arena season expires at day 90 and rolls over to exactly one new 90-day season', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000100';
  try {
    await pool.query(
      "INSERT INTO arena_seasons(guild_id,name,starts_at,ends_at,status) VALUES($1,'Expired fixture',NOW()-INTERVAL '90 days',NOW()-INTERVAL '1 second','active')",
      [guildId]
    );
    const season = await ensureActiveArenaSeason(pool, guildId);
    const rows = await pool.query(
      "SELECT name,status,starts_at,ends_at FROM arena_seasons WHERE guild_id=$1 ORDER BY season_id",
      [guildId]
    );
    assert.equal(rows.rowCount,2);
    assert.equal(rows.rows[0].status,'completed');
    assert.equal(rows.rows[1].status,'active');
    assert.equal(season.name,rows.rows[1].name);
    const duration = new Date(rows.rows[1].ends_at).getTime()-new Date(rows.rows[1].starts_at).getTime();
    assert.ok(Math.abs(duration-90*86400000)<5000,'new season must last 90 days');
    const active = await pool.query("SELECT COUNT(*)::int AS count FROM arena_seasons WHERE guild_id=$1 AND status='active'",[guildId]);
    assert.equal(active.rows[0].count,1);
  } finally {
    await pool.query('DELETE FROM arena_seasons WHERE guild_id=$1',[guildId]);
  }
});

test('arena season MMR and rewards settle atomically and only once', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000101';
  const users=makeIds('71000000000000000',6);
  const matchId=randomUUID();
  for(const userId of users) await ensureUser(guildId,userId);
  const state={
    matchId,status:'finished',winner:'A',round:4,turnCount:24,
    players:users.map((userId,index)=>({userId,name:'Test '+index,team:index<3?'A':'B',alive:index<3,hp:index<3?40:0,maxHp:100,mana:30,maxMana:100,attack:20,defense:5}))
  };
  try {
    await pool.query('INSERT INTO arena_matches(match_id,guild_id,status,state) VALUES($1,$2,\'finished\',$3::jsonb)',[matchId,guildId,JSON.stringify(state)]);
    const client=await pool.connect();
    let first,second;
    try {
      await client.query('BEGIN');
      first=await settleArenaMatch(client,{guildId,matchId,state});
      second=await settleArenaMatch(client,{guildId,matchId,state});
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { client.release(); }
    assert.equal(first.settled,true);
    assert.equal(second.settled,false);
    const season=first.season;
    const ratings=await pool.query('SELECT user_id,rating,wins,losses,matches,points FROM arena_ratings WHERE season_id=$1 AND guild_id=$2',[season.season_id,guildId]);
    assert.equal(ratings.rowCount,6);
    for(const row of ratings.rows) {
      if(users.slice(0,3).includes(row.user_id)) {
        assert.equal(row.wins,1); assert.equal(row.losses,0); assert.equal(row.points,3); assert.ok(row.rating>1000);
      } else {
        assert.equal(row.wins,0); assert.equal(row.losses,1); assert.equal(row.points,0); assert.ok(row.rating<1000);
      }
      assert.equal(row.matches,1);
    }
    const balances=await pool.query('SELECT user_id,coins,xp FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,users]);
    for(const row of balances.rows) {
      if(users.slice(0,3).includes(row.user_id)) { assert.equal(row.coins,100); assert.equal(row.xp,50); }
      else { assert.equal(row.coins,40); assert.equal(row.xp,20); }
    }
    const resultCount=await pool.query('SELECT COUNT(*)::int AS count FROM arena_match_results WHERE match_id=$1',[matchId]);
    assert.equal(resultCount.rows[0].count,1);
  } finally {
    await pool.query('DELETE FROM arena_matches WHERE match_id=$1',[matchId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,users]);
  }
});

test('event calendar enforces idempotent registration, capacity and concurrent seat claims', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000102';
  const users=makeIds('72000000000000000',3);
  for(const userId of users) await ensureUser(guildId,userId);
  const start=new Date(Date.now()+60*60_000).toISOString();
  const end=new Date(Date.now()+2*60*60_000).toISOString();
  let eventId,concurrentEventId;
  try {
    eventId=(await createGuildEvent(pool,{guildId,createdBy:users[0],title:'Test Zindan Gecesi',description:'İzole test etkinliği',startsAt:start,endsAt:end,maxParticipants:1})).eventId;
    assert.equal((await joinGuildEvent(pool,{guildId,eventId,userId:users[0]})).status,'joined');
    assert.equal((await joinGuildEvent(pool,{guildId,eventId,userId:users[0]})).status,'already_joined');
    assert.equal((await joinGuildEvent(pool,{guildId,eventId,userId:users[1]})).status,'full');
    assert.equal((await leaveGuildEvent(pool,{guildId,eventId,userId:users[0]})).removed,true);
    assert.equal((await joinGuildEvent(pool,{guildId,eventId,userId:users[1]})).status,'joined');
    const listed=await listGuildEvents(pool,guildId);
    assert.equal(listed.find(item=>item.event_id===eventId).participants,1);

    concurrentEventId=(await createGuildEvent(pool,{guildId,createdBy:users[0],title:'Eşzamanlı Kayıt',startsAt:start,endsAt:end,maxParticipants:1})).eventId;
    const concurrent=await Promise.all(users.slice(1).map(userId=>joinGuildEvent(pool,{guildId,eventId:concurrentEventId,userId})));
    assert.equal(concurrent.filter(item=>item.status==='joined').length,1);
    assert.equal(concurrent.filter(item=>item.status==='full').length,1);
  } finally {
    if(eventId) await pool.query('DELETE FROM guild_events WHERE event_id=$1',[eventId]);
    if(concurrentEventId) await pool.query('DELETE FROM guild_events WHERE event_id=$1',[concurrentEventId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=ANY($2::text[])',[guildId,users]);
  }
});

test('single-use Discord link codes connect only the intended profile to a web account', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000103';
  const userId=makeIds('73000000000000000',1)[0];
  const accountUuid=randomUUID();
  const accountId='site_'+accountUuid;
  await ensureUser(guildId,userId);
  try {
    await pool.query("UPDATE users SET character_name='Test Maceracı',class_name='Büyücü',level=7,xp=360,coins=125,hp=80,mana=60 WHERE guild_id=$1 AND user_id=$2",[guildId,userId]);
    const {token}=await createSiteLinkToken(pool,{guildId,userId});
    const linked=await redeemSiteLinkToken(pool,accountId,token);
    assert.equal(linked.status,'linked');
    assert.equal(linked.guildId,guildId);
    assert.equal(linked.userId,userId);
    assert.equal((await redeemSiteLinkToken(pool,accountId,token)).status,'invalid_or_expired');
    const dashboard=await getAdventurerDashboard(pool,accountId);
    assert.equal(dashboard.profiles.length,1);
    assert.equal(dashboard.profiles[0].character_name,'Test Maceracı');
    assert.equal(Number(dashboard.profiles[0].level),7);
  } finally {
    await pool.query('DELETE FROM site_discord_links WHERE account_id=$1',[accountId.slice(5)]);
    await pool.query('DELETE FROM site_link_tokens WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  }
});

test('concurrent Discord link redemption is single-use and dashboards cannot expose another account', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000104';
  const userId=makeIds('73000000000000000',1)[0];
  const accountId='site_'+randomUUID();
  const unrelatedAccountId='site_'+randomUUID();
  await ensureUser(guildId,userId);
  try {
    await pool.query(
      "UPDATE users SET character_name='Fern',class_name='Büyücü',level=12,xp=900,coins=450 WHERE guild_id=$1 AND user_id=$2",
      [guildId,userId]
    );
    const {token}=await createSiteLinkToken(pool,{guildId,userId});
    const outcomes=await Promise.all([
      redeemSiteLinkToken(pool,accountId,token),
      redeemSiteLinkToken(pool,accountId,token)
    ]);
    assert.equal(outcomes.filter(value=>value.status==='linked').length,1,
      'a token may establish exactly one link under concurrent redemption');
    assert.equal(outcomes.filter(value=>value.status==='invalid_or_expired').length,1,
      'the second redemption must observe the consumed token');

    const [ownerDashboard,unrelatedDashboard]=await Promise.all([
      getAdventurerDashboard(pool,accountId),
      getAdventurerDashboard(pool,unrelatedAccountId)
    ]);
    assert.equal(ownerDashboard.profiles.length,1);
    assert.equal(ownerDashboard.profiles[0].character_name,'Fern');
    assert.equal(Number(ownerDashboard.profiles[0].coins),450);
    assert.equal(unrelatedDashboard.profiles.length,0,
      'an unrelated web account must not receive another account\'s linked Discord profile');
    assert.equal(unrelatedDashboard.events.length,0);
  } finally {
    await pool.query('DELETE FROM site_discord_links WHERE account_id=ANY($1::uuid[])',[[
      accountId.slice(5),unrelatedAccountId.slice(5)
    ]]);
    await pool.query('DELETE FROM site_link_tokens WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  }
});


test('event reminders are claimed once, retried after delivery failure and finalized idempotently', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000105';
  const channelId='99000000000000106';
  const userId=makeIds('74000000000000000',1)[0];
  await ensureUser(guildId,userId);
  const now=new Date();
  const start=new Date(now.getTime()+20*60_000).toISOString();
  const end=new Date(now.getTime()+80*60_000).toISOString();
  let eventId;
  try {
    eventId=(await createGuildEvent(pool,{
      guildId,createdBy:userId,channelId,title:'Hatırlatma Deneme Etkinliği',
      startsAt:start,endsAt:end
    })).eventId;
    const claimed=await claimDueGuildEventReminders(pool,10,now);
    const item=claimed.find(row=>row.event_id===eventId);
    assert.ok(item,'event starting within 30 minutes should be claimed');
    assert.equal(item.channel_id,channelId);
    assert.deepEqual(item.attendee_ids,[]);
    const concurrent=await claimDueGuildEventReminders(pool,10,now);
    assert.equal(concurrent.some(row=>row.event_id===eventId),false,
      'a claimed reminder must not be delivered twice');
    assert.equal(await releaseGuildEventReminderClaim(pool,eventId,item.reminder_claimed_at),true);
    const retry=await claimDueGuildEventReminders(pool,10,now);
    const retryItem=retry.find(row=>row.event_id===eventId);
    assert.ok(retryItem,'failed delivery claim must be retryable');
    assert.equal(await markGuildEventReminderSent(pool,eventId,retryItem.reminder_claimed_at),true);
    assert.equal(await markGuildEventReminderSent(pool,eventId,retryItem.reminder_claimed_at),false,
      'a reminder can be finalized only once');
    assert.equal((await claimDueGuildEventReminders(pool,10,now)).some(row=>row.event_id===eventId),false);
  } finally {
    if(eventId) await pool.query('DELETE FROM guild_events WHERE event_id=$1',[eventId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  }
});

test('linked adventurer inventory is account-scoped and includes equipment and RSVP state', async () => {
  assertIsolatedAuditDatabase();
  await initDatabase();
  await ensureAdventurerPlatformTables(pool);
  const guildId='99000000000000123';
  const [userId]=makeIds('72000000000000000',1);
  const accountId='site_'+randomUUID();
  let eventId=null;
  await ensureUser(guildId,userId);
  try {
    await pool.query('INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,2)',[guildId,userId,'Mana Kristali']);
    await pool.query('INSERT INTO user_equipment(guild_id,user_id,slot,item_key) VALUES($1,$2,$3,$4)',[guildId,userId,'weapon','Efsunlu Asa']);
    const link=await createSiteLinkToken(pool,{guildId,userId});
    assert.equal((await redeemSiteLinkToken(pool,accountId,link.token)).status,'linked');
    const event=await createGuildEvent(pool,{guildId,title:'Portal RSVP Fixture',startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),createdBy:userId});
    eventId=event.eventId;
    assert.equal((await joinGuildEvent(pool,{guildId,eventId,userId})).status,'joined');
    const inventory=await getAdventurerInventory(pool,accountId,guildId);
    assert.equal(inventory.profile.user_id,userId);
    assert.ok(inventory.items.some(item=>item.item_key==='Mana Kristali'&&Number(item.quantity)===2));
    assert.ok(inventory.items.some(item=>item.item_key==='Efsunlu Asa'&&item.slot==='weapon'));
    const dashboard=await getAdventurerDashboard(pool,accountId);
    const listed=dashboard.events.find(item=>item.event_id===eventId);
    assert.ok(listed);
    assert.equal(listed.joined,true);
  } finally {
    await pool.query('DELETE FROM site_discord_links WHERE account_id=$1',[accountUuid]);
    if(eventId) await pool.query('DELETE FROM guild_events WHERE event_id=$1',[eventId]);
    await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  }
});
