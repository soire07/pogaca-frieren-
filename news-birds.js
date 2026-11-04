import { randomUUID } from 'node:crypto';

export const ANIME_NEWS_FEED_URL = 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us';
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

export function parseAnimeNewsRss(xml) {
  const source = String(xml || '');
  if (source.length > 2_000_000) throw new Error('NEWS_BIRD_FEED_TOO_LARGE');
  const items = [];
  for (const match of source.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = cleanFeedText(readTag(block,'title'),240);
    const rawLink = cleanFeedText(readTag(block,'link'),500);
    const guid = cleanFeedText(readTag(block,'guid') || rawLink,500);
    const date = new Date(cleanFeedText(readTag(block,'pubDate') || readTag(block,'dc:date'),100));
    let link;
    try { link = new URL(rawLink); } catch { continue; }
    if (!title || !guid || !Number.isFinite(date.getTime()) || link.protocol !== 'https:' ||
        !['animenewsnetwork.com','www.animenewsnetwork.com'].includes(link.hostname.toLowerCase())) continue;
    items.push({
      guid, title, link: link.toString(),
      summary: cleanFeedText(readTag(block,'description'),500),
      publishedAt: date.toISOString()
    });
  }
  return items.slice(0,50);
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
      published_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(feed_key,guid)
    );
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
  const preferences=Object.fromEntries(NOTIFICATION_CATEGORIES.map(category=>[category,false]));
  for(const row of result.rows||[]) if(NOTIFICATION_CATEGORIES.includes(row.category)) preferences[row.category]=Boolean(row.enabled);
  return preferences;
}

export async function pollAnimeNewsFeed(db,fetcher=globalThis.fetch) {
  if(typeof fetcher!=='function') throw new Error('NEWS_BIRD_FETCH_UNAVAILABLE');
  const response=await fetcher(ANIME_NEWS_FEED_URL,{
    headers:{'User-Agent':'FrierenNewsBird/1.0 (+https://frierenbot.vercel.app)','Accept':'application/rss+xml, application/xml, text/xml'},
    signal:AbortSignal.timeout(10_000)
  });
  if(!response?.ok) throw new Error('NEWS_BIRD_FEED_HTTP_'+String(response?.status||'UNKNOWN'));
  const xml=await response.text();
  const items=parseAnimeNewsRss(xml);
  let inserted=0;
  for(const item of items){
    const result=await db.query(
      `INSERT INTO frieren_news_feed_items(feed_key,guid,title,link,summary,published_at)
       VALUES('anime_news',$1,$2,$3,$4,$5) ON CONFLICT(feed_key,guid) DO NOTHING RETURNING guid`,
      [item.guid,item.title,item.link,item.summary,item.publishedAt]
    );
    inserted+=result.rowCount||0;
  }
  return {fetched:items.length,inserted};
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
         SELECT json_build_object('title',title,'link',link,'summary',summary,'publishedAt',published_at) AS item
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
