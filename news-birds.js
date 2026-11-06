import { randomUUID } from 'node:crypto';

export const ANIME_NEWS_FEED_URL = 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us';
// New sources are added only after their RSS endpoint and article/image hosts are verified.
export const ANIME_NEWS_SOURCES = Object.freeze([
  Object.freeze({ key: 'anime_news', name: 'Anime News Network', url: ANIME_NEWS_FEED_URL,
    articleHosts: ['animenewsnetwork.com', 'www.animenewsnetwork.com'],
    imageHosts: ['animenewsnetwork.com', 'www.animenewsnetwork.com', 'cdn.animenewsnetwork.com'] })
]);
export const NOTIFICATION_CATEGORIES = Object.freeze(['anime_news','event_reminders','boss_raid_reminders']);
const DISCORD_ID = /^\d{17,20}$/;

function decodeXml(value='') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Math.min(0x10ffff, Number(code))));
}
function cleanFeedText(value='', max=500) {
  return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0,max);
}
function readTag(block, tag) {
  const escaped = tag.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
  const match = new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i').exec(block);
  return match?.[1] || '';
}

function readImageUrl(block) {
  const candidates = [
    /<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  ];
  for (const pattern of candidates) {
    const match = pattern.exec(block);
    if (match?.[1]) return decodeXml(match[1]).trim();
  }
  return '';
}

function safeFeedUrl(value, allowedHosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch { return null; }
}

export function parseAnimeNewsRss(xml, source = ANIME_NEWS_SOURCES[0]) {
  const sourceXml = String(xml || '');
  if (source.length > 2_000_000) throw new Error('NEWS_BIRD_FEED_TOO_LARGE');
  const items = [];
  for (const match of source.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = cleanFeedText(readTag(block,'title'),240);
    const rawLink = cleanFeedText(readTag(block,'link'),500);
    const guid = cleanFeedText(readTag(block,'guid') || rawLink,500);
    const date = new Date(cleanFeedText(readTag(block,'pubDate') || readTag(block,'dc:date'),100));
    const safeLink = safeFeedUrl(rawLink, source.articleHosts);
    if (!title || !guid || !Number.isFinite(date.getTime()) || !safeLink) continue;
    const rawImage = readImageUrl(block);
    const imageUrl = rawImage ? safeFeedUrl(rawImage, source.imageHosts) : null;
    items.push({
      guid: source.key + ':' + guid, title, link: safeLink,
      summary: cleanFeedText(readTag(block,'description'),500),
      imageUrl, sourceName: source.name,
      publishedAt: date.toISOString()
    });
  }
  return items.slice(0,50);
}


function escapeMarkdown(value='') {
  return String(value).replace(/([_*~|])/g, '\\$1').replace(/@/g, '@\u200b');
}

export function classifyAnimeNews(title='') {
  const value=String(title).toLocaleLowerCase('tr-TR');
  if (/manga|manhwa|manhua|light novel|graphic novel/.test(value)) return 'Manga';
  if (/game|gaming|switch|playstation|xbox|steam|pc game|video game|oyun/.test(value)) return 'Oyun';
  if (/anime|season|episode|film|movie|voice actor|cast|series|dublaj/.test(value)) return 'Anime';
  return 'Anime & Manga';
}

export function buildAnimeNewsDigestEmbeds(items, now = new Date()) {
  const safeItems=(Array.isArray(items)?items:[]).filter(item =>
    item && safeFeedUrl(item.link, ANIME_NEWS_SOURCES.flatMap(source=>source.articleHosts))
  ).slice(0,5);
  if (!safeItems.length) return [];
  const date=new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeZone:'Europe/Istanbul'}).format(new Date(now));
  const lead=safeItems[0];
  const embeds=[{
    color:0x7654D6,
    author:{name:'🐦 FRIEREN HABERCİ KUŞU'},
    title:escapeMarkdown(String(lead.title||'Günün öne çıkan haberi')).slice(0,256),
    url:lead.link,
    description:escapeMarkdown(String(lead.summary||'Bu haber için kaynakta kısa bir açıklama bulunmuyor.')).slice(0,900),
    fields:[
      {name:'KATEGORİ',value:classifyAnimeNews(lead.title),inline:true},
      {name:'KAYNAK',value:String(lead.sourceName||'Anime News Network').slice(0,100),inline:true}
    ],
    ...(lead.imageUrl && safeFeedUrl(lead.imageUrl,ANIME_NEWS_SOURCES.flatMap(source=>source.imageHosts)) ? {image:{url:lead.imageUrl}} : {}),
    footer:{text:'Günlük Anime & Manga Bülteni · '+date},
    timestamp:new Date(now).toISOString()
  }];
  const remaining=safeItems.slice(1);
  if (remaining.length) embeds.push({
    color:0x46366F,
    title:'✦ GÜNÜN DİĞER HABERLERİ',
    fields:remaining.map((item,index)=>({
      name:String(index+2).padStart(2,'0')+' · '+escapeMarkdown(String(item.title||'Başlıksız haber')).slice(0,240),
      value:(escapeMarkdown(String(item.summary||'Ayrıntılar için haber kaynağını aç.')).slice(0,700)+'\n[Haberi oku ↗]('+item.link+')').slice(0,1024),
      inline:false
    })),
    footer:{text:'Bağlantılar doğrudan haber kaynağına yönlendirir.'}
  });
  return embeds;
}

export async function ensureNewsBirdSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS frieren_notification_preferences (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('anime_news','event_reminders','boss_raid_reminders')),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,user_id,category),
      FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS frieren_news_feed_items (
      feed_key TEXT NOT NULL,
      guid TEXT NOT NULL,
      title VARCHAR(240) NOT NULL,
      link TEXT NOT NULL,
      summary VARCHAR(500) NOT NULL DEFAULT '',
      image_url TEXT,
      source_name TEXT NOT NULL DEFAULT 'Anime News Network',
      published_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(feed_key,guid)
    );
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'Anime News Network';
    CREATE INDEX IF NOT EXISTS frieren_news_feed_recent_idx
      ON frieren_news_feed_items(feed_key,published_at DESC);
    CREATE TABLE IF NOT EXISTS frieren_news_digest_state (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_sent_at TIMESTAMPTZ,
      claimed_until TIMESTAMPTZ,
      PRIMARY KEY(guild_id,user_id),
      FOREIGN KEY(guild_id,user_id) REFERENCES users(guild_id,user_id) ON DELETE CASCADE
    );
  `);
}

export async function setNotificationPreference(db,{guildId,userId,category,enabled}) {
  if (!DISCORD_ID.test(String(guildId||'')) || !DISCORD_ID.test(String(userId||''))) throw new Error('NEWS_BIRD_PLAYER_INVALID');
  if (!NOTIFICATION_CATEGORIES.includes(category)) throw new Error('NEWS_BIRD_CATEGORY_INVALID');
  if (typeof enabled !== 'boolean') throw new Error('NEWS_BIRD_ENABLED_INVALID');
  await db.query(
    `INSERT INTO frieren_notification_preferences(guild_id,user_id,category,enabled)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(guild_id,user_id,category)
     DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()`,
    [guildId,userId,category,enabled]
  );
  return {status:'saved',category,enabled};
}

export async function getNotificationPreferences(db,guildId,userId) {
  if (!DISCORD_ID.test(String(guildId||'')) || !DISCORD_ID.test(String(userId||''))) throw new Error('NEWS_BIRD_PLAYER_INVALID');
  const result=await db.query(
    'SELECT category,enabled FROM frieren_notification_preferences WHERE guild_id=$1 AND user_id=$2',
    [guildId,userId]
  );
  const preferences={anime_news:false,event_reminders:true,boss_raid_reminders:true};
  for(const row of result.rows||[]) if(NOTIFICATION_CATEGORIES.includes(row.category)) preferences[row.category]=Boolean(row.enabled);
  return preferences;
}

export async function pollAnimeNewsFeed(db,fetcher=globalThis.fetch) {
  if(typeof fetcher!=='function') throw new Error('NEWS_BIRD_FETCH_UNAVAILABLE');
  let fetched=0, inserted=0;
  const failures=[];
  for (const source of ANIME_NEWS_SOURCES) {
    try {
      const response=await fetcher(source.url,{
        headers:{'User-Agent':'FrierenNewsBird/2.0 (+https://frierenbot.vercel.app)','Accept':'application/rss+xml, application/xml, text/xml'},
        signal:AbortSignal.timeout(10_000)
      });
      if(!response?.ok) throw new Error('HTTP_'+String(response?.status||'UNKNOWN'));
      const items=parseAnimeNewsRss(await response.text(),source);
      fetched+=items.length;
      for(const item of items){
        const result=await db.query(
          `INSERT INTO frieren_news_feed_items(feed_key,guid,title,link,summary,image_url,source_name,published_at)
           VALUES('anime_news',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(feed_key,guid) DO NOTHING RETURNING guid`,
          [item.guid,item.title,item.link,item.summary,item.imageUrl,item.sourceName,item.publishedAt]
        );
        inserted+=result.rowCount||0;
      }
    } catch (error) {
      failures.push({source:source.name,error:error?.message||String(error)});
    }
  }
  if (failures.length===ANIME_NEWS_SOURCES.length) throw new Error('NEWS_BIRD_ALL_FEEDS_FAILED');
  return {fetched,inserted,failures};
}

export async function claimDueAnimeNewsDigests(db,limit=20) {
  const batch=Math.max(1,Math.min(100,Number(limit)||20));
  const result=await db.query(
    `WITH candidates AS (
       SELECT p.guild_id,p.user_id
       FROM frieren_notification_preferences p
       LEFT JOIN frieren_news_digest_state s ON s.guild_id=p.guild_id AND s.user_id=p.user_id
       WHERE p.category='anime_news' AND p.enabled=TRUE
         AND (s.claimed_until IS NULL OR s.claimed_until<=NOW())
         AND (s.last_sent_at IS NULL OR s.last_sent_at<=NOW()-INTERVAL '24 hours')
       ORDER BY p.updated_at,p.guild_id,p.user_id
       LIMIT $1 FOR UPDATE OF p SKIP LOCKED
     ), claimed AS (
       INSERT INTO frieren_news_digest_state(guild_id,user_id,claimed_until)
       SELECT guild_id,user_id,NOW()+INTERVAL '10 minutes' FROM candidates
       ON CONFLICT(guild_id,user_id) DO UPDATE SET claimed_until=EXCLUDED.claimed_until
       WHERE frieren_news_digest_state.claimed_until IS NULL OR frieren_news_digest_state.claimed_until<=NOW()
       RETURNING guild_id,user_id,last_sent_at
     )
     SELECT c.guild_id,c.user_id,
       COALESCE(n.items,'[]'::json) AS items
     FROM claimed c
     CROSS JOIN LATERAL (
       SELECT json_agg(item ORDER BY item->>'publishedAt' DESC) AS items
       FROM (
         SELECT json_build_object('title',title,'link',link,'summary',summary,'imageUrl',image_url,'sourceName',source_name,'publishedAt',published_at) AS item
         FROM frieren_news_feed_items
         WHERE feed_key='anime_news'
           AND published_at>COALESCE(c.last_sent_at,NOW()-INTERVAL '24 hours')
         ORDER BY published_at DESC LIMIT 5
       ) recent
     ) n
     WHERE json_array_length(COALESCE(n.items,'[]'::json))>0`,
    [batch]
  );
  return result.rows;
}

export async function markAnimeNewsDigestSent(db,guildId,userId) {
  const result=await db.query(
    'UPDATE frieren_news_digest_state SET last_sent_at=NOW(),claimed_until=NULL WHERE guild_id=$1 AND user_id=$2 AND claimed_until>NOW() RETURNING user_id',
    [guildId,userId]
  );
  return result.rowCount===1;
}
export async function releaseAnimeNewsDigestClaim(db,guildId,userId) {
  const result=await db.query(
    'UPDATE frieren_news_digest_state SET claimed_until=NULL WHERE guild_id=$1 AND user_id=$2 AND claimed_until>NOW() RETURNING user_id',
    [guildId,userId]
  );
  return result.rowCount===1;
}

export async function getEventReminderRecipients(db,eventId,category) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(eventId||''))) throw new Error('NEWS_BIRD_EVENT_ID_INVALID');
  if (!['event_reminders','boss_raid_reminders'].includes(category)) throw new Error('NEWS_BIRD_CATEGORY_INVALID');
  const result=await db.query(
    `SELECT p.user_id FROM guild_event_participants p
     LEFT JOIN frieren_notification_preferences n
       ON n.guild_id=p.guild_id AND n.user_id=p.user_id AND n.category=$2
     WHERE p.event_id=$1 AND COALESCE(n.enabled,TRUE)=TRUE
     ORDER BY p.joined_at,p.user_id`,
    [eventId,category]
  );
  return result.rows.map(row=>row.user_id);
}
