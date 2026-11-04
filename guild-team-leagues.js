import { randomUUID } from 'node:crypto';

const DISCORD_ID=/^\d{17,20}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validIds=(guildId,userId)=>DISCORD_ID.test(String(guildId||''))&&DISCORD_ID.test(String(userId||''));
const safeName=value=>{const name=String(value||'').trim().replace(/\s+/g,' ');if(name.length<3||name.length>32||/[\u0000-\u001f\u007f]/.test(name))throw new Error('TEAM_NAME_INVALID');return name;};

export async function ensureGuildTeamLeagueSchema(db){
 await db.query(`
  CREATE TABLE IF NOT EXISTS guild_teams(
   team_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,team_name VARCHAR(32) NOT NULL,
   captain_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   UNIQUE(guild_id,team_name),UNIQUE(guild_id,team_id)
  );
  CREATE TABLE IF NOT EXISTS guild_team_members(
   guild_id TEXT NOT NULL,team_id UUID NOT NULL,user_id TEXT NOT NULL,
   role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('captain','member')),
   joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY(team_id,user_id),UNIQUE(guild_id,user_id),
   FOREIGN KEY(guild_id,team_id) REFERENCES guild_teams(guild_id,team_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS guild_team_leagues(
   league_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,season_name VARCHAR(80) NOT NULL,
   starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,
   status TEXT NOT NULL DEFAULT 'registration' CHECK(status IN ('registration','scheduled','completed','cancelled')),
   created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CHECK(ends_at>starts_at),UNIQUE(guild_id,season_name),UNIQUE(guild_id,league_id)
  );
  CREATE TABLE IF NOT EXISTS guild_team_league_entries(
   guild_id TEXT NOT NULL,league_id UUID NOT NULL,team_id UUID NOT NULL,
   points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0),wins INTEGER NOT NULL DEFAULT 0 CHECK(wins>=0),
   draws INTEGER NOT NULL DEFAULT 0 CHECK(draws>=0),losses INTEGER NOT NULL DEFAULT 0 CHECK(losses>=0),
   goals_for INTEGER NOT NULL DEFAULT 0 CHECK(goals_for>=0),goals_against INTEGER NOT NULL DEFAULT 0 CHECK(goals_against>=0),
   PRIMARY KEY(league_id,team_id),
   FOREIGN KEY(guild_id,league_id) REFERENCES guild_team_leagues(guild_id,league_id) ON DELETE CASCADE,
   FOREIGN KEY(guild_id,team_id) REFERENCES guild_teams(guild_id,team_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS guild_team_fixtures(
   fixture_id UUID PRIMARY KEY,guild_id TEXT NOT NULL,league_id UUID NOT NULL,
   round_number INTEGER NOT NULL CHECK(round_number>0),home_team_id UUID NOT NULL,away_team_id UUID NOT NULL,
   scheduled_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','awaiting_confirmation','disputed','completed','cancelled')),
   home_score INTEGER CHECK(home_score IS NULL OR home_score BETWEEN 0 AND 99),
   away_score INTEGER CHECK(away_score IS NULL OR away_score BETWEEN 0 AND 99),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ,
   CHECK(home_team_id<>away_team_id),
   FOREIGN KEY(guild_id,league_id) REFERENCES guild_team_leagues(guild_id,league_id) ON DELETE CASCADE,
   FOREIGN KEY(guild_id,home_team_id) REFERENCES guild_teams(guild_id,team_id),
   FOREIGN KEY(guild_id,away_team_id) REFERENCES guild_teams(guild_id,team_id),
   UNIQUE(league_id,round_number,home_team_id,away_team_id)
  );
  CREATE TABLE IF NOT EXISTS guild_team_fixture_reports(
   fixture_id UUID NOT NULL REFERENCES guild_team_fixtures(fixture_id) ON DELETE CASCADE,
   team_id UUID NOT NULL,reported_by TEXT NOT NULL,
   own_score INTEGER NOT NULL CHECK(own_score BETWEEN 0 AND 99),
   opponent_score INTEGER NOT NULL CHECK(opponent_score BETWEEN 0 AND 99),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(fixture_id,team_id)
  );
  ALTER TABLE guild_event_participants ADD COLUMN IF NOT EXISTS team_id UUID;
  DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guild_event_participants_team_id_fk') THEN
    ALTER TABLE guild_event_participants ADD CONSTRAINT guild_event_participants_team_id_fk
     FOREIGN KEY(guild_id,team_id) REFERENCES guild_teams(guild_id,team_id) ON DELETE RESTRICT;
   END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS guild_event_participants_team_id_idx ON guild_event_participants(event_id,team_id,user_id);
  CREATE INDEX IF NOT EXISTS guild_team_league_table_idx ON guild_team_league_entries(league_id,points DESC,wins DESC,goals_for DESC);
  CREATE INDEX IF NOT EXISTS guild_team_fixtures_schedule_idx ON guild_team_fixtures(league_id,scheduled_at,round_number);
 `);
}

export async function listGuildTeams(db,guildId){
 if(!DISCORD_ID.test(String(guildId||'')))throw new Error('TEAM_GUILD_INVALID');
 const result=await db.query('SELECT t.team_id,t.team_name,t.captain_id,COUNT(m.user_id)::int AS member_count FROM guild_teams t LEFT JOIN guild_team_members m ON m.guild_id=t.guild_id AND m.team_id=t.team_id WHERE t.guild_id=$1 GROUP BY t.team_id,t.team_name,t.captain_id ORDER BY t.team_name LIMIT 50',[guildId]);
 return result.rows;
}

export async function createGuildTeam(db,{guildId,captainId,name}){
 if(!validIds(guildId,captainId))throw new Error('TEAM_PLAYER_INVALID');
 const teamName=safeName(name),teamId=randomUUID(),client=await db.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT team_id FROM guild_team_members WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',[guildId,captainId]);
  if(existing.rowCount){await client.query('ROLLBACK');return{status:'already_in_team'};}
  const created=await client.query('INSERT INTO guild_teams(team_id,guild_id,team_name,captain_id) VALUES($1,$2,$3,$4) RETURNING team_id,team_name,captain_id',[teamId,guildId,teamName,captainId]);
  await client.query("INSERT INTO guild_team_members(guild_id,team_id,user_id,role) VALUES($1,$2,$3,'captain')",[guildId,teamId,captainId]);
  await client.query('COMMIT');return{status:'created',team:created.rows[0]};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error?.code==='23505')return{status:'name_taken'};throw error;}finally{client.release();}
}

export async function joinGuildTeam(db,{guildId,userId,teamId}){
 if(!validIds(guildId,userId)||!UUID.test(String(teamId||'')))throw new Error('TEAM_JOIN_INPUT_INVALID');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const team=await client.query('SELECT team_id FROM guild_teams WHERE guild_id=$1 AND team_id=$2 FOR UPDATE',[guildId,teamId]);
  if(!team.rowCount){await client.query('ROLLBACK');return{status:'not_found'};}
  const current=await client.query('SELECT team_id FROM guild_team_members WHERE guild_id=$1 AND user_id=$2',[guildId,userId]);
  if(current.rowCount){await client.query('ROLLBACK');return{status:current.rows[0].team_id===teamId?'already_joined':'already_in_team'};}
  const count=await client.query('SELECT COUNT(*)::int AS count FROM guild_team_members WHERE team_id=$1',[teamId]);
  if(Number(count.rows[0]?.count||0)>=10){await client.query('ROLLBACK');return{status:'team_full'};}
  await client.query("INSERT INTO guild_team_members(guild_id,team_id,user_id,role) VALUES($1,$2,$3,'member')",[guildId,teamId,userId]);
  await client.query('COMMIT');return{status:'joined'};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error?.code==='23505')return{status:'already_in_team'};throw error;}finally{client.release();}
}

export async function createGuildTeamLeague(db,{guildId,creatorId,name,startsAt,endsAt}){
 if(!validIds(guildId,creatorId))throw new Error('LEAGUE_CREATOR_INVALID');
 const seasonName=String(name||'').trim();
 const start=new Date(startsAt),end=new Date(endsAt);
 if(seasonName.length<3||seasonName.length>80||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('LEAGUE_INPUT_INVALID');
 const result=await db.query("INSERT INTO guild_team_leagues(league_id,guild_id,season_name,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING league_id,season_name,starts_at,ends_at,status",[randomUUID(),guildId,seasonName,start.toISOString(),end.toISOString(),creatorId]);
 return result.rows[0];
}

export async function registerGuildTeamForLeague(db,{guildId,teamId,leagueId,actorId}){
 if(!validIds(guildId,actorId)||!UUID.test(String(teamId||''))||!UUID.test(String(leagueId||'')))throw new Error('LEAGUE_ENTRY_INPUT_INVALID');
 const result=await db.query(
  "INSERT INTO guild_team_league_entries(guild_id,league_id,team_id) SELECT $1,l.league_id,t.team_id FROM guild_team_leagues l JOIN guild_teams t ON t.guild_id=l.guild_id AND t.team_id=$2 JOIN guild_team_members m ON m.guild_id=t.guild_id AND m.team_id=t.team_id AND m.user_id=$4 AND m.role='captain' WHERE l.guild_id=$1 AND l.league_id=$3 AND l.status='registration' ON CONFLICT(league_id,team_id) DO NOTHING RETURNING league_id,team_id",
  [guildId,teamId,leagueId,actorId]
 );
 return result.rowCount?{status:'registered'}:{status:'not_eligible'};
}

export function buildRoundRobinFixtures(teamIds,{startsAt,intervalDays=7}={}){
 const ids=[...new Set((teamIds||[]).map(String))];
 if(ids.length<2||ids.length>16||ids.some(id=>!UUID.test(id)))throw new Error('LEAGUE_TEAM_COUNT_INVALID');
 const start=new Date(startsAt);
 if(!Number.isFinite(start.getTime())||!Number.isInteger(intervalDays)||intervalDays<1||intervalDays>30)throw new Error('LEAGUE_SCHEDULE_INVALID');
 if(ids.length%2)ids.push(null);
 const rotation=[...ids],rounds=[];
 for(let round=0;round<rotation.length-1;round++){
  const matches=[];
  for(let i=0;i<rotation.length/2;i++){
   const home=rotation[i],away=rotation[rotation.length-1-i];
   if(home&&away)matches.push({roundNumber:round+1,homeTeamId:round%2?away:home,awayTeamId:round%2?home:away,scheduledAt:new Date(start.getTime()+round*intervalDays*86400000).toISOString()});
  }
  rounds.push(...matches);
  const fixed=rotation[0],rest=rotation.slice(1);rest.unshift(rest.pop());rotation.splice(0,rotation.length,fixed,...rest);
 }
 return rounds;
}

export async function scheduleGuildTeamLeague(db,{guildId,leagueId,actorId,startsAt,intervalDays=7}){
 if(!validIds(guildId,actorId)||!UUID.test(String(leagueId||'')))throw new Error('LEAGUE_SCHEDULE_INPUT_INVALID');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const league=await client.query("SELECT league_id,status,created_by FROM guild_team_leagues WHERE guild_id=$1 AND league_id=$2 FOR UPDATE",[guildId,leagueId]);
  if(!league.rowCount||league.rows[0].created_by!==actorId){await client.query('ROLLBACK');return{status:'not_authorized'};}
  if(league.rows[0].status!=='registration'){await client.query('ROLLBACK');return{status:'already_scheduled'};}
  const entries=await client.query('SELECT team_id FROM guild_team_league_entries WHERE guild_id=$1 AND league_id=$2 ORDER BY team_id',[guildId,leagueId]);
  const fixtures=buildRoundRobinFixtures(entries.rows.map(x=>x.team_id),{startsAt,intervalDays});
  for(const fixture of fixtures)await client.query("INSERT INTO guild_team_fixtures(fixture_id,guild_id,league_id,round_number,home_team_id,away_team_id,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),guildId,leagueId,fixture.roundNumber,fixture.homeTeamId,fixture.awayTeamId,fixture.scheduledAt]);
  await client.query("UPDATE guild_team_leagues SET status='scheduled' WHERE guild_id=$1 AND league_id=$2",[guildId,leagueId]);
  await client.query('COMMIT');return{status:'scheduled',fixtureCount:fixtures.length,fixtures};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function reportGuildTeamFixtureScore(db,{guildId,fixtureId,teamId,actorId,ownScore,opponentScore}){
 if(!validIds(guildId,actorId)||!UUID.test(String(fixtureId||''))||!UUID.test(String(teamId||'')))throw new Error('FIXTURE_REPORT_INPUT_INVALID');
 const own=Number(ownScore),opponent=Number(opponentScore);
 if(!Number.isInteger(own)||!Number.isInteger(opponent)||own<0||opponent<0||own>99||opponent>99)throw new Error('FIXTURE_SCORE_INVALID');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const fixture=await client.query('SELECT fixture_id,league_id,home_team_id,away_team_id,status FROM guild_team_fixtures WHERE guild_id=$1 AND fixture_id=$2 FOR UPDATE',[guildId,fixtureId]);
  if(!fixture.rowCount){await client.query('ROLLBACK');return{status:'not_found'};}
  const row=fixture.rows[0];
  if(row.status==='completed'||row.status==='cancelled'){await client.query('ROLLBACK');return{status:'unavailable'};}
  if(![row.home_team_id,row.away_team_id].includes(teamId)){await client.query('ROLLBACK');return{status:'not_participant'};}
  const captain=await client.query("SELECT 1 FROM guild_team_members WHERE guild_id=$1 AND team_id=$2 AND user_id=$3 AND role='captain'",[guildId,teamId,actorId]);
  if(!captain.rowCount){await client.query('ROLLBACK');return{status:'captain_required'};}
  await client.query('INSERT INTO guild_team_fixture_reports(fixture_id,team_id,reported_by,own_score,opponent_score) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fixture_id,team_id) DO UPDATE SET reported_by=EXCLUDED.reported_by,own_score=EXCLUDED.own_score,opponent_score=EXCLUDED.opponent_score,created_at=NOW()',[fixtureId,teamId,actorId,own,opponent]);
  const reports=await client.query('SELECT team_id,own_score,opponent_score FROM guild_team_fixture_reports WHERE fixture_id=$1',[fixtureId]);
  if(reports.rowCount<2){await client.query("UPDATE guild_team_fixtures SET status='awaiting_confirmation' WHERE fixture_id=$1",[fixtureId]);await client.query('COMMIT');return{status:'awaiting_confirmation'};}
  const home=reports.rows.find(x=>x.team_id===row.home_team_id),away=reports.rows.find(x=>x.team_id===row.away_team_id);
  if(!home||!away||home.own_score!==away.opponent_score||home.opponent_score!==away.own_score){
   await client.query("UPDATE guild_team_fixtures SET status='disputed' WHERE fixture_id=$1",[fixtureId]);await client.query('COMMIT');return{status:'disputed'};
  }
  const homeScore=home.own_score,awayScore=away.own_score;
  await client.query("UPDATE guild_team_fixtures SET status='completed',home_score=$2,away_score=$3,completed_at=NOW() WHERE fixture_id=$1",[fixtureId,homeScore,awayScore]);
  const homePoints=homeScore>awayScore?3:homeScore===awayScore?1:0,awayPoints=awayScore>homeScore?3:awayScore===homeScore?1:0;
  await client.query('UPDATE guild_team_league_entries SET points=points+$3,wins=wins+$4,draws=draws+$5,losses=losses+$6,goals_for=goals_for+$7,goals_against=goals_against+$8 WHERE league_id=$1 AND team_id=$2',[row.league_id,row.home_team_id,homePoints,homePoints===3?1:0,homePoints===1?1:0,homePoints===0?1:0,homeScore,awayScore]);
  await client.query('UPDATE guild_team_league_entries SET points=points+$3,wins=wins+$4,draws=draws+$5,losses=losses+$6,goals_for=goals_for+$7,goals_against=goals_against+$8 WHERE league_id=$1 AND team_id=$2',[row.league_id,row.away_team_id,awayPoints,awayPoints===3?1:0,awayPoints===1?1:0,awayPoints===0?1:0,awayScore,homeScore]);
  const remaining=await client.query("SELECT 1 FROM guild_team_fixtures WHERE league_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1",[row.league_id]);
  if(!remaining.rowCount)await client.query("UPDATE guild_team_leagues SET status='completed' WHERE league_id=$1",[row.league_id]);
  await client.query('COMMIT');return{status:'completed',homeScore,awayScore};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function getGuildTeamLeagueDashboard(db,guildId,leagueId){
 if(!DISCORD_ID.test(String(guildId||''))||!UUID.test(String(leagueId||'')))throw new Error('LEAGUE_DASHBOARD_INPUT_INVALID');
 const [league,table,fixtures]=await Promise.all([
  db.query('SELECT league_id,season_name,starts_at,ends_at,status FROM guild_team_leagues WHERE guild_id=$1 AND league_id=$2',[guildId,leagueId]),
  db.query('SELECT t.team_id,t.team_name,e.points,e.wins,e.draws,e.losses,e.goals_for,e.goals_against,(e.goals_for-e.goals_against) AS goal_difference FROM guild_team_league_entries e JOIN guild_teams t ON t.guild_id=e.guild_id AND t.team_id=e.team_id WHERE e.guild_id=$1 AND e.league_id=$2 ORDER BY e.points DESC,(e.goals_for-e.goals_against) DESC,e.goals_for DESC,t.team_name',[guildId,leagueId]),
  db.query('SELECT f.fixture_id,f.round_number,f.scheduled_at,f.status,f.home_score,f.away_score,h.team_name AS home_team,a.team_name AS away_team FROM guild_team_fixtures f JOIN guild_teams h ON h.guild_id=f.guild_id AND h.team_id=f.home_team_id JOIN guild_teams a ON a.guild_id=f.guild_id AND a.team_id=f.away_team_id WHERE f.guild_id=$1 AND f.league_id=$2 ORDER BY f.round_number,f.scheduled_at',[guildId,leagueId])
 ]);
 return league.rows[0]?{league:league.rows[0],table:table.rows,fixtures:fixtures.rows}:null;
}
