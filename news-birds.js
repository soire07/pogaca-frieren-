import { randomUUID } from 'node:crypto';

export const ANIME_NEWS_FEED_URL = 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us';
// New sources are added only after their RSS endpoint and article/image hosts are verified.
export const ANIME_NEWS_SOURCES = Object.freeze([
  Object.freeze({ key: 'anime_news', name: 'Anime News Network', url: ANIME_NEWS_FEED_URL,
    articleHosts: ['animenewsnetwork.com', 'www.animenewsnetwork.com'],
    imageHosts: ['animenewsnetwork.com', 'www.animenewsnetwork.com', 'cdn.animenewsnetwork.com'] }),
  Object.freeze({ key: 'crunchyroll', name: 'Crunchyroll News', url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss',
    articleHosts: ['crunchyroll.com', 'www.crunchyroll.com'],
    imageHosts: ['crunchyroll.com', 'www.crunchyroll.com'] }),
  Object.freeze({ key: 'myanimelist', name: 'MyAnimeList News', url: 'https://myanimelist.net/rss/news.xml',
    articleHosts: ['myanimelist.net', 'www.myanimelist.net'],
    imageHosts: ['myanimelist.net', 'www.myanimelist.net', 'cdn.myanimelist.net'] })
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
  if (sourceXml.length > 2_000_000) throw new Error('NEWS_BIRD_FEED_TOO_LARGE');
  const items = [];
  for (const match of sourceXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
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
      guid: source.key === 'anime_news' ? guid : source.key + ':' + guid, title, link: safeLink,
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

function cleanNewsSummary(value='') {
  return String(value)
    .replace(/\\[([^\\]]+)\\]\\(https?:\\/\\/[^)]+\\)/gi, '$1')
    .replace(/https?:\\/\\/[^\\s<>()]+/gi, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

export async function translateAnimeNewsItems(db, items, fetcher=globalThis.fetch) {
  if (!Array.isArray(items) || !items.length) return [];
  if (typeof fetcher !== 'function') return items;
  const translated = [];
  for (const item of items.slice(0, 5)) {
    if (!item?.guid || (item.translatedTitle && typeof item.translatedSummary === 'string')) {
      translated.push(item);
      continue;
    }
    const title = String(item.title || '').slice(0, 240);
    const summary = String(item.summary || '').slice(0, 450);
    try {
      const translateText = async value => {
        if (!value) return '';
        const params = new URLSearchParams({ q: value, langpair: 'en|tr', mt: '1' });
        const response = await fetcher('https://api.mymemory.translated.net/get?' + params.toString(), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5_000)
        });
        if (!response?.ok) throw new Error('MYMEMORY_HTTP_' + String(response?.status || 'UNKNOWN'));
        const payload = await response.json();
        const result = payload?.responseData?.translatedText;
        if (Number(payload?.responseStatus) !== 200 || typeof result !== 'string' || !result.trim()
          || /MYMEMORY WARNING/i.test(result)) throw new Error('MYMEMORY_TRANSLATION_UNAVAILABLE');
        return cleanFeedText(result, 500);
      };
      const [translatedTitle, translatedSummary] = await Promise.all([
        translateText(title), translateText(summary)
      ]);
      if (!translatedTitle) throw new Error('MYMEMORY_EMPTY_TRANSLATION');
      await db.query(
        'UPDATE frieren_news_feed_items SET translated_title=$2,translated_summary=$3 WHERE feed_key=\'anime_news\' AND guid=$1',
        [item.guid, translatedTitle, translatedSummary]
      );
      translated.push({ ...item, translatedTitle, translatedSummary });
    } catch (error) {
      console.warn('Haberci kuş çevirisi kullanılamadı; kaynak metni korunuyor:', error?.message || error);
      translated.push(item);
    }
  }
  translated.push(...items.slice(5));
  return translated;
}

export function classifyAnimeNews(title='') {
  const value=String(title).toLocaleLowerCase('tr-TR');
  if (/manga|manhwa|manhua|light novel|graphic novel/.test(value)) return 'Manga';
  if (/game|gaming|switch|playstation|xbox|steam|pc game|video game|oyun/.test(value)) return 'Oyun';
  if (/anime|season|episode|film|movie|voice actor|cast|series|dublaj/.test(value)) return 'Anime';
  return 'Anime & Manga';
}

export function buildAnimeNewsDigestEmbeds(items, now = new Date()) {
  const articleHosts=ANIME_NEWS_SOURCES.flatMap(source=>source.articleHosts);
  const imageHosts=ANIME_NEWS_SOURCES.flatMap(source=>source.imageHosts);
  const seen=new Set();
  const safeItems=(Array.isArray(items)?items:[]).filter(item=>{
    if (!item || !safeFeedUrl(item.link,articleHosts)) return false;
    const titleKey=String(item.title||'').normalize('NFKD').toLocaleLowerCase('en-US').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
    const linkKey=String(item.link).split('#')[0].split('?')[0].replace(/\\/$/,'').toLowerCase();
    const key=titleKey||linkKey;
    if (seen.has(key) || seen.has(linkKey)) return false;
    seen.add(key); seen.add(linkKey);
    return true;
  }).slice(0,5);
  if (!safeItems.length) return [];
  const date=new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeZone:'Europe/Istanbul'}).format(new Date(now));
  return safeItems.map((item,index)=>{
    const publishedAt=new Date(item.publishedAt || now);
    const timestamp=Number.isFinite(publishedAt.getTime())?publishedAt.toISOString():new Date(now).toISOString();
    const imageUrl=item.imageUrl && safeFeedUrl(item.imageUrl,imageHosts);
    const summary=cleanNewsSummary(item.translatedSummary || item.summary)
      || 'Bu haber için kaynakta kısa bir açıklama bulunmuyor.';
    return {
      color:index===0?0x7654D6:0x46366F,
      ...(index===0?{author:{name:'🐦 FRIEREN HABERCİ KUŞU · GÜNLÜK BÜLTEN'}}:{}),
      title:escapeMarkdown(String(item.translatedTitle || item.title || 'Başlıksız haber')).slice(0,256),
      description:escapeMarkdown(summary).slice(0,760)+'\\n\\n[Haberi oku →]('+item.link+')',
      fields:[
        {name:'KATEGORİ',value:classifyAnimeNews(item.title),inline:true},
        {name:'KAYNAK',value:String(item.sourceName||'Anime News Network').slice(0,100),inline:true}
      ],
      ...(imageUrl?{thumbnail:{url:imageUrl}}:{}),
      footer:{text:index===0?'Günlük Anime & Manga Bülteni · '+date:'Haber '+String(index+1)+' / '+String(safeItems.length)},
      timestamp
    };
  });
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
      translated_title VARCHAR(240),
      translated_summary VARCHAR(500),
      published_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(feed_key,guid)
    );
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'Anime News Network';
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS translated_title VARCHAR(240);
    ALTER TABLE frieren_news_feed_items ADD COLUMN IF NOT EXISTS translated_summary VARCHAR(500);
    CREATE INDEX IF NOT EXISTS frieren_news_feed_recent_idx
      ON frieren_news_feed_items(feed_key,published_at DESC);
    CREATE TABLE IF NOT EXISTS frieren_news_guild_settings (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS frieren_news_guild_digest_state (
      guild_id TEXT PRIMARY KEY,
      last_sent_at TIMESTAMPTZ,
      claimed_until TIMESTAMPTZ
    );
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
         SELECT json_build_object('guid',guid,'title',title,'link',link,'summary',summary,'translatedTitle',translated_title,'translatedSummary',translated_summary,'imageUrl',image_url,'sourceName',source_name,'publishedAt',published_at) AS item
         FROM frieren_news_feed_items
         WHERE feed_key='anime_news'
           AND published_at>COALESCE(c.last_sent_at,NOW()-INTERVAL '24 hours')
         ORDER BY published_at DESC LIMIT 15
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


export async function setNewsGuildChannel(db,{guildId,channelId}) {
  if (!DISCORD_ID.test(String(guildId||'')) || !DISCORD_ID.test(String(channelId||''))) throw new Error('NEWS_BIRD_CHANNEL_INVALID');
  await db.query(
    `INSERT INTO frieren_news_guild_settings(guild_id,channel_id,enabled)
     VALUES($1,$2,TRUE)
     ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,enabled=TRUE,updated_at=NOW()`,
    [guildId,channelId]
  );
  return {status:'saved',guildId,channelId,enabled:true};
}

export async function disableNewsGuildChannel(db,guildId) {
  if (!DISCORD_ID.test(String(guildId||''))) throw new Error('NEWS_BIRD_GUILD_INVALID');
  const result=await db.query(
    'UPDATE frieren_news_guild_settings SET enabled=FALSE,updated_at=NOW() WHERE guild_id=$1 RETURNING guild_id',
    [guildId]
  );
  return {status:result.rowCount?'disabled':'not_configured',guildId};
}

export async function claimDueAnimeNewsGuildDigests(db,limit=50) {
  const batch=Math.max(1,Math.min(500,Number(limit)||50));
  const result=await db.query(
    `WITH candidates AS (
       SELECT s.guild_id,s.channel_id
       FROM frieren_news_guild_settings s
       LEFT JOIN frieren_news_guild_digest_state d ON d.guild_id=s.guild_id
       WHERE s.enabled=TRUE
         AND (d.claimed_until IS NULL OR d.claimed_until<=NOW())
         AND (d.last_sent_at IS NULL OR d.last_sent_at<=NOW()-INTERVAL '24 hours')
       ORDER BY s.updated_at,s.guild_id
       LIMIT $1 FOR UPDATE OF s SKIP LOCKED
     ), claimed AS (
       INSERT INTO frieren_news_guild_digest_state(guild_id,claimed_until)
       SELECT guild_id,NOW()+INTERVAL '10 minutes' FROM candidates
       ON CONFLICT(guild_id) DO UPDATE SET claimed_until=EXCLUDED.claimed_until
       WHERE frieren_news_guild_digest_state.claimed_until IS NULL
          OR frieren_news_guild_digest_state.claimed_until<=NOW()
       RETURNING guild_id,last_sent_at
     )
     SELECT c.guild_id,x.channel_id,COALESCE(n.items,'[]'::json) AS items
     FROM claimed c
     JOIN candidates x ON x.guild_id=c.guild_id
     CROSS JOIN LATERAL (
       SELECT json_agg(item ORDER BY item->>'publishedAt' DESC) AS items
       FROM (
         SELECT json_build_object('guid',guid,'title',title,'link',link,'summary',summary,
           'translatedTitle',translated_title,'translatedSummary',translated_summary,
           'imageUrl',image_url,'sourceName',source_name,'publishedAt',published_at) AS item
         FROM frieren_news_feed_items
         WHERE feed_key='anime_news'
           AND published_at>COALESCE(c.last_sent_at,NOW()-INTERVAL '24 hours')
         ORDER BY published_at DESC LIMIT 15
       ) recent
     ) n
     WHERE json_array_length(COALESCE(n.items,'[]'::json))>0`,
    [batch]
  );
  return result.rows;
}

export async function markAnimeNewsGuildDigestSent(db,guildId) {
  const result=await db.query(
    'UPDATE frieren_news_guild_digest_state SET last_sent_at=NOW(),claimed_until=NULL WHERE guild_id=$1 AND claimed_until>NOW() RETURNING guild_id',
    [guildId]
  );
  return result.rowCount===1;
}

export async function releaseAnimeNewsGuildDigestClaim(db,guildId) {
  const result=await db.query(
    'UPDATE frieren_news_guild_digest_state SET claimed_until=NULL WHERE guild_id=$1 AND claimed_until>NOW() RETURNING guild_id',
    [guildId]
  );
  return result.rowCount===1;
}
