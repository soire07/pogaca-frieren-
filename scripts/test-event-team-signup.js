import test from 'node:test';
import assert from 'node:assert/strict';
import { joinGuildEvent } from '../adventurer-platform.js';

function fixture({eventType='boss_raid',teamCount=0,existing=false}={}) {
 const calls=[];
 const db={
  async query(sql){calls.push(sql);return{rows:[],rowCount:1};},
  async connect(){return{
   async query(sql,params){
    calls.push(sql);
    if(sql.includes('SELECT event_id,event_type,max_participants'))return{rows:[{event_id:'123e4567-e89b-42d3-a456-426614174000',event_type:eventType,max_participants:20}],rowCount:1};
    if(sql.includes('SELECT team_key FROM guild_event_participants'))return{rows:existing?[{team_key:'A'}]:[],rowCount:existing?1:0};
    if(sql.includes('SELECT COUNT(*)::int AS count FROM guild_event_participants WHERE event_id=$1 AND team_key=$2'))return{rows:[{count:teamCount}],rowCount:1};
    if(sql.includes('SELECT COUNT(*)::int AS count FROM guild_event_participants WHERE event_id=$1'))return{rows:[{count:teamCount}],rowCount:1};
    if(sql.includes('INSERT INTO guild_event_participants'))return{rows:[{user_id:'123456789012345678',team_key:params[3]}],rowCount:1};
    return{rows:[],rowCount:1};
   },
   release(){}
  };}
 };
 return{db,calls};
}
const input={guildId:'1539562273197260860',userId:'123456789012345678',eventId:'123e4567-e89b-42d3-a456-426614174000'};

test('boss raid signup requires an explicit A/B team',async()=>{
 const {db}=fixture();
 assert.equal((await joinGuildEvent(db,input)).status,'team_required');
});
test('boss raid signup assigns the selected team and persists the participation record',async()=>{
 const {db,calls}=fixture();
 const result=await joinGuildEvent(db,{...input,teamKey:'B'});
 assert.deepEqual(result,{status:'joined',teamKey:'B'});
 assert.ok(calls.some(sql=>sql.includes('team_key) VALUES($1,$2,$3,$4)')));
});
test('boss raid signup prevents a sixth player from joining a full team',async()=>{
 const {db}=fixture({teamCount:5});
 assert.equal((await joinGuildEvent(db,{...input,teamKey:'A'})).status,'team_full');
});
test('non-raid events remain compatible with the existing no-team registration flow',async()=>{
 const {db}=fixture({eventType:'community'});
 assert.equal((await joinGuildEvent(db,input)).status,'joined');
});
