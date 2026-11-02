import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual
} from 'node:crypto';
import {
  DEFAULT_GUILD_FEATURES, listGuildFeatureSettings, setGuildFeatureEnabled, resetGuildFeatureSetting
} from './guild-feature-settings.js';

const ACCOUNT_KEY = /^(?:site_[0-9a-f-]{36}|[0-9]{17,20})$/i;
const SNOWFLAKE = /^[0-9]{17,20}$/;
const schemaReady = new WeakMap();
const FEATURE_LABELS = Object.freeze({
  commands: 'Komutlar',
  rpg: 'RPG ve macera',
  character: 'Karakter ve sınıflar',
  magic: 'Büyüler ve yetenekler',
  equipment: 'Ekipman ve envanter',
  economy: 'Ekonomi ve pazar',
  quests: 'Görevler ve başarımlar',
  dungeons: 'Zindanlar',
  bosses: 'Boss savaşları',
  trading: 'Oyuncu takası',
  messageXp: 'Maceracı XP sistemi',
  aiChat: 'Frieren sohbeti'
});
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const baseUrl = () => String(process.env.SITE_BASE_URL || 'https://frierenbot.vercel.app').replace(/\/+$/, '');

function accountKey(value) {
  const key = String(value || '');
  if (!ACCOUNT_KEY.test(key)) throw new Error('INVALID_GUILD_DASHBOARD_ACCOUNT');
  return key;
}
function deriveKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('INVALID_GUILD_TOKEN_SECRET');
  return createHash('sha256').update('frieren-guild-oauth-token-v1:' + secret).digest();
}
function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function encryptGuildOAuthToken(value, secret, iv = randomBytes(12)) {
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error('INVALID_GUILD_TOKEN_IV');
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptGuildOAuthToken(value, secret) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('INVALID_GUILD_TOKEN_CIPHERTEXT');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !data.length) throw new Error('INVALID_GUILD_TOKEN_CIPHERTEXT');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
export function createGuildDashboardCsrf(secret, accountId, now = Date.now(), nonce = randomBytes(18).toString('base64url')) {
  accountKey(accountId);
  if (typeof secret !== 'string' || secret.length < 32 || !/^[A-Za-z0-9_-]{20,64}$/.test(nonce)) {
    throw new Error('INVALID_GUILD_CSRF_INPUT');
  }
  const payload = Math.floor(now / 1000) + '.' + nonce + '.' + accountId;
  return payload + '.' + signature(payload, secret);
}
export function verifyGuildDashboardCsrf(token, secret, accountId, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || !/^\d{10}$/.test(parts[0])
      || !/^[A-Za-z0-9_-]{20,64}$/.test(parts[1]) || parts[2] !== String(accountId)) return false;
  const age = Math.floor(now / 1000) - Number(parts[0]);
  return age >= -60 && age <= 2 * 60 * 60
    && safeEqual(signature(parts.slice(0, 3).join('.'), secret), parts[3]);
}
export function filterManageableBotGuilds(guilds, clientGuildIds) {
  const installed = clientGuildIds instanceof Set ? clientGuildIds : new Set(clientGuildIds || []);
  return (Array.isArray(guilds) ? guilds : []).filter(guild => {
    const id = String(guild?.id || '');
    if (!SNOWFLAKE.test(id) || !installed.has(id)) return false;
    if (guild.owner === true) return true;
    try {
      const permissions = BigInt(String(guild.permissions || '0'));
      return (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
    } catch { return false; }
  }).map(guild => ({
    id: String(guild.id),
    name: String(guild.name || 'Adsız sunucu').slice(0, 100),
    icon: typeof guild.icon === 'string' && /^[a-f0-9]{8,64}$/i.test(guild.icon) ? guild.icon : null
  }));
}

async function ensureSchema(db) {
  if (!db || typeof db.query !== 'function') throw new Error('GUILD_DASHBOARD_DATABASE_REQUIRED');
  if (schemaReady.has(db)) return schemaReady.get(db);
  const pending = db.query(`
    CREATE TABLE IF NOT EXISTS frieren_site_discord_connections (
      account_key VARCHAR(64) PRIMARY KEY,
      discord_user_id VARCHAR(20) NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady.set(db, pending);
  try { await pending; } catch (error) { schemaReady.delete(db); throw error; }
}
export async function saveGuildDiscordConnection(db, input, secret) {
  const key = accountKey(input?.accountId);
  const userId = String(input?.discordUserId || '');
  const accessToken = input?.accessToken;
  const refreshToken = input?.refreshToken;
  const expiresIn = Number(input?.expiresIn);
  if (!SNOWFLAKE.test(userId) || typeof accessToken !== 'string' || !accessToken
      || typeof refreshToken !== 'string' || !refreshToken
      || !Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 30 * 24 * 60 * 60) {
    throw new Error('INVALID_GUILD_DISCORD_CONNECTION');
  }
  await ensureSchema(db);
  await db.query(`
    INSERT INTO frieren_site_discord_connections(account_key,discord_user_id,access_token_enc,refresh_token_enc,expires_at)
    VALUES($1,$2,$3,$4,NOW()+($5::text || ' seconds')::interval)
    ON CONFLICT(account_key) DO UPDATE SET
      discord_user_id=EXCLUDED.discord_user_id,
      access_token_enc=EXCLUDED.access_token_enc,
      refresh_token_enc=EXCLUDED.refresh_token_enc,
      expires_at=EXCLUDED.expires_at,
      updated_at=NOW()
  `, [
    key, userId, encryptGuildOAuthToken(accessToken, secret),
    encryptGuildOAuthToken(refreshToken, secret), String(Math.floor(expiresIn))
  ]);
  return { accountId: key, discordUserId: userId };
}
async function loadConnection(db, accountId) {
  await ensureSchema(db);
  const result = await db.query(
    'SELECT account_key,discord_user_id,access_token_enc,refresh_token_enc,expires_at FROM frieren_site_discord_connections WHERE account_key=$1',
    [accountKey(accountId)]
  );
  return result.rows?.[0] || null;
}
async function removeConnection(db, accountId) {
  await ensureSchema(db);
  await db.query('DELETE FROM frieren_site_discord_connections WHERE account_key=$1', [accountKey(accountId)]);
}
async function accessTokenFor(db, connection, secret, fetchImpl) {
  if (new Date(connection.expires_at).getTime() > Date.now() + 60_000) {
    return decryptGuildOAuthToken(connection.access_token_enc, secret);
  }
  const clientId = String(process.env.CLIENT_ID || '');
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || '');
  if (!clientId || !clientSecret) throw new Error('DISCORD_OAUTH_NOT_CONFIGURED');
  const refreshToken = decryptGuildOAuthToken(connection.refresh_token_enc, secret);
  const response = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: 'refresh_token', refresh_token: refreshToken
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('DISCORD_GUILD_TOKEN_REFRESH_FAILED');
  const data = await response.json();
  await saveGuildDiscordConnection(db, {
    accountId: connection.account_key,
    discordUserId: connection.discord_user_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in
  }, secret);
  return String(data.access_token);
}
async function fetchUserGuilds(fetchImpl, token) {
  const guilds = [];
  let after = '';
  for (let page = 0; page < 10; page++) {
    const endpoint = new URL('https://discord.com/api/users/@me/guilds');
    endpoint.searchParams.set('limit', '200');
    if (after) endpoint.searchParams.set('after', after);
    const batch = await requestDiscordJson(fetchImpl, endpoint, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!Array.isArray(batch)) throw new Error('INVALID_DISCORD_GUILD_LIST');
    guilds.push(...batch);
    if (batch.length < 200) break;
    after = String(batch[batch.length - 1]?.id || '');
    if (!SNOWFLAKE.test(after)) break;
  }
  return guilds;
}
async function getDashboardGuilds({ db, user, client, sessionSecret, fetchImpl }) {
  const connection = await loadConnection(db, user.id);
  if (!connection) return { connected: false, guilds: [] };
  try {
    const token = await accessTokenFor(db, connection, sessionSecret, fetchImpl);
    const rawGuilds = await fetchUserGuilds(fetchImpl, token);
    const installed = new Set([...(client?.guilds?.cache?.keys?.() || [])].map(String));
    return {
      connected: true,
      discordUserId: connection.discord_user_id,
      guilds: filterManageableBotGuilds(rawGuilds, installed)
    };
  } catch (error) {
    return { connected: false, reconnect: true, guilds: [], reason: error?.message || 'DISCORD_CONNECTION_FAILED' };
  }
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...headers
  });
  res.end(body);
}
function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}
function shell(title, content, user) {
  const avatar = user.avatarUrl || '/assets/site-avatar.webp';
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><title>' + esc(title) + ' · Frieren</title><link rel="stylesheet" href="/assets/site.css"></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-mark">✧</span><span>FRIEREN<small>THE ARCANE JOURNEY</small></span></a><nav><a href="/">Ana Sayfa</a><a href="/pogaca">Poğaça Frieren</a><a href="/guilds">Maceracı Loncası</a><a href="/komutlar">Komutlar</a></nav><div class="user-chip"><img src="' + esc(avatar) + '" alt=""><span>' + esc(user.username) + '</span><a href="/logout">↗</a></div></header>' + content + '<footer><strong>✧ FRIEREN · MACERACI LONCASI</strong><small>Sunucu ayarları yalnızca Discord yetkinle erişilebilir.</small></footer></body></html>';
}
function renderConnect(user, reconnect = false) {
  const message = reconnect
    ? '<p class="notice">Discord bağlantın yenilenmeli. Sunucu erişimlerini tekrar doğrula.</p>'
    : '<p class="lead">Discord hesabını bağla. Yalnızca botun bulunduğu ve yönetme yetkin olan sunucular gösterilir.</p>';
  return shell('Maceracı Loncası', '<main class="wrap" style="padding:56px 0"><div class="eyebrow">✧ LONCA YÖNETİM MERKEZİ ✧</div><h1 class="hero-title">Maceracı <em>Loncası</em></h1>' + message + '<section class="card"><h2>Discord sunucularını bağla</h2><p>Discord bağlantısı yalnızca sunucu listesini ve yönetme yetkini doğrulamak için kullanılır. Botun bulunmadığı sunuculara ayar yazılamaz.</p><a class="btn" href="/guilds/connect">Discord hesabını bağla ↗</a></section></main>', user);
}
function renderGuildList(user, guilds, status, csrf) {
  const cards = guilds.map(guild => {
    const icon = guild.icon
      ? 'https://cdn.discordapp.com/icons/' + guild.id + '/' + guild.icon + '.png?size=128'
      : '/assets/site-avatar.webp';
    return '<a class="card" style="display:flex;align-items:center;gap:16px;text-decoration:none" href="/guilds/' + esc(guild.id) + '"><img src="' + esc(icon) + '" alt="" width="64" height="64" style="border-radius:18px"><div><h2>' + esc(guild.name) + '</h2><p class="muted">Sunucu ayarlarını aç ↗</p></div></a>';
  }).join('');
  const notice = status === 'saved' ? '<p role="status">Sunucu ayarı kaydedildi.</p>' : '';
  const empty = '<p class="muted">Poğaça Frieren’in bulunduğu ve yönetme yetkin olan sunucu bulunamadı.</p>';
  return shell('Maceracı Loncası', '<main class="wrap" style="padding:48px 0"><div class="eyebrow">✧ FRIEREN · GUILD SELECTOR</div><h1 class="hero-title">Loncaların</h1><p class="lead">Yönetebildiğin ve Poğaça Frieren’in bulunduğu sunucuyu seç.</p>' + notice + '<div class="grid">' + (cards || empty) + '</div><form method="post" action="/guilds/disconnect" style="margin-top:24px"><input type="hidden" name="csrf" value="' + esc(csrf) + '"><button class="btn ghost">Discord bağlantısını kaldır</button></form></main>', user);
}
async function renderGuildSettings(user, guild, db, status, csrf) {
  const settings = await listGuildFeatureSettings(db, guild.id);
  const saved = new Map(settings.map(row => [row.feature_key, row]));
  const rows = Object.entries(DEFAULT_GUILD_FEATURES).map(([key, defaultEnabled]) => {
    const row = saved.get(key);
    const enabled = row ? row.enabled === true : defaultEnabled;
    return '<article class="card"><form method="post" action="/guilds/settings"><input type="hidden" name="csrf" value="' + esc(csrf) + '"><input type="hidden" name="guildId" value="' + esc(guild.id) + '"><input type="hidden" name="featureKey" value="' + esc(key) + '"><h3>' + esc(FEATURE_LABELS[key] || key) + '</h3><label><input type="checkbox" name="enabled" value="yes"' + (enabled ? ' checked' : '') + '> Etkin</label><div class="actions"><button class="btn">Kaydet</button><button class="btn ghost" name="featureAction" value="reset">Varsayılana döndür</button></div></form></article>';
  }).join('');
  const notice = status === 'saved' ? '<p role="status">Ayar kaydedildi.</p>' : status === 'reset' ? '<p role="status">Genel varsayılana döndürüldü.</p>' : '';
  return shell(guild.name + ' · Lonca Ayarları', '<main class="wrap" style="padding:48px 0"><a href="/guilds">← Loncalarına dön</a><div class="eyebrow">✧ SUNUCUYA ÖZEL FRIEREN AYARLARI</div><h1 class="hero-title">' + esc(guild.name) + '</h1><p class="lead">Bu ayarlar yalnızca seçilen Discord sunucusuna uygulanır.</p>' + notice + '<div class="grid">' + rows + '</div></main>', user);
}
export async function handleGuildDashboardRequest(req, res, {
  client, db, user, sessionSecret, fetchImpl = fetch
} = {}) {
  const url = new URL(req.url, baseUrl());
  const path = url.pathname;
  if (path !== '/guilds' && !path.startsWith('/guilds/')) return false;
  if (!user) {
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if (!sessionSecret || sessionSecret.length < 32 || !db) {
    send(res, 503, '<h1>Lonca paneli şu anda kullanılamıyor.</h1>');
    return true;
  }
  try {
    if (path === '/guilds/connect' && req.method === 'GET') {
      res.writeHead(302, { Location: '/owner/login?flow=guilds', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    if (req.method === 'POST') {
      const form = await readBody(req);
      if (!verifyGuildDashboardCsrf(form.csrf, sessionSecret, user.id)) {
        send(res, 403, '<h1>Form doğrulaması başarısız.</h1><p>Sayfayı yenileyip tekrar dene.</p>');
        return true;
      }
      if (path === '/guilds/disconnect') {
        await removeConnection(db, user.id);
        redirect(res, '/guilds');
        return true;
      }
      if (path === '/guilds/settings') {
        const featureKey = String(form.featureKey || '');
        const guildId = String(form.guildId || '');
        if (!Object.hasOwn(DEFAULT_GUILD_FEATURES, featureKey) || !SNOWFLAKE.test(guildId)) {
          send(res, 400, '<h1>Geçersiz sunucu ayarı.</h1>');
          return true;
        }
        const dashboard = await getDashboardGuilds({ db, user, client, sessionSecret, fetchImpl });
        const guild = dashboard.guilds.find(item => item.id === guildId);
        if (!dashboard.connected || !guild) {
          send(res, 403, '<h1>Bu sunucuyu yönetme yetkin doğrulanamadı.</h1><p>Discord bağlantısını yenileyip tekrar dene.</p>');
          return true;
        }
        if (form.featureAction === 'reset') await resetGuildFeatureSetting(db, { guildId, featureKey });
        else await setGuildFeatureEnabled(db, {
          guildId, featureKey, enabled: form.enabled === 'yes', actorId: dashboard.discordUserId
        });
        redirect(res, '/guilds/' + guildId + '?status=' + (form.featureAction === 'reset' ? 'reset' : 'saved'));
        return true;
      }
      send(res, 404, '<h1>Lonca paneli sayfası bulunamadı.</h1>');
      return true;
    }
    if (req.method !== 'GET') {
      send(res, 405, '<h1>Bu istek yöntemi desteklenmiyor.</h1>', { Allow: 'GET, POST' });
      return true;
    }
    if (path !== '/guilds' && path !== '/guilds/' && path !== '/guilds/connect'
        && !/^\/guilds\/\d{17,20}$/.test(path)) {
      send(res, 404, '<h1>Lonca paneli sayfası bulunamadı.</h1>');
      return true;
    }
    const dashboard = await getDashboardGuilds({ db, user, client, sessionSecret, fetchImpl });
    if (!dashboard.connected) {
      send(res, 200, renderConnect(user, dashboard.reconnect === true));
      return true;
    }
    const csrf = createGuildDashboardCsrf(sessionSecret, user.id);
    if (path === '/guilds' || path === '/guilds/') {
      send(res, 200, renderGuildList(user, dashboard.guilds, url.searchParams.get('status') || '', csrf));
      return true;
    }
    const guildId = path.slice('/guilds/'.length);
    if (!SNOWFLAKE.test(guildId)) {
      send(res, 404, '<h1>Lonca bulunamadı.</h1>');
      return true;
    }
    const guild = dashboard.guilds.find(item => item.id === guildId);
    if (!guild) {
      send(res, 403, '<h1>Bu sunucuya erişim yetkin yok veya bot bu sunucuda bulunmuyor.</h1>');
      return true;
    }
    send(res, 200, await renderGuildSettings(user, guild, db, url.searchParams.get('status') || '', csrf));
    return true;
  } catch (error) {
    if (error?.message === 'BODY_TOO_LARGE') {
      send(res, 413, '<h1>Form çok büyük.</h1>');
      return true;
    }
    console.error('Guild dashboard request failed:', error?.message || 'unknown error');
    send(res, 503, '<h1>Lonca paneli geçici olarak kullanılamıyor.</h1><p>Discord bağlantısını yenileyip tekrar dene.</p>');
    return true;
  }
}
