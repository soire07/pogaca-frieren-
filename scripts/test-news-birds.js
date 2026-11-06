import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnimeNewsRss, buildAnimeNewsDigestEmbeds, classifyAnimeNews, setNotificationPreference, getNotificationPreferences, claimDueAnimeNewsDigests, getEventReminderRecipients } from '../news-birds.js';

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


test('RSS parser extracts a safe source image and source attribution',()=>{
 const xml='<rss><item><title>New Anime Season</title><link>https://www.animenewsnetwork.com/news/2026-11-05/test</link><guid>ann-image-1</guid><pubDate>Wed, 05 Nov 2026 12:00:00 GMT</pubDate><description>New season announced.</description><media:thumbnail url="https://cdn.animenewsnetwork.com/thumbnails/test.jpg"/></item></rss>';
 const items=parseAnimeNewsRss(xml);
 assert.equal(items[0].imageUrl,'https://cdn.animenewsnetwork.com/thumbnails/test.jpg');
 assert.equal(items[0].sourceName,'Anime News Network');
});

test('digest renderer creates a highlighted clickable lead and a compact linked story list',()=>{
 const embeds=buildAnimeNewsDigestEmbeds([
  {title:'Nintendo Switch 2 sales',link:'https://www.animenewsnetwork.com/news/2026-11-05/game',summary:'Game sales update.',sourceName:'Anime News Network',imageUrl:'https://cdn.animenewsnetwork.com/thumb.jpg'},
  {title:'New Manga License',link:'https://www.animenewsnetwork.com/news/2026-11-05/manga',summary:'A new manga license.'}
 ],new Date('2026-11-05T12:00:00.000Z'));
 assert.equal(embeds.length,2);
 assert.equal(embeds[0].title,'Nintendo Switch 2 sales');
 assert.equal(embeds[0].url,'https://www.animenewsnetwork.com/news/2026-11-05/game');
 assert.equal(embeds[0].image.url,'https://cdn.animenewsnetwork.com/thumb.jpg');
 assert.equal(embeds[0].fields[0].value,'Oyun');
 assert.match(embeds[1].fields[0].value,/\\[Haberi oku/);
 assert.equal(classifyAnimeNews('Titan Manga licenses new titles'),'Manga');
 assert.deepEqual(buildAnimeNewsDigestEmbeds([{title:'unsafe',link:'https://example.com/article'}]),[]);
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
