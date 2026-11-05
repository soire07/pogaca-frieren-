import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnimeNewsRss, setNotificationPreference, getNotificationPreferences, claimDueAnimeNewsDigests, getEventReminderRecipients } from '../news-birds.js';

test('RSS parser extracts bounded safe titles, summaries and HTTPS article links',()=>{
 const xml='<?xml version="1.0"?><rss><channel><item><title><![CDATA[Frieren: New Arc & Cast]]></title><link>https://www.animenewsnetwork.com/news/2026-11-04/test</link><guid>ann-1</guid><pubDate>Wed, 04 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>New <b>anime</b> update &amp; details.</p>]]></description></item></channel></rss>';
 const items=parseAnimeNewsRss(xml);
 assert.equal(items.length,1);
 assert.equal(items[0].title,'Frieren: New Arc & Cast');
 assert.equal(items[0].summary,'New anime update & details.');
 assert.match(items[0].link,/^https:\/\/www\.animenewsnetwork\.com\//);
});

test('RSS parser drops malformed dates, unsafe links and oversized titles',()=>{
 const xml='<rss><item><title>Bad date</title><link>https://www.animenewsnetwork.com/a</link><guid>1</guid><pubDate>not a date</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link><guid>2</guid><pubDate>Wed, 04 Nov 2026 12:00:00 GMT</pubDate></item></rss>';
 assert.deepEqual(parseAnimeNewsRss(xml),[]);
});

test('notification preferences are category-scoped and upserted with explicit booleans',async()=>{
 let captured;
 const db={async query(sql,params){captured={sql,params};return{rows:[{category:'anime_news',enabled:true}],rowCount:1};}};
 const result=await setNotificationPreference(db,{guildId:'1539562273197260860',userId:'123456789012345678',category:'anime_news',enabled:true});
 assert.equal(result.status,'saved');
 assert.match(captured.sql,/ON CONFLICT/);
 assert.deepEqual(captured.params,['1539562273197260860','123456789012345678','anime_news',true]);
 await assert.rejects(setNotificationPreference(db,{guildId:'1539562273197260860',userId:'123456789012345678',category:'arbitrary',enabled:true}),/NEWS_BIRD_CATEGORY_INVALID/);
});

test('notification preference view defaults every supported category to disabled',async()=>{
 const db={async query(){return{rows:[{category:'anime_news',enabled:true}],rowCount:1};}};
 const result=await getNotificationPreferences(db,'1539562273197260860','123456789012345678');
 assert.equal(result.anime_news,true);
 assert.equal(result.event_reminders,true);
 assert.equal(result.boss_raid_reminders,true);
});

test('news digest claims use row locks and a bounded retry lease',async()=>{
 let query;
 const db={async query(sql,params){query={sql,params};return{rows:[],rowCount:0};}};
 await claimDueAnimeNewsDigests(db,12);
 assert.match(query.sql,/FOR UPDATE OF p SKIP LOCKED/);
 assert.match(query.sql,/claimed_until/);
 assert.deepEqual(query.params,[12]);
});

test('calendar reminder recipient lookup honors explicit opt-outs while preserving RSVP defaults',async()=>{
 let captured;
 const db={async query(sql,params){captured={sql,params};return{rows:[{user_id:'123456789012345678'}],rowCount:1};}};
 const users=await getEventReminderRecipients(db,'123e4567-e89b-42d3-a456-426614174000','boss_raid_reminders');
 assert.deepEqual(users,['123456789012345678']);
 assert.match(captured.sql,/COALESCE\(n\.enabled,TRUE\)=TRUE/);
 assert.deepEqual(captured.params,['123e4567-e89b-42d3-a456-426614174000','boss_raid_reminders']);
});
