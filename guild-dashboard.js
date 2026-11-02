import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual
} from 'node:crypto';
import { readPublicSiteSession } from './owner-dashboard.js';
import { createSiteCsrfToken, verifySiteCsrfToken } from './site-auth.js';
import {
  DEFAULT_GUILD_FEATURES, listGuildFeatureSettings, setGuildFeatureEnabled
} from './guild-feature-settings.js';

const SNOWFLAKE = /^\d{17,20}$/;
const SITE_ACCOUNT = /^site_[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 8192;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

const FEATURE_DETAILS = {
  commands: ['Komut sistemi', 'Komut kataloğu ve sunucuya özel komut erişimi.', 'Temel'],
  rpg: ['RPG dünyası', 'Frieren evrenindeki macera sistemlerinin ana anahtarı.', 'Macera'],
  character: ['Karakter ve sınıflar', 'Karakter profili, sınıf, istatistikler ve gelişim.', 'Macera'],
  magic: ['Büyüler ve yetenekler', 'Büyü öğrenme, büyü kitabı ve yetenek ağacı.', 'Macera'],
  equipment: ['Ekipman ve envanter', 'Eşyalar, ekipman, set bonusları ve envanter.', 'Macera'],
  economy: ['Lonca ekonomisi', 'Bakiye, market, para ve ekonomik işlemler.', 'Ekonomi'],
  quests: ['Görev panosu', 'Günlük görevler, görev zincirleri ve ödüller.', 'Macera'],
  dungeons: ['Zindan keşifleri', 'Zindanlar, katlar, karşılaşmalar ve ganimet.', 'Macera'],
  bosses: ['İblis ve boss avı', 'Boss karşılaşmaları, savaşlar ve ödüller.', 'Macera'],
  trading: ['Gezgin takası', 'Oyuncular arası eşya ve karakter takası.', 'Ekonomi'],
  messageXp: ['Mesaj deneyimi', 'Sohbet etkinliğinden XP ve seviye kazanımı.', 'İlerleme'],
  aiChat: ['Frieren sohbeti', 'Sunucuda Frieren karakter sohbeti ve hafıza ayarları.', 'Sosyal'],
  animeQuiz: ['Anime bilgi yarışması', 'Anime quizleri ve doğru cevap serileri.', 'Eğlence'],
  collection: ['Karakter koleksiyonu', 'Karakter arşivi, koleksiyon ve keşif defteri.', 'Koleksiyon'],
  achievements: ['Başarımlar', 'Oyuncu başarımları ve ilerleme hedefleri.', 'İlerleme'],
  dailyRewards: ['Günlük ödüller', 'Günlük giriş ödülleri ve devam serileri.', 'İlerleme'],
  exploration: ['Keşif ve macera', 'Bölgeler, keşif karşılaşmaları ve macera kayıtları.', 'Macera'],
  crafting: ['Zanaat ve üretim', 'Tarifler, malzeme ve eşya üretim akışı.', 'Ekonomi'],
  story: ['Hikâye ve evren', 'Frieren dünyası, NPC ve hikâye içerikleri.', 'Eğlence']
};

const PLANNED_FEATURES = [
  { id: 'pets', title: 'Yoldaş ve evcil ruhlar', description: 'Evcil yaratıkları sahiplenme, besleme, eğitme ve seviye atlatma.' },
  { id: 'fishing', title: 'Büyülü balıkçılık', description: 'Farklı bölgelerde balık, nadir tür ve koleksiyon avı.' },
  { id: 'farming', title: 'Bahçe ve iksir malzemeleri', description: 'Tohum ekme, hasat, üretim ve lonca çiftliği.' },
  { id: 'miniGames', title: 'Mini oyun salonu', description: 'Blackjack dışı beceri oyunları, yarışlar, kelime ve hafıza oyunları.' },
  { id: 'profileCards', title: 'Özelleştirilebilir profil kartları', description: 'Rozet, arka plan, çerçeve, unvan ve istatistik kartları.' },
  { id: 'guildEvents', title: 'Lonca etkinlikleri', description: 'Takvimli etkinlikler, turnuvalar, sezonlar ve ortak hedefler.' },
  { id: 'playerMarket', title: 'Oyuncu pazarı ve açık artırma', description: 'Teklif, açık artırma, pazar geçmişi ve güvenli alışveriş.' },
  { id: 'socialGames', title: 'Arkadaş ve parti oyunları', description: 'Birlikte oynanan oyunlar, parti davetleri ve eşli mücadeleler.' },
  { id: 'music', title: 'Müzik ve atmosfer', description: 'Lisans koşulları uygun kaynaklarla ses odası ve ambiyans kontrolleri.' },
  { id: 'seasonalEvents', title: 'Mevsimsel içerikler', description: 'Sınırlı süreli Frieren temalı etkinlikler, eşyalar ve hikâyeler.' }
];

export const GUILD_FEATURE_CATALOG = Object.freeze([
  ...Object.entries(FEATURE_DETAILS)
    .filter(([key]) => Object.hasOwn(DEFAULT_GUILD_FEATURES, key))
    .map(([key, detail]) => Object.freeze({
      key, title: detail[0], description: detail[1], category: detail[2], status: 'ready'
    })),
  ...PLANNED_FEATURES.map(feature => Object.freeze({
    ...feature, key: null, category: 'Lonca yol haritası', status: 'planned'
  }))
]);

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    try { return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; }
    catch { return ['', '']; }
  }).filter(([key]) => key));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    ...headers
  });
  res.end(body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

function getSession(req, secret) {
  return readPublicSiteSession(cookies(req)[COOKIE], secret);
}

function oauthConfig(env = process.env) {
  const clientId = String(env.CLIENT_ID || '').trim();
  const clientSecret = String(env.DISCORD_CLIENT_SECRET || '').trim();
  const base = String(env.SITE_BASE_URL || 'https://frierenbot.vercel.app').replace(/\/+$/, '');
  const redirectUri = String(env.GUILD_DASHBOARD_REDIRECT_URI || (base + '/discord/callback')).trim();
  let parsed;
  try { parsed = new URL(redirectUri); } catch { return null; }
  if (!clientId || !clientSecret || parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return { clientId, clientSecret, redirectUri: parsed.toString() };
}

export function hasManageGuildPermission(permission) {
  try {
    const bits = BigInt(String(permission ?? '0'));
    return (bits & 0x20n) === 0x20n || (bits & 0x8n) === 0x8n;
  } catch { return false; }
}

export function filterManageableGuilds(guilds, botGuildIds = new Set()) {
  const botIds = botGuildIds instanceof Set ? botGuildIds : new Set(botGuildIds || []);
  return (Array.isArray(guilds) ? guilds : [])
    .filter(guild => SNOWFLAKE.test(String(guild?.id || '')) &&
      hasManageGuildPermission(guild.permissions_new ?? guild.permissions))
    .map(guild => ({
      id: String(guild.id),
      name: String(guild.name || 'İsimsiz sunucu').slice(0, 100),
      icon: typeof guild.icon === 'string' && /^[a-zA-Z0-9_]{2,128}$/.test(guild.icon) ? guild.icon : null,
      botPresent: botIds.has(String(guild.id))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function createGuildOAuthState(accountId, secret, now = Date.now()) {
  if ((!SITE_ACCOUNT.test(String(accountId)) && !SNOWFLAKE.test(String(accountId))) ||
      typeof secret !== 'string' || secret.length < 32) throw new Error('INVALID_GUILD_OAUTH_STATE_INPUT');
  const payload = Buffer.from(JSON.stringify({
    sub: String(accountId), iat: Math.floor(now / 1000), nonce: randomBytes(18).toString('base64url')
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

export function verifyGuildOAuthState(state, accountId, secret, now = Date.now()) {
  if ((!SITE_ACCOUNT.test(String(accountId)) && !SNOWFLAKE.test(String(accountId))) ||
      typeof secret !== 'string' || secret.length < 32) return false;
  const parts = String(state || '').split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{20,2048}$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]{40,64}$/.test(parts[1])) return false;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  let received;
  try { received = Buffer.from(parts[1], 'base64url'); } catch { return false; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const age = Math.floor(now / 1000) - Number(payload.iat);
    return payload.sub === String(accountId) && /^[A-Za-z0-9_-]{20,32}$/.test(payload.nonce || '') &&
      Number.isInteger(payload.iat) && age >= -60 && age <= 600;
  } catch { return false; }
}

function tokenKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('INVALID_DISCORD_TOKEN_SECRET');
  return createHash('sha256').update('frieren-guild-dashboard:' + secret).digest();
}

export function encryptDiscordOAuthToken(value, secret) {
  const token = String(value || '');
  if (!token || token.length > 4096) throw new Error('INVALID_DISCORD_TOKEN');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return 'v1.' + iv.toString('base64url') + '.' + cipher.getAuthTag().toString('base64url') + '.' + ciphertext.toString('base64url');
}

export function decryptDiscordOAuthToken(value, secret) {
  try {
    const parts = String(value || '').split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('invalid');
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > 4096) throw new Error('invalid');
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (!plaintext || plaintext.length > 4096) throw new Error('invalid');
    return plaintext;
  } catch { throw new Error('INVALID_DISCORD_TOKEN_CIPHERTEXT'); }
}

export async function initGuildDashboardSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS frieren_site_discord_links (
      account_id VARCHAR(64) PRIMARY KEY,
      discord_user_id VARCHAR(20) NOT NULL UNIQUE,
      discord_username VARCHAR(64) NOT NULL,
      avatar_hash VARCHAR(128),
      access_token_encrypted TEXT NOT NULL,
      refresh_token_encrypted TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS frieren_site_discord_links_user_idx ON frieren_site_discord_links(discord_user_id)');
}

async function saveDiscordLink(db, accountId, profile, tokenData, secret) {
  const discordId = String(profile?.id || '');
  const access = String(tokenData?.access_token || '');
  const refresh = String(tokenData?.refresh_token || '');
  const expiresIn = Number(tokenData?.expires_in);
  if ((!SITE_ACCOUNT.test(accountId) && !SNOWFLAKE.test(accountId)) ||
      !SNOWFLAKE.test(discordId) || !access || !refresh ||
      !Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 604800) {
    throw new Error('INVALID_DISCORD_OAUTH_RESPONSE');
  }
  const username = String(profile.username || 'Gezgin').slice(0, 64);
  const avatar = typeof profile.avatar === 'string' && /^[a-zA-Z0-9_]{2,128}$/.test(profile.avatar) ? profile.avatar : null;
  await db.query(`
    INSERT INTO frieren_site_discord_links
      (account_id,discord_user_id,discord_username,avatar_hash,access_token_encrypted,refresh_token_encrypted,expires_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW()+($7 * INTERVAL '1 second'),NOW())
    ON CONFLICT(account_id) DO UPDATE SET
      discord_user_id=EXCLUDED.discord_user_id,discord_username=EXCLUDED.discord_username,
      avatar_hash=EXCLUDED.avatar_hash,access_token_encrypted=EXCLUDED.access_token_encrypted,
      refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,expires_at=EXCLUDED.expires_at,updated_at=NOW()
  `, [
    accountId, discordId, username, avatar,
    encryptDiscordOAuthToken(access, secret), encryptDiscordOAuthToken(refresh, secret), expiresIn
  ]);
}

async function discordRequest(path, accessToken, fetchImpl = fetch) {
  const response = await fetchImpl('https://discord.com/api/v10' + path, {
    headers: { Authorization: 'Bearer ' + accessToken },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('DISCORD_API_HTTP_' + response.status);
  return response.json();
}

async function linkedGuildAccess(db, accountId, secret, env = process.env, fetchImpl = fetch) {
  const result = await db.query(
    'SELECT discord_user_id,discord_username,avatar_hash,access_token_encrypted,refresh_token_encrypted,expires_at FROM frieren_site_discord_links WHERE account_id=$1',
    [accountId]
  );
  const link = result.rows?.[0];
  if (!link) return null;
  const config = oauthConfig(env);
  if (!config) throw new Error('GUILD_OAUTH_NOT_CONFIGURED');
  let accessToken = decryptDiscordOAuthToken(link.access_token_encrypted, secret);
  if (new Date(link.expires_at).getTime() <= Date.now() + 60_000) {
    const refreshToken = decryptDiscordOAuthToken(link.refresh_token_encrypted, secret);
    const response = await fetchImpl('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: 'refresh_token', refresh_token: refreshToken
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('DISCORD_TOKEN_REFRESH_FAILED');
    const renewed = await response.json();
    const profile = { id: link.discord_user_id, username: link.discord_username, avatar: link.avatar_hash };
    await saveDiscordLink(db, accountId, profile, renewed, secret);
    accessToken = String(renewed.access_token || '');
    if (!accessToken) throw new Error('DISCORD_TOKEN_REFRESH_INVALID');
  }
  const guilds = await discordRequest('/users/@me/guilds', accessToken, fetchImpl);
  if (!Array.isArray(guilds)) throw new Error('DISCORD_GUILD_LIST_INVALID');
  return {
    discordUserId: String(link.discord_user_id),
    username: String(link.discord_username),
    avatarHash: link.avatar_hash || null,
    guilds
  };
}

function basePage(title, body) {
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><title>' + esc(title) + ' · Frieren</title><link rel="stylesheet" href="/assets/site.css"><style>' +
    '.guild-wrap{width:min(1120px,calc(100% - 32px));margin:46px auto 80px}.guild-hero{padding:clamp(24px,5vw,48px);border:1px solid #bca2e455;border-radius:26px;background:radial-gradient(circle at 85% 0,#8b70b933,transparent 36%),linear-gradient(145deg,#28213f,#151323);box-shadow:0 24px 70px #05030d66}.guild-hero h1{font:clamp(32px,5vw,52px) Georgia,serif;margin:8px 0}.guild-hero p,.guild-copy{color:#c6bdd8;line-height:1.7}.guild-eyebrow{font-size:11px;letter-spacing:2px;color:#d6b9ff}.guild-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.guild-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border:1px solid #c5a6ef66;border-radius:13px;background:linear-gradient(135deg,#8d6bb9,#594276);color:white;text-decoration:none;font-weight:700;cursor:pointer}.guild-btn.secondary{background:#ffffff0b}.guild-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px;margin-top:22px}.guild-card,.guild-feature{border:1px solid #bca2e433;border-radius:18px;padding:20px;background:linear-gradient(145deg,#211c32,#171525)}.guild-card h3,.guild-feature h3{margin:0 0 8px;color:#f4eaff}.guild-card p,.guild-feature p{color:#bfb5d0;line-height:1.6;font-size:14px}.guild-status{font-size:12px;color:#c8b5e8}.guild-feature-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.guild-switch{display:flex;align-items:center;gap:8px;white-space:nowrap;color:#e8ddf6;font-size:13px}.guild-switch input{accent-color:#b99be7;width:18px;height:18px}.guild-section{margin-top:36px}.guild-section h2{font:28px Georgia,serif}.guild-category{color:#c4a7ee;font-size:11px;letter-spacing:1.4px;text-transform:uppercase}.guild-planned{opacity:.8}.guild-topnav{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:18px max(18px,calc((100% - 1120px)/2));border-bottom:1px solid #bca2e422;background:#171323}.guild-topnav a{color:#e6d7f7;text-decoration:none}.guild-note{border:1px solid #bca2e455;border-radius:14px;padding:14px;color:#cfc2e1;background:#8b70b911;margin-top:18px}.guild-icon{width:48px;height:48px;border-radius:14px;object-fit:cover;background:#3a2e50}.guild-form{margin:0}.guild-save{border:1px solid #b99be766;background:#8b70b922;color:#eee2ff;border-radius:10px;padding:9px 12px;cursor:pointer}.guild-error{border:1px solid #e69b9b66;color:#ffd1d1;padding:14px;border-radius:12px}.guild-feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:13px;margin-top:16px}.guild-back{color:#d9c3f5;text-decoration:none}.guild-footer{color:#9c91af;text-align:center;padding:32px;font-size:12px}' +
    '</style></head><body><nav class="guild-topnav"><a href="/">✧ FRIEREN</a><a href="/pogaca">Poğaça Frieren</a><a href="/komutlar">Komutlar</a><a href="/lonca">Maceracı Loncası</a><a href="/frieren-ai">Frieren AI</a></nav>' + body + '<footer class="guild-footer">© Frieren Platform · Maceracı Loncası</footer></body></html>';
}

function renderConnectPage(user, error = '') {
  const notice = error ? '<div class="guild-error">' + esc(error) + '</div>' : '';
  return basePage('Maceracı Loncası', '<main class="guild-wrap"><section class="guild-hero"><div class="guild-eyebrow">✧ FRIEREN · MACERACI LONCASI ✧</div><h1>Sunucunu loncaya bağla.</h1><p>Merhaba ' + esc(user.username) + '. Discord hesabını güvenli şekilde bağla; yönetme yetkin olan sunucuları seç ve Poğaça Frieren özelliklerini buradan düzenle.</p>' + notice +
    '<div class="guild-actions"><a class="guild-btn" href="/discord/connect">Discord hesabını bağla</a><a class="guild-btn secondary" href="/pogaca">Poğaça Frieren’i keşfet</a></div><div class="guild-note">Yalnızca Discord üzerinde <strong>Sunucuyu Yönet</strong> veya <strong>Yönetici</strong> iznine sahip olduğun sunucular gösterilir. Discord erişim anahtarları şifrelenmiş olarak saklanır; bot tokenı veya sunucu yönetim yetkisi istenmez.</div></section></main>');
}

function renderGuildList(user, link, guilds) {
  const cards = guilds.map(guild => {
    const icon = guild.icon
      ? '<img class="guild-icon" src="https://cdn.discordapp.com/icons/' + esc(guild.id) + '/' + esc(guild.icon) + '.png?size=96" alt="">'
      : '<div class="guild-icon" aria-hidden="true">✧</div>';
    const action = guild.botPresent
      ? '<a class="guild-btn" href="/lonca/' + encodeURIComponent(guild.id) + '">Lonca panelini aç</a>'
      : '<a class="guild-btn secondary" href="/pogaca">Önce Poğaça Frieren’i ekle</a>';
    return '<article class="guild-card">' + icon + '<h3>' + esc(guild.name) + '</h3><p class="guild-status">' + (guild.botPresent ? 'Poğaça Frieren bağlı' : 'Poğaça Frieren henüz bu sunucuda değil') + '</p>' + action + '</article>';
  }).join('');
  return basePage('Sunucu seçimi', '<main class="guild-wrap"><section class="guild-hero"><div class="guild-eyebrow">✧ LONCA KAPISI AÇILDI ✧</div><h1>Hangi sunucuyu yönetiyoruz?</h1><p>Discord hesabı: <strong>' + esc(link.username) + '</strong>. Sadece yönetme iznine sahip olduğun sunucular listelenir.</p><div class="guild-actions"><a class="guild-btn secondary" href="/discord/connect">Discord hesabını yeniden bağla</a></div></section><section class="guild-grid">' + (cards || '<div class="guild-note">Yönetebildiğin bir sunucu bulunamadı. Discord sunucu izinlerini kontrol et.</div>') + '</section></main>');
}

function renderGuildSettings(user, guild, settings, csrf, saved = false) {
  const overrides = new Map((settings || []).map(row => [row.feature_key, row]));
  const ready = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'ready');
  const planned = GUILD_FEATURE_CATALOG.filter(feature => feature.status === 'planned');
  const activeCards = ready.map(feature => {
    const enabled = overrides.has(feature.key) ? overrides.get(feature.key).enabled === true : DEFAULT_GUILD_FEATURES[feature.key] !== false;
    return '<article class="guild-feature"><div class="guild-category">' + esc(feature.category) + '</div><div class="guild-feature-top"><div><h3>' + esc(feature.title) + '</h3><p>' + esc(feature.description) + '</p></div><form class="guild-form" method="post" action="/api/lonca/features"><input type="hidden" name="csrf" value="' + esc(csrf) + '"><input type="hidden" name="guildId" value="' + esc(guild.id) + '"><input type="hidden" name="featureKey" value="' + esc(feature.key) + '"><input type="hidden" name="enabled" value="' + (enabled ? 'false' : 'true') + '"><button class="guild-save" type="submit">' + (enabled ? 'Kapat' : 'Aç') + '</button></form></div><div class="guild-status">' + (enabled ? '✧ Etkin' : '○ Devre dışı') + '</div></article>';
  }).join('');
  const plannedCards = planned.map(feature => '<article class="guild-feature guild-planned"><div class="guild-category">GELİŞTİRME YOL HARİTASI</div><h3>' + esc(feature.title) + '</h3><p>' + esc(feature.description) + '</p><div class="guild-status">◌ Planlandı · Henüz etkinleştirilemez</div></article>').join('');
  return basePage('Lonca ayarları', '<main class="guild-wrap"><a class="guild-back" href="/lonca">← Sunucu listesine dön</a><section class="guild-hero" style="margin-top:16px"><div class="guild-eyebrow">✧ MACERACI LONCASI · SUNUCU AYARLARI ✧</div><h1>' + esc(guild.name) + '</h1><p>Yalnızca bu sunucuya ait ayarlar değiştirilir. Diğer sunucuların yapılandırması etkilenmez.</p>' + (saved ? '<div class="guild-note" role="status">Ayar kaydedildi.</div>' : '') + '<div class="guild-note">Değişiklikler mevcut Discord komut erişim kontrollerine kaydedilir. Henüz geliştirilmemiş eğlence sistemleri yanlışlıkla açılmasın diye yol haritasında ayrı gösterilir.</div></section><section class="guild-section"><h2>Aktif Frieren modülleri</h2><p class="guild-copy">Bu modüller mevcut bot özellikleriyle bağlantılıdır. Her değişiklik yalnızca seçili sunucuya uygulanır.</p><div class="guild-feature-grid">' + activeCards + '</div></section><section class="guild-section"><h2>Diğer eğlence botlarından ilham alanlar</h2><p class="guild-copy">Tatsu, Dank Memer, Pokétwo, Mudae ve UnbelievaBoat gibi eğlence botlarında gördüğümüz sistemler Frieren evrenine uyarlanacak. Buradaki kartlar henüz canlı özellik değildir.</p><div class="guild-feature-grid">' + plannedCards + '</div></section></main>');
}

async function readForm(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

async function exchangeCode(code, config, fetchImpl = fetch) {
  const response = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId, client_secret: config.clientSecret,
      grant_type: 'authorization_code', code, redirect_uri: config.redirectUri
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('DISCORD_OAUTH_TOKEN_EXCHANGE_FAILED');
  return response.json();
}

async function fetchDiscordProfile(accessToken, fetchImpl = fetch) {
  const response = await fetchImpl('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: 'Bearer ' + accessToken },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('DISCORD_OAUTH_IDENTITY_FAILED');
  return response.json();
}

export async function handleGuildDashboardRequest(req, res, { client, db, env = process.env, fetchImpl = fetch } = {}) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const handledPath = path === '/lonca' || path.startsWith('/lonca/') ||
    path === '/discord/connect' || path === '/discord/callback' || path === '/api/lonca/features';
  if (!handledPath) return false;
  const secret = String(env.ADMIN_SESSION_SECRET || '');
  const user = getSession(req, secret);
  if (!user) {
    if (path === '/discord/callback') {
      send(res, 401, basePage('Discord bağlantısı', '<main class="guild-wrap"><h1>Oturum süresi doldu.</h1><p>Site hesabına yeniden giriş yapıp Discord bağlantısını tekrar başlat.</p><a class="guild-btn" href="/login">Giriş yap</a></main>'));
      return true;
    }
    redirect(res, '/login');
    return true;
  }
  if (!db || secret.length < 32) {
    send(res, 503, basePage('Kurulum gerekli', '<main class="guild-wrap"><h1>Lonca paneli şu anda kullanılamıyor.</h1><p>Veritabanı veya oturum güvenlik ayarı eksik.</p></main>'));
    return true;
  }
  try {
    if (path === '/discord/connect' && req.method === 'GET') {
      const config = oauthConfig(env);
      if (!config) {
        send(res, 503, renderConnectPage(user, 'Discord OAuth yapılandırması eksik. GUILD_DASHBOARD_REDIRECT_URI ve Discord OAuth istemci ayarlarını kontrol et.'));
        return true;
      }
      const state = createGuildOAuthState(user.id, secret);
      const location = new URL('https://discord.com/oauth2/authorize');
      location.search = new URLSearchParams({
        client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri,
        scope: 'identify guilds', state, prompt: 'consent'
      }).toString();
      redirect(res, location.toString());
      return true;
    }

    if (path === '/discord/callback' && req.method === 'GET') {
      const config = oauthConfig(env);
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      if (!config || !code || !verifyGuildOAuthState(state, user.id, secret)) {
        send(res, 400, basePage('Discord bağlantısı doğrulanamadı', '<main class="guild-wrap"><h1>OAuth doğrulaması başarısız.</h1><p>Bağlantı süresi dolmuş veya oturum eşleşmiyor. Yeniden dene.</p><a class="guild-btn" href="/lonca">Lonca paneline dön</a></main>'));
        return true;
      }
      const tokenData = await exchangeCode(code, config, fetchImpl);
      const profile = await fetchDiscordProfile(String(tokenData.access_token || ''), fetchImpl);
      await saveDiscordLink(db, user.id, profile, tokenData, secret);
      redirect(res, '/lonca');
      return true;
    }

    const linked = await linkedGuildAccess(db, user.id, secret, env, fetchImpl);
    if (!linked) {
      if (req.method !== 'GET' || path !== '/lonca') {
        redirect(res, '/lonca');
        return true;
      }
      send(res, 200, renderConnectPage(user));
      return true;
    }
    const botGuildIds = new Set([...(client?.guilds?.cache?.keys?.() || [])].map(String));
    const manageableGuilds = filterManageableGuilds(linked.guilds, botGuildIds);

    if (req.method === 'GET' && path === '/lonca') {
      send(res, 200, renderGuildList(user, linked, manageableGuilds));
      return true;
    }

    const match = path.match(/^\/lonca\/(\d{17,20})$/);
    if (req.method === 'GET' && match) {
      const guild = manageableGuilds.find(item => item.id === match[1]);
      if (!guild) {
        send(res, 403, basePage('Sunucu erişimi reddedildi', '<main class="guild-wrap"><h1>Bu sunucuyu yönetme iznin yok.</h1><a class="guild-btn" href="/lonca">Sunucu listesine dön</a></main>'));
        return true;
      }
      if (!guild.botPresent) {
        send(res, 409, basePage('Bot sunucuda değil', '<main class="guild-wrap"><h1>Poğaça Frieren henüz bu sunucuda değil.</h1><p>Önce botu sunucuya ekle, ardından modülleri yönetebilirsin.</p><a class="guild-btn" href="/pogaca">Davet sayfasını aç</a></main>'));
        return true;
      }
      const settings = await listGuildFeatureSettings(db, guild.id);
      const csrf = createSiteCsrfToken(secret);
      send(res, 200, renderGuildSettings(user, guild, settings, csrf, url.searchParams.get('saved') === '1'));
      return true;
    }

    if (req.method === 'POST' && path === '/api/lonca/features') {
      if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/x-www-form-urlencoded')) {
        send(res, 415, basePage('Geçersiz form', '<main class="guild-wrap"><h1>Form biçimi desteklenmiyor.</h1></main>'));
        return true;
      }
      const form = await readForm(req);
      if (!verifySiteCsrfToken(form.csrf, secret)) {
        send(res, 403, basePage('Güvenlik doğrulaması', '<main class="guild-wrap"><h1>Formun süresi doldu. Sayfayı yenile.</h1></main>'));
        return true;
      }
      const guild = manageableGuilds.find(item => item.id === form.guildId);
      if (!guild || !guild.botPresent) {
        send(res, 403, basePage('Sunucu erişimi', '<main class="guild-wrap"><h1>Bu sunucuda ayar değiştirme yetkin yok.</h1></main>'));
        return true;
      }
      const feature = GUILD_FEATURE_CATALOG.find(item => item.status === 'ready' && item.key === form.featureKey);
      if (!feature || !Object.hasOwn(DEFAULT_GUILD_FEATURES, feature.key) ||
          !['true', 'false'].includes(form.enabled)) {
        send(res, 400, basePage('Geçersiz ayar', '<main class="guild-wrap"><h1>Geçersiz modül ayarı.</h1></main>'));
        return true;
      }
      await setGuildFeatureEnabled(db, {
        guildId: guild.id, featureKey: feature.key, enabled: form.enabled === 'true',
        actorId: linked.discordUserId
      });
      redirect(res, '/lonca/' + guild.id + '?saved=1');
      return true;
    }
    return false;
  } catch (error) {
    const message = error?.code === '23505' || error?.message === '23505'
      ? 'Bu Discord hesabı başka bir Frieren hesabına bağlı.'
      : error?.message === 'GUILD_OAUTH_NOT_CONFIGURED'
      ? 'Discord OAuth yapılandırması tamamlanmamış.'
      : error?.message === 'DISCORD_TOKEN_REFRESH_FAILED'
        ? 'Discord bağlantısının süresi dolmuş. Discord hesabını yeniden bağla.'
        : 'İşlem tamamlanamadı. Bağlantını ve sunucu izinlerini kontrol edip tekrar dene.';
    console.error('Guild dashboard request failed:', error?.message || 'unknown');
    send(res, 503, basePage('Lonca paneli', '<main class="guild-wrap"><h1>Lonca kapısı şu anda açılamadı.</h1><p>' + esc(message) + '</p><div class="guild-actions"><a class="guild-btn" href="/discord/connect">Discord hesabını yeniden bağla</a><a class="guild-btn secondary" href="/lonca">Yeniden dene</a></div></main>'));
    return true;
  }
}
