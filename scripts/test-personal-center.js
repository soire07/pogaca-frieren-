import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePersonalCenterSchema,updatePersonalProfile,createPlannerEntry,sendDirectMessage,reportPlayer,addGuestbookEntry,getPersonalProgressReport} from '../personal-center.js';

const guild='1539562273197260860',a='155000000000000001',b='155000000000000002';
test('personal center schema creates isolated guild-scoped tables and indexes',async()=>{
 const sql=[];await ensurePersonalCenterSchema({query:async q=>{sql.push(q);return{rows:[],rowCount:0};}});
 for(const table of ['player_personal_profiles','player_direct_messages','player_guestbook_entries','player_reports','player_planner_entries'])assert.ok(sql.some(q=>q.includes('CREATE TABLE IF NOT EXISTS '+table)),table);
 assert.ok(sql.every(q=>!q.includes('DROP TABLE')&&!q.includes('TRUNCATE')));
});
test('profile rejects unsafe theme, invalid identity and oversized biography',async()=>{
 await assert.rejects(updatePersonalProfile({}, {guildId:guild,userId:a,bio:'x'.repeat(281)}),/PERSONAL_PROFILE_INVALID/);
 await assert.rejects(updatePersonalProfile({}, {guildId:guild,userId:a,theme:'remote-url'}),/PERSONAL_PROFILE_INVALID/);
 await assert.rejects(updatePersonalProfile({}, {guildId:'invalid',userId:a}),/PERSONAL_CENTER_ID_INVALID/);
});
test('planner rejects unsupported kind, oversized content and malformed identity before database writes',async()=>{
 let writes=0;const db={query:async()=>{writes++;return{rows:[],rowCount:0};}};
 await assert.rejects(createPlannerEntry(db,{guildId:guild,userId:a,kind:'command',title:'X'}),/PLANNER_ENTRY_INVALID/);
 await assert.rejects(createPlannerEntry(db,{guildId:guild,userId:a,kind:'task',title:'x'.repeat(101)}),/PLANNER_ENTRY_INVALID/);
 await assert.rejects(createPlannerEntry(db,{guildId:guild,userId:a,kind:'task',title:'ok',dueAt:'invalid'}),/PLANNER_ENTRY_INVALID/);
 assert.equal(writes,0);
});
test('message and report input validation runs before any database access',async()=>{
 let writes=0;const db={query:async()=>{writes++;return{rows:[],rowCount:0};}};
 await assert.rejects(sendDirectMessage(db,{guildId:guild,senderId:a,recipientId:a,body:'hi'}),/PERSONAL_CENTER_SELF_ACTION/);
 await assert.rejects(sendDirectMessage(db,{guildId:guild,senderId:a,recipientId:b,body:'x'.repeat(2001)}),/PERSONAL_MESSAGE_INVALID/);
 await assert.rejects(reportPlayer(db,{guildId:guild,reporterId:a,targetId:b,reason:'unknown'}),/PLAYER_REPORT_INVALID/);
 await assert.rejects(addGuestbookEntry(db,{guildId:guild,ownerId:a,authorId:b,message:'x'.repeat(501)}),/GUESTBOOK_MESSAGE_INVALID/);
 assert.equal(writes,0);
});
test('weekly and monthly reports reject arbitrary period values before querying',async()=>{
 let writes=0;await assert.rejects(getPersonalProgressReport({query:async()=>{writes++;}}, {guildId:guild,userId:a,period:'all-time'}),/PERSONAL_REPORT_PERIOD_INVALID/);assert.equal(writes,0);
});
