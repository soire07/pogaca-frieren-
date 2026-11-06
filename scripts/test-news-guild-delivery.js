import test from 'node:test';
import assert from 'node:assert/strict';
import { setNewsGuildChannel, disableNewsGuildChannel, claimDueAnimeNewsGuildDigests, markAnimeNewsGuildDigestSent, releaseAnimeNewsGuildDigestClaim } from '../news-birds.js';

const guildId='1539562273197260860';
const channelId='123456789012345678';

test('guild news channel settings validate IDs and upsert without user IDs',async()=>{
 let call;
 const db={async query(sql,params){call={sql,params};return{rowCount:1,rows:[]};}};
 const saved=await setNewsGuildChannel(db,{guildId,channelId});
 assert.equal(saved.status,'saved');
 assert.match(call.sql,/ON CONFLICT\(guild_id\)/);
 assert.deepEqual(call.params,[guildId,channelId]);
 await assert.rejects(setNewsGuildChannel(db,{guildId,channelId:'bad'}),/NEWS_BIRD_CHANNEL_INVALID/);
});

test('guild news delivery can be disabled without changing player notification preferences',async()=>{
 let call;
 const db={async query(sql,params){call={sql,params};return{rowCount:1,rows:[{guild_id:guildId}]};}};
 const result=await disableNewsGuildChannel(db,guildId);
 assert.equal(result.status,'disabled');
 assert.match(call.sql,/frieren_news_guild_settings/);
 assert.deepEqual(call.params,[guildId]);
});

test('guild digest claims are per-server, bounded and safe against concurrent workers',async()=>{
 let call;
 const db={async query(sql,params){call={sql,params};return{rowCount:0,rows:[]};}};
 await claimDueAnimeNewsGuildDigests(db,25);
 assert.match(call.sql,/FOR UPDATE OF s SKIP LOCKED/);
 assert.match(call.sql,/frieren_news_guild_digest_state/);
 assert.match(call.sql,/frieren_news_guild_settings/);
 assert.deepEqual(call.params,[25]);
});

test('guild digest claims enforce a bounded batch size',async()=>{
 let params;
 const db={async query(_sql,values){params=values;return{rows:[]};}};
 await claimDueAnimeNewsGuildDigests(db,5000);
 assert.deepEqual(params,[500]);
});

test('guild digest sent and retry states are isolated by guild',async()=>{
 const calls=[];
 const db={async query(sql,params){calls.push({sql,params});return{rowCount:1,rows:[{guild_id:guildId}]};}};
 assert.equal(await markAnimeNewsGuildDigestSent(db,guildId),true);
 assert.equal(await releaseAnimeNewsGuildDigestClaim(db,guildId),true);
 assert.match(calls[0].sql,/last_sent_at=NOW\(\),claimed_until=NULL/);
 assert.match(calls[1].sql,/claimed_until=NULL/);
 assert.deepEqual(calls.map(call=>call.params),[[guildId],[guildId]]);
});
