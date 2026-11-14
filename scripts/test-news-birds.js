import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnimeNewsRss, pollAnimeNewsFeed, buildAnimeNewsDigestEmbeds, classifyAnimeNews, setNotificationPreference, getNotificationPreferences, claimDueAnimeNewsDigests, getEventReminderRecipients, translateAnimeNewsItems } from '../news-birds.js';

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


test('RSS poll stores normalized source, article and image metadata with conflict-safe keys',async()=>{
 const calls=[];
 const xml='<rss><item><title>Anime Update</title><link>https://www.animenewsnetwork.com/news/2026-11-05/poll</link><guid>poll-1</guid><pubDate>Wed, 05 Nov 2026 12:00:00 GMT</pubDate><description>Update summary.</description><media:thumbnail url="https://cdn.animenewsnetwork.com/poll.jpg"/></item></rss>';
 const result=await pollAnimeNewsFeed({async query(sql,params){calls.push({sql,params});return{rowCount:1,rows:[]};}},async url=>({ok:true,status:200,text:async()=>xml}));
 assert.deepEqual(result,{fetched:1,inserted:1,failures:[]});
 assert.match(calls[0].sql,/image_url,source_name,published_at/);
 assert.equal(calls[0].params[0],'poll-1');
 assert.equal(calls[0].params[4],'https://cdn.animenewsnetwork.com/poll.jpg');
 assert.equal(calls[0].params[5],'Anime News Network');
});

test('digest renderer creates individual clickable image embeds and deduplicates cross-source titles',()=>{
 const embeds=buildAnimeNewsDigestEmbeds([
  {title:'Nintendo Switch 2 sales',link:'https://www.animenewsnetwork.com/news/2026-11-05/game',summary:'Game sales update.',sourceName:'Anime News Network',imageUrl:'https://cdn.animenewsnetwork.com/thumb.jpg'},
  {title:'New Manga License',link:'https://www.animenewsnetwork.com/news/2026-11-05/manga',summary:'A new manga license.',imageUrl:'https://cdn.animenewsnetwork.com/manga.jpg'}
 ],new Date('2026-11-05T12:00:00.000Z'));
 assert.equal(embeds.length,2);
 assert.equal(embeds[0].title,'Nintendo Switch 2 sales');
 assert.equal(embeds[0].url,undefined);
 assert.equal(embeds[0].image,undefined);
 assert.equal(embeds[0].thumbnail.url,'https://cdn.animenewsnetwork.com/thumb.jpg');
 assert.match(embeds[0].description,/\\[Haberi oku →\\]\\(https:\\/\\/www\\.animenewsnetwork\\.com\\/news\\/2026-11-05\\/game\\)/);
 assert.equal(embeds[0].fields[0].value,'Oyun');
 assert.equal(embeds[1].title,'New Manga License');
 assert.equal(embeds[1].url,undefined);
 assert.equal(embeds[1].image,undefined);
 assert.equal(embeds[1].thumbnail.url,'https://cdn.animenewsnetwork.com/manga.jpg');
 assert.match(embeds[1].description,/\\[Haberi oku →\\]\\(https:\\/\\/www\\.animenewsnetwork\\.com\\/news\\/2026-11-05\\/manga\\)/);
 assert.equal(embeds[1].fields[0].value,'Manga');
 const duplicates=buildAnimeNewsDigestEmbeds([
  {title:'New Anime Season',link:'https://www.animenewsnetwork.com/news/2026-11-05/season'},
  {title:'New Anime Season',link:'https://www.crunchyroll.com/news/latest/season'}
 ]);
 assert.equal(duplicates.length,1);
 assert.equal(classifyAnimeNews('Titan Manga licenses new titles'),'Manga');
 assert.deepEqual(buildAnimeNewsDigestEmbeds([{title:'unsafe',link:'https://example.com/article'}]),[]);
});


test('English news is translated to Turkish once and cached; failures preserve source text',async()=>{
 const updates=[];
 const db={async query(sql,params){updates.push({sql,params});return{rowCount:1,rows:[]};}};
 const calls=[];
 const fetcher=async url=>{
  calls.push(String(url));
  const q=new URL(url).searchParams.get('q');
  return {ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:q==='Frieren returns'?'Frieren geri dönüyor':'Yeni bölüm duyuruldu.'}})};
 };
 const items=[{guid:'ann-translate-1',title:'Frieren returns',summary:'New episode announced.'}, ...Array.from({length:5},(_,i)=>({guid:'ann-extra-'+i,title:'Extra news '+i,summary:'Extra summary '+i}))];
 const translated=await translateAnimeNewsItems(db,items,fetcher);
 assert.equal(translated[0].translatedTitle,'Frieren geri dönüyor');
 assert.equal(translated[0].translatedSummary,'Yeni bölüm duyuruldu.');
 assert.equal(calls.length,10);
 assert.equal(translated.length,6);
 assert.equal(translated[5].translatedTitle,undefined);
 assert.match(updates[0].sql,/translated_title=\$2,translated_summary=\$3/);
 const cached=await translateAnimeNewsItems(db,[{...items[0],translatedTitle:'Frieren geri dönüyor',translatedSummary:'Yeni bölüm duyuruldu.'}],fetcher);
 assert.equal(cached[0].translatedTitle,'Frieren geri dönüyor');
 assert.equal(calls.length,10);
 const fallback=await translateAnimeNewsItems(db,items,async()=>({ok:false,status:429}));
 assert.equal(fallback[0].title,'Frieren returns');
 assert.equal(fallback[0].translatedTitle,undefined);
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


test('news digest caps each Discord delivery at five cards',()=>{
 const items=Array.from({length:7},(_,index)=>({
  title:'Distinct anime headline '+index,
  link:'https://www.animenewsnetwork.com/news/2026-11-14/story-'+index,
  summary:'A concise summary.'
 }));
 assert.equal(buildAnimeNewsDigestEmbeds(items).length,5);
});

test('news digest keeps article links separate from clean summaries and uses compact image cards',()=>{
 const link='https://www.animenewsnetwork.com/news/2026-11-14/frieren-update';
 const embeds=buildAnimeNewsDigestEmbeds([{
  title:'Frieren receives a new update',
  link,
  summary:'A new season was announced. Read more: https://example.com/extra and [source](https://example.com/source)',
  sourceName:'Anime News Network',
  imageUrl:'https://cdn.animenewsnetwork.com/frieren.jpg',
  publishedAt:'2026-11-14T10:00:00.000Z'
 }],new Date('2026-11-14T12:00:00.000Z'));
 assert.equal(embeds.length,1);
 assert.equal(embeds[0].url,undefined);
 assert.equal(embeds[0].image,undefined);
 assert.equal(embeds[0].thumbnail.url,'https://cdn.animenewsnetwork.com/frieren.jpg');
 assert.doesNotMatch(embeds[0].description.split('[Haberi oku')[0],/https?:\/\//);
 assert.match(embeds[0].description,/A new season was announced\\./);
 assert.doesNotMatch(embeds[0].description.split('[Haberi oku')[0],/Read more|source/i);
 assert.match(embeds[0].description,/\[Haberi oku →\]\(https:\/\/www\.animenewsnetwork\.com\/news\/2026-11-14\/frieren-update\)/);
 assert.equal((embeds[0].description.match(/https?:\/\//g)||[]).length,1);
});
