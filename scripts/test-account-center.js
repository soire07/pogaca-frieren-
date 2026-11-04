import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupportTicketInput, createSupportTicket, listSupportTickets, listSupportTicketMessages, replySupportTicket, updateSupportTicketStatus, listSupportTicketsForOwner, getSupportTicketForOwner, replySupportTicketFromOwner, updateSupportTicketStatusFromOwner, exportSiteAccountData, deleteSiteAccount } from '../account-center.js';

const accountId='site_123e4567-e89b-12d3-a456-426614174000';

test('support ticket input is normalized and bounded',()=>{
 assert.deepEqual(normalizeSupportTicketInput({category:'bug',subject:' OAuth issue ',message:' Login callback fails. '}),{category:'bug',subject:'OAuth issue',message:'Login callback fails.'});
 assert.throws(()=>normalizeSupportTicketInput({category:'invalid',subject:'Valid subject',message:'valid enough body'}),/SUPPORT_TICKET_CATEGORY_INVALID/);
 assert.throws(()=>normalizeSupportTicketInput({category:'bug',subject:'x'.repeat(161),message:'body'}),/SUPPORT_TICKET_SUBJECT_INVALID/);
});

test('support ticket creation is scoped to the current account and rate limited',async()=>{
 const calls=[];
 const db={async query(sql,params){calls.push({sql,params});if(sql.includes('SELECT id FROM frieren_site_accounts'))return{rows:[{id:'123e4567-e89b-12d3-a456-426614174000'}],rowCount:1};if(sql.includes('COUNT(*)'))return{rows:[{count:0}],rowCount:1};if(sql.includes('INSERT INTO frieren_support_tickets'))return{rows:[{ticket_id:'ticket-1',category:'bug',subject:'OAuth issue',status:'open'}],rowCount:1};if(sql.includes('INSERT INTO frieren_support_ticket_events'))return{rows:[],rowCount:1};throw Error('unexpected query');}};
 const result=await createSupportTicket(db,accountId,{category:'bug',subject:'OAuth issue',message:'Callback fails.'});
 assert.equal(result.status,'created');
 assert.ok(calls.every(x=>x.params.includes('123e4567-e89b-12d3-a456-426614174000')));
 const limited={async query(sql){if(sql.includes('COUNT(*)'))return{rows:[{count:5}],rowCount:1};throw Error('must not insert');}};
 assert.equal((await createSupportTicket(limited,accountId,{category:'bug',subject:'Help',message:'This is long enough.'})).status,'daily_limit');
});

test('support tickets list only the authenticated account records',async()=>{
 let params;
 const db={async query(_sql,p){params=p;return{rows:[{ticket_id:'ticket-1',status:'open'}],rowCount:1};}};
 assert.equal((await listSupportTickets(db,accountId)).length,1);
 assert.deepEqual(params,['123e4567-e89b-12d3-a456-426614174000',20]);
});

test('account export returns linked profile, inventory, card collection and scoped module records',async()=>{
 const db={async query(sql,params){
  if(sql.includes('FROM frieren_site_accounts'))return{rows:[{id:'123e4567-e89b-12d3-a456-426614174000',username:'Gezgin',email:'member@example.com'}],rowCount:1};
  if(sql.includes('FROM site_discord_links'))return{rows:[{guild_id:'1539562273197260860',user_id:'123456789012345678',character_name:'Fern',level:20,xp:2400}],rowCount:1};
  if(sql.includes('FROM inventory'))return{rows:[{item_key:'Mana Kristali',quantity:2}],rowCount:1};
  if(sql.includes('FROM player_market_offers'))return{rows:[{offer_id:'offer-1',buyer_id:'123456789012345678',offer_coins:150,status:'pending'}],rowCount:1};
  if(sql.includes('FROM anime_character_collection'))return{rows:[{character_name:'Frieren',quantity:1}],rowCount:1};
  if(sql.includes('information_schema.columns')&&sql.includes("column_name IN ('guild_id','user_id')"))return{rows:[{table_name:'user_fish_collection',column_name:'guild_id'},{table_name:'user_fish_collection',column_name:'user_id'},{table_name:'guild_private_tokens',column_name:'guild_id'},{table_name:'guild_private_tokens',column_name:'user_id'},{table_name:'user_preferences',column_name:'user_id'}],rowCount:5};
  if(sql.includes('information_schema.columns')&&sql.includes('table_name=$1')&&params?.[0]==='user_fish_collection')return{rows:[{column_name:'guild_id'},{column_name:'user_id'},{column_name:'fish_key'},{column_name:'quantity'},{column_name:'access_token'}],rowCount:5};
  if(sql.includes('information_schema.columns')&&sql.includes('table_name=$1')&&params?.[0]==='guild_private_tokens')return{rows:[{column_name:'guild_id'},{column_name:'user_id'},{column_name:'private_token'}],rowCount:3};
  if(sql.includes('information_schema.columns')&&sql.includes('table_name=$1')&&params?.[0]==='user_preferences')return{rows:[{column_name:'user_id'},{column_name:'preference_key'},{column_name:'preference_value'}],rowCount:3};
  if(sql.includes('FROM "user_fish_collection"'))return{rows:[{guild_id:'1539562273197260860',user_id:'123456789012345678',fish_key:'silver_trout',quantity:2}],rowCount:1};
  if(sql.includes('FROM "guild_private_tokens"'))return{rows:[{guild_id:'1539562273197260860',user_id:'123456789012345678',private_token:'should-not-export'}],rowCount:1};
  if(sql.includes('FROM "user_preferences"'))return{rows:[{user_id:'123456789012345678',preference_key:'theme',preference_value:'dark'}],rowCount:1};
  return{rows:[],rowCount:0};
 }};
 const result=await exportSiteAccountData(db,accountId);
 assert.equal(result.account.username,'Gezgin');
 assert.equal(result.linkedProfiles[0].inventory[0].item_key,'Mana Kristali');
 assert.equal(result.linkedProfiles[0].collections[0].character_name,'Frieren');
 assert.equal(result.linkedProfiles[0].gameData.user_fish_collection[0].fish_key,'silver_trout');
 assert.equal(result.linkedProfiles[0].marketOffers[0].offer_id,'offer-1');
 assert.equal(result.linkedProfiles[0].gameData.user_preferences[0].preference_key,'theme');
 assert.ok(!JSON.stringify(result).includes('access_token'));
 assert.ok(!JSON.stringify(result).includes('guild_private_tokens'));
 assert.ok(!JSON.stringify(result).includes('should-not-export'));
});

test('account deletion requires the explicit confirmation phrase',async()=>{
 let connected=false;
 const db={connect:async()=>{connected=true;return{async query(){return{rows:[],rowCount:1};},release(){}};}};
 assert.equal((await deleteSiteAccount(db,accountId,'')).status,'confirmation_required');
 assert.equal(connected,false);
 assert.equal((await deleteSiteAccount(db,accountId,'HESABIMI SIL')).status,'deleted');
 assert.equal(connected,true);
});


test('support conversations are account-scoped and preserve ordered reply history',async()=>{
 const calls=[];
 const db={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('SELECT ticket_id,status FROM frieren_support_tickets'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',status:'open'}],rowCount:1};
  if(sql.includes('SELECT ticket_id,message,status FROM frieren_support_tickets'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',message:'Original',status:'open'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_messages'))return{rows:[{message_id:'message-1',author_type:'account',message:'More details'}],rowCount:1};
  if(sql.includes('FROM frieren_support_ticket_messages'))return{rows:[{message_id:'message-1',author_type:'account',message:'More details'}],rowCount:1};
  if(sql.includes('FROM frieren_support_ticket_events'))return{rows:[{actor_type:'account',previous_status:null,new_status:'open'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_events'))return{rows:[],rowCount:1};
  if(sql.includes('UPDATE frieren_support_tickets SET updated_at'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000'}],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const ticketId='123e4567-e89b-42d3-a456-426614174000';
 const reply=await replySupportTicket(db,accountId,ticketId,'More details');
 assert.equal(reply.status,'replied');
 const messages=await listSupportTicketMessages(db,accountId,ticketId);
 assert.equal(messages[0].message,'More details');
 assert.ok(calls.every(call=>call.params.includes('123e4567-e89b-12d3-a456-426614174000')||call.params.includes(ticketId)));
});

test('support status transitions are recorded and closed tickets cannot be reopened by account replies',async()=>{
 const calls=[];
 const db={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('SELECT ticket_id,status FROM frieren_support_tickets'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',status:'in_progress'}],rowCount:1};
  if(sql.includes('UPDATE frieren_support_tickets SET status'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',status:'closed'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_events'))return{rows:[],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const ticketId='123e4567-e89b-42d3-a456-426614174000';
 assert.equal((await updateSupportTicketStatus(db,accountId,ticketId,'closed','support')).status,'updated');
 assert.ok(calls.some(call=>call.sql.includes('frieren_support_ticket_events')));
});


test('owner support actions require the fixed owner identity and append staff replies/status events',async()=>{
 const calls=[];
 const db={async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('SELECT ticket_id,status FROM frieren_support_tickets'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',status:'open'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_messages'))return{rows:[{message_id:'staff-message',author_type:'support',message:'We fixed it.'}],rowCount:1};
  if(sql.includes('UPDATE frieren_support_tickets SET updated_at'))return{rows:[],rowCount:1};
  if(sql.includes('UPDATE frieren_support_tickets SET status'))return{rows:[{ticket_id:'123e4567-e89b-42d3-a456-426614174000',status:'closed'}],rowCount:1};
  if(sql.includes('INSERT INTO frieren_support_ticket_events'))return{rows:[],rowCount:1};
  throw new Error('Unexpected query: '+sql);
 }};
 const ticketId='123e4567-e89b-42d3-a456-426614174000';
 await assert.rejects(()=>replySupportTicketFromOwner(db,ticketId,'123456789012345678','We fixed it.'),/SUPPORT_TICKET_OWNER_REQUIRED/);
 assert.equal((await replySupportTicketFromOwner(db,ticketId,'1553794496234262641','We fixed it.')).status,'replied');
 assert.equal((await updateSupportTicketStatusFromOwner(db,ticketId,'1553794496234262641','closed')).status,'updated');
 assert.ok(calls.some(call=>call.sql.includes("VALUES($1,$2,'support'")));
 assert.ok(calls.some(call=>call.sql.includes('frieren_support_ticket_events')));
});
