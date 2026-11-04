import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundRobinFixtures, createGuildTeam, joinGuildTeam, reportGuildTeamFixtureScore, ensureGuildTeamLeagueSchema, validateGuildEventRaidTeam } from '../guild-team-leagues.js';

const guildId='1539562273197260860';
const captain='123456789012345678';
const member='223456789012345678';
const teamA='123e4567-e89b-42d3-a456-426614174000';
const teamB='223e4567-e89b-42d3-a456-426614174000';
const leagueId='323e4567-e89b-42d3-a456-426614174000';
const fixtureId='423e4567-e89b-42d3-a456-426614174000';

test('round robin schedule covers every pair once and gives each team one bye for odd leagues',()=>{
 const ids=[teamA,teamB,'323e4567-e89b-42d3-a456-426614174001','423e4567-e89b-42d3-a456-426614174001'];
 const fixtures=buildRoundRobinFixtures(ids,{startsAt:'2026-11-10T18:00:00.000Z'});
 assert.equal(fixtures.length,6);
 assert.equal(new Set(fixtures.map(x=>[x.homeTeamId,x.awayTeamId].sort().join(':'))).size,6);
 assert.equal(new Set(fixtures.map(x=>x.roundNumber)).size,3);
 const odd=buildRoundRobinFixtures(ids.slice(0,3),{startsAt:'2026-11-10T18:00:00.000Z'});
 assert.equal(odd.length,3);
 assert.ok(odd.every(x=>x.homeTeamId!==x.awayTeamId));
});

test('round robin rejects too few, too many and malformed teams or invalid dates',()=>{
 assert.throws(()=>buildRoundRobinFixtures([teamA]),/LEAGUE_TEAM_COUNT_INVALID/);
 assert.throws(()=>buildRoundRobinFixtures(Array.from({length:17},(_,i)=>'123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0'))),/LEAGUE_TEAM_COUNT_INVALID/);
 assert.throws(()=>buildRoundRobinFixtures([teamA,teamB],{startsAt:'invalid'}),/LEAGUE_SCHEDULE_INVALID/);
});

test('team creation is transactional and prevents one player joining multiple teams',async()=>{
 const calls=[];
 const db={async connect(){return{async query(sql,params){
  calls.push({sql,params});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[],rowCount:1};
  if(sql.includes('SELECT team_id FROM guild_team_members'))return{rows:[],rowCount:0};
  if(sql.includes('INSERT INTO guild_teams'))return{rows:[{team_id:teamA,team_name:'Fern Takımı',captain_id:captain}],rowCount:1};
  return{rows:[],rowCount:1};
 },release(){}};}};
 const result=await createGuildTeam(db,{guildId,captainId:captain,name:'Fern Takımı'});
 assert.equal(result.status,'created');
 assert.ok(calls.some(x=>x.sql==='BEGIN'));
 assert.ok(calls.some(x=>x.sql.includes("role) VALUES($1,$2,$3,'captain')")));
});

test('team join enforces team membership and maximum size transactionally',async()=>{
 let members=0;
 const db={async connect(){return{async query(sql){
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[],rowCount:1};
  if(sql.includes('FROM guild_teams'))return{rows:[{team_id:teamA}],rowCount:1};
  if(sql.includes('FROM guild_team_members WHERE guild_id=$1 AND user_id=$2'))return{rows:[],rowCount:0};
  if(sql.includes('COUNT(*)'))return{rows:[{count:members}],rowCount:1};
  if(sql.includes('INSERT INTO guild_team_members')){members++;return{rows:[],rowCount:1};}
  throw new Error('Unexpected query '+sql);
 },release(){}};}};
 assert.equal((await joinGuildTeam(db,{guildId,userId:member,teamId:teamA})).status,'joined');
 members=10;
 assert.equal((await joinGuildTeam(db,{guildId,userId:'323456789012345678',teamId:teamA})).status,'team_full');
});

test('fixture score is not finalized until both team captains confirm the same result',async()=>{
 let reportCount=0,completed=false;
 const db={async connect(){return{async query(sql,params){
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[],rowCount:1};
  if(sql.includes('FROM guild_team_fixtures WHERE'))return{rows:[{fixture_id:fixtureId,league_id:leagueId,home_team_id:teamA,away_team_id:teamB,status:'scheduled'}],rowCount:1};
  if(sql.includes("role='captain'"))return{rows:[{ok:true}],rowCount:1};
  if(sql.includes('INSERT INTO guild_team_fixture_reports')){reportCount++;return{rows:[],rowCount:1};}
  if(sql.includes('FROM guild_team_fixture_reports'))return{rows:reportCount===1?[{team_id:teamA,own_score:2,opponent_score:1}]:[{team_id:teamA,own_score:2,opponent_score:1},{team_id:teamB,own_score:1,opponent_score:2}],rowCount:reportCount};
  if(sql.includes("SET status='awaiting_confirmation'"))return{rows:[],rowCount:1};
  if(sql.includes("SET status='completed'")){completed=true;return{rows:[],rowCount:1};}
  if(sql.includes('UPDATE guild_team_league_entries'))return{rows:[],rowCount:1};
  if(sql.includes("status NOT IN ('completed','cancelled')"))return{rows:[],rowCount:0};
  throw new Error('Unexpected query '+sql);
 },release(){}};}};
 const first=await reportGuildTeamFixtureScore(db,{guildId,fixtureId,teamId:teamA,actorId:captain,ownScore:2,opponentScore:1});
 assert.equal(first.status,'awaiting_confirmation');
 assert.equal(completed,false);
 const second=await reportGuildTeamFixtureScore(db,{guildId,fixtureId,teamId:teamB,actorId:member,ownScore:1,opponentScore:2});
 assert.equal(second.status,'completed');
 assert.equal(completed,true);
});

test('fixture reports reject scores outside the bounded range',async()=>{
 await assert.rejects(()=>reportGuildTeamFixtureScore({}, {guildId,fixtureId,teamId:teamA,actorId:captain,ownScore:100,opponentScore:0}),/FIXTURE_SCORE_INVALID/);
});

test('raid participation schema links signups to real guild team UUIDs and preserves legacy A/B rows',async()=>{
 const statements=[];
 await ensureGuildTeamLeagueSchema({async query(sql){statements.push(sql);return{rows:[],rowCount:0};}});
 assert.match(statements[0],/ADD COLUMN IF NOT EXISTS team_id UUID/);
 assert.match(statements[0],/FOREIGN KEY\(guild_id,team_id\) REFERENCES guild_teams\(guild_id,team_id\) ON DELETE RESTRICT/);
 assert.match(statements[0],/guild_event_participants_team_id_idx/);
});


test('raid event requires every participant to share the leader\'s registered team UUID',async()=>{
 const calls=[];
 const db={async query(sql,params){
  calls.push({sql,params});
  return {rows:[{event_id:fixtureId,team_id:teamA}],rowCount:1};
 }};
 const result=await validateGuildEventRaidTeam(db,{guildId,eventId:fixtureId,userIds:[captain,member],leaderId:captain});
 assert.equal(result.status,'valid');
 assert.equal(result.teamId,teamA);
 assert.match(calls[0].sql,/participant\.team_id IS DISTINCT FROM captain\.team_id/);
 assert.deepEqual(calls[0].params,[fixtureId,guildId,[captain,member],captain]);
});

test('raid event rejects mixed or legacy A/B-only registrations and malformed rosters',async()=>{
 const db={async query(){return {rows:[],rowCount:0};}};
 assert.equal((await validateGuildEventRaidTeam(db,{guildId,eventId:fixtureId,userIds:[captain,member],leaderId:captain})).status,'team_mismatch_or_unregistered');
 assert.equal((await validateGuildEventRaidTeam(db,{guildId,eventId:fixtureId,userIds:[captain,member, '323456789012345678','423456789012345678','523456789012345678'],leaderId:captain})).status,'invalid_input');
 assert.equal((await validateGuildEventRaidTeam(db,{guildId,eventId:fixtureId,userIds:[captain,captain],leaderId:captain})).status,'invalid_input');
});
