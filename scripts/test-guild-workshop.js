import test from 'node:test';
import assert from 'node:assert/strict';
import buyuCommand from '../buyu.js';
import { normalizeGuildEmbedTemplate, normalizeGuildCustomCommand, normalizeGuildSpellAutomation, saveGuildEmbedTemplate, saveGuildCustomCommand, saveGuildSpellAutomation } from '../guild-workshop.js';

test('visual embed templates validate title, description, color and bounded fields',()=>{
 const result=normalizeGuildEmbedTemplate({name:'Raid Banner',title:'Boss Raid',description:'The party is ready.',color:'#9b8cff',footer:'Frieren'});
 assert.equal(result.color,0x9b8cff);
 assert.equal(result.fields.length,0);
 assert.throws(()=>normalizeGuildEmbedTemplate({name:'x',title:'',description:'body',color:'#ffffff'}),/GUILD_EMBED_TITLE_INVALID/);
 assert.throws(()=>normalizeGuildEmbedTemplate({name:'x',title:'Title',description:'x'.repeat(4001),color:'#ffffff'}),/GUILD_EMBED_DESCRIPTION_INVALID/);
});

test('custom commands and spells use a safe declarative schema, not executable code',()=>{
 const command=normalizeGuildCustomCommand({triggerName:'hello',kind:'command',responseText:'Welcome to the guild.'});
 assert.equal(command.triggerName,'hello');
 assert.equal(command.kind,'command');
 const spell=normalizeGuildCustomCommand({triggerName:'frost_bloom',kind:'spell',responseText:'A cold wave surrounds the party.',element:'ice',manaCost:20,power:75});
 assert.equal(spell.element,'ice');
 assert.equal(spell.power,75);
 assert.throws(()=>normalizeGuildCustomCommand({triggerName:'bad name',kind:'command',responseText:'x'}),/GUILD_CUSTOM_COMMAND_NAME_INVALID/);
 assert.throws(()=>normalizeGuildCustomCommand({triggerName:'hack',kind:'spell',responseText:'x',element:'unknown',manaCost:1,power:1}),/GUILD_CUSTOM_SPELL_ELEMENT_INVALID/);
});

test('spell automations accept only allowlisted triggers and channels',()=>{
 const rule=normalizeGuildSpellAutomation({name:'Raid announce',triggerKey:'event_reminder',channelId:'1539562273197260860',message:'The raid begins soon.',cooldownSeconds:120});
 assert.equal(rule.triggerKey,'event_reminder');
 assert.equal(rule.cooldownSeconds,120);
 assert.throws(()=>normalizeGuildSpellAutomation({name:'Unsafe',triggerKey:'shell_exec',channelId:'1539562273197260860',message:'run'}),/GUILD_AUTOMATION_TRIGGER_INVALID/);
});

test('embed, command and automation writes are guild-scoped and parameterized',async()=>{
 const calls=[];
 const db={async query(sql,params){calls.push({sql,params});return{rows:[{template_id:'template-1',command_id:'command-1',automation_id:'automation-1'}],rowCount:1};}};
 await saveGuildEmbedTemplate(db,{guildId:'1539562273197260860',creatorId:'123456789012345678',template:{name:'Raid',title:'Raid',description:'Ready',color:'#ffffff'}});
 await saveGuildCustomCommand(db,{guildId:'1539562273197260860',creatorId:'123456789012345678',command:{triggerName:'hello',kind:'command',responseText:'Welcome.'}});
 await saveGuildSpellAutomation(db,{guildId:'1539562273197260860',creatorId:'123456789012345678',rule:{name:'Raid notice',triggerKey:'event_reminder',channelId:'1539562273197260860',message:'Ready.'}});
 assert.equal(calls.length,3);
 assert.ok(calls.every(call=>call.sql.includes('ON CONFLICT')));
 assert.ok(calls.every(call=>call.params.includes('1539562273197260860')));
});

test('existing buyu command can execute saved guild commands without adding a new slash command',()=>{
 const command=buyuCommand.data.toJSON();
 assert.equal(command.name,'buyu');
 assert.ok(command.options.some(option=>option.name==='ad'&&option.required===false));
});


test('spell automation rejects cross-guild channels and missing send permissions before sending',async()=>{
 const rule={automation_id:'automation-1',channel_id:'223456789012345678',message:'{{player}}',template_id:null};
 const db={async query(sql){assert.ok(sql.includes('WITH due AS'));return{rows:[rule],rowCount:1};}};
 let sends=0;
 const client={user:{id:'123456789012345678'},channels:{async fetch(){return{guildId:'999999999999999999',isTextBased:()=>true,async send(){sends++;}}};}};
 const {runGuildSpellAutomations}=await import('../guild-workshop.js');
 const result=await runGuildSpellAutomations(db,client,'1539562273197260860','event_reminder',{player:'Fern'});
 assert.deepEqual(result,{sent:0,skipped:1});
 assert.equal(sends,0);
});

test('spell automation respects Discord send and embed permissions',async()=>{
 const rule={automation_id:'automation-2',channel_id:'223456789012345678',message:'Ready',template_id:null};
 const db={async query(){return{rows:[rule],rowCount:1};}};
 let sends=0;
 const client={user:{id:'123456789012345678'},channels:{async fetch(){return{guildId:'1539562273197260860',isTextBased:()=>true,permissionsFor:()=>({has:permission=>permission==='SendMessages'}),async send(){sends++;}}};}};
 const {runGuildSpellAutomations}=await import('../guild-workshop.js');
 const result=await runGuildSpellAutomations(db,client,'1539562273197260860','event_reminder');
 assert.deepEqual(result,{sent:1,skipped:0});
 assert.equal(sends,1);
});


test('spell automation claims are leased and cooldown starts only after a successful Discord send',async()=>{
 const calls=[];
 const db={async query(sql){calls.push(sql);if(sql.includes('WITH due AS'))return{rows:[{automation_id:'automation-retry',channel_id:'223456789012345678',message:'Ready',template_id:null}],rowCount:1};return{rows:[],rowCount:1};}};
 const client={user:{id:'123456789012345678'},channels:{async fetch(){return{guildId:'1539562273197260860',isTextBased:()=>true,async send(){return{id:'message-1'};}};}}};
 const {runGuildSpellAutomations}=await import('../guild-workshop.js');
 assert.deepEqual(await runGuildSpellAutomations(db,client,'1539562273197260860','event_reminder'),{sent:1,skipped:0});
 assert.match(calls[0],/claimed_at<=NOW\(\)-INTERVAL '10 minutes'/);
 assert.ok(calls.some(sql=>sql.includes('last_triggered_at=NOW(),claimed_at=NULL')));
});

test('failed spell automation delivery releases its claim for retry without consuming cooldown',async()=>{
 const calls=[];
 const db={async query(sql){calls.push(sql);if(sql.includes('WITH due AS'))return{rows:[{automation_id:'automation-failed',channel_id:'223456789012345678',message:'Ready',template_id:null}],rowCount:1};return{rows:[],rowCount:1};}};
 const client={user:{id:'123456789012345678'},channels:{async fetch(){throw new Error('temporary Discord outage');}}};
 const {runGuildSpellAutomations}=await import('../guild-workshop.js');
 assert.deepEqual(await runGuildSpellAutomations(db,client,'1539562273197260860','event_reminder'),{sent:0,skipped:1});
 assert.ok(calls.some(sql=>sql.includes('SET claimed_at=NULL')));
 assert.ok(!calls.some(sql=>sql.includes('last_triggered_at=NOW(),claimed_at=NULL')));
});
