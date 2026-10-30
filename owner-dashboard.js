import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  auditOwnerAction, getOwnerOverview, getMaintenanceState, listPendingApprovals,
  reviewApproval, listUserMemories, deleteUserMemory, setMaintenanceState,
  sendOwnerAnnouncement, getRecentOwnerActivity
} from './owner-admin.js';

const OWNER_ID = '1553794496234262641';
const BASE_URL = 'https://pogaca-frieren.onrender.com';
const SESSION_COOKIE = 'frieren_owner_session';
const STATE_COOKIE = 'frieren_owner_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_BODY_BYTES = 8192;

export const OWNER_PANEL_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Genel Bakış', command: '/owner' },
  { id: 'system', label: 'Sistem Durumu', command: '/owner-bilgi' },
  { id: 'memories', label: 'Hafıza Yönetimi', command: '/owner-bellek' },
  { id: 'approvals', label: 'Kod Talepleri', command: '/owner-onay' },
  { id: 'announcements', label: 'Duyuru Merkezi', command: '/owner-duyuru' },
  { id: 'maintenance', label: 'Bakım Merkezi', command: '/owner-bakim' },
  { id: 'activity', label: 'İşlem Kayıtları', command: null }
]);

export function renderOwnerNavigation() {
  return '<nav class="nav" aria-label="Owner panel bölümleri">' + OWNER_PANEL_SECTIONS
    .map(section => '<a href="#' + section.id + '">' + section.label
      + (section.command ? '<span>' + section.command + '</span>' : '') + '</a>').join('') + '</nav>';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...headers
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try { return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]; }
    catch { return ['', '']; }
  }).filter(([key]) => key));
}

function sign(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

function unsign(token, secret) {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}

export function createOwnerSession(secret, expiresAt) {
  return sign({ sub: OWNER_ID, exp: expiresAt, csrf: randomBytes(24).toString('base64url') }, secret);
}

export function readOwnerSession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32) return null;
  const session = unsign(token, secret);
  return session?.sub === OWNER_ID && Number.isInteger(session.exp) && session.exp > nowSeconds
    && typeof session.csrf === 'string' && session.csrf.length >= 32 ? session : null;
}

export function verifyOwnerSession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Boolean(readOwnerSession(token, secret, nowSeconds));
}

export function clearOwnerCookie(name, path = '/') {
  return name + '=; Path=' + path + '; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function buildOwnerSessionCookie(session, maxAgeSeconds) {
  return SESSION_COOKIE + '=' + encodeURIComponent(session) + '; Path=/owner; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAgeSeconds;
}

function page(title, content) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Frieren Owner</title><style>
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0c111b;color:#eef2fa}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px;background:radial-gradient(ellipse at top,#27354c 0,#0c111b 58%)}main{width:min(100%,1120px);margin:0 auto}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px}.brand{font-size:13px;letter-spacing:.14em;color:#a8b9d4}.hero,.panel{border:1px solid #35435a;border-radius:18px;background:#151d2a;padding:22px;box-shadow:0 16px 50px #0005}.hero{margin-bottom:16px}.hero h1{margin:6px 0;font-size:28px}.muted{color:#9eacc1;font-size:13px;line-height:1.55}.tag{display:inline-block;padding:5px 9px;border:1px solid #52627d;border-radius:999px;color:#c8d8f5;font-size:11px;letter-spacing:.08em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0}.stat{background:#202b3c;border:1px solid #35445b;border-radius:13px;padding:15px}.stat small{display:block;color:#aab8ce;margin-bottom:7px}.stat strong{font-size:21px}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px;margin:14px 0}.panel h2{font-size:17px;margin:0 0 14px}.panel h3{font-size:14px;margin:18px 0 8px;color:#dce6f7}.btn{display:inline-block;background:#d5e2fa;color:#172033;padding:10px 15px;border-radius:9px;text-decoration:none;font-weight:700;border:0;cursor:pointer}.btn.danger{background:#542f3b;color:#ffe3e9}.btn.secondary{background:#29374b;color:#e0e9f8;border:1px solid #465772}form{margin:9px 0}label{display:block;font-size:12px;color:#afbdd1;margin:9px 0 5px}input,select,textarea{display:block;width:100%;border:1px solid #40516b;border-radius:8px;background:#0e1623;color:#f2f5fb;padding:10px;font:inherit}textarea{min-height:90px;resize:vertical}.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.rowitem{border-top:1px solid #344156;padding:12px 0}.rowitem:first-of-type{border-top:0}.mono{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.notice{border:1px solid #52627d;background:#202b3c;border-radius:10px;padding:11px;margin:12px 0}.good{color:#8be0b0}.warn{color:#f4ce83}.bad{color:#ff9aa8}a{color:#d5e2fa}.small{font-size:12px;color:#91a0b7}.nav{position:sticky;top:8px;z-index:5;display:flex;gap:8px;overflow-x:auto;padding:9px;margin:0 0 16px;border:1px solid #35435a;border-radius:13px;background:#111a28f2;backdrop-filter:blur(12px)}.nav a{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:9px 11px;border-radius:9px;text-decoration:none;color:#e5edfa;font-size:12px}.nav a:hover,.nav a:focus{background:#29374b;outline:1px solid #52627d}.nav span{font:10px ui-monospace,monospace;color:#91a8c8}.hero,.panel{scroll-margin-top:90px}@media(max-width:560px){body{padding:12px}.hero,.panel{padding:16px}.hero h1{font-size:23px}.nav{top:4px;margin-left:-2px;margin-right:-2px}}
  </style></head><body><main>${content}</main></body></html>`;
}

function safeStringEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue ?? ''));
  const right = Buffer.from(String(rightValue ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolve(new URLSearchParams(body)));
    req.on('error', reject);
  });
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return (value / 1024 ** 3).toFixed(2) + ' GB';
  return (value / 1024 ** 2).toFixed(1) + ' MB';
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [days && days + ' gün', hours && hours + ' saat', minutes && minutes + ' dk'].filter(Boolean).join(' ') || '1 dk altı';
}

function redirect(res, location = '/owner') {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function renderDashboard({ session, overview, client, approvals, memories, memoryUser, notice, activity }) {
  const guilds = [...client.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  const guildOptions = guilds.map(guild => `<option value="${escapeHtml(guild.id)}">${escapeHtml(guild.name)} · ${escapeHtml(guild.id)}</option>`).join('');
  const channelOptions = guilds.flatMap(guild => [...guild.channels.cache.values()]
    .filter(channel => channel.isTextBased?.() && channel.send)
    .map(channel => `<option value="${escapeHtml(channel.id)}">${escapeHtml(guild.name)} / #${escapeHtml(channel.name)} · ${escapeHtml(guild.id)}</option>`)).join('');
  const approvalHtml = approvals.length ? approvals.map(row => `
    <div class="rowitem"><strong>#${row.id} · ${escapeHtml(row.title)}</strong>
      <div class="small">${escapeHtml(row.request_type)} · ${escapeHtml(row.requester_tag)} · ${new Date(row.created_at).toLocaleString('tr-TR')}</div>
      <p>${escapeHtml(String(row.details).slice(0,700))}</p>
      <form method="post" action="/owner/action" class="actions">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="id" value="${row.id}">
        <button class="btn" name="action" value="approval-approved">Onayla</button>
        <button class="btn danger" name="action" value="approval-rejected">Reddet</button>
      </form>
    </div>`).join('') : '<p class="muted">Bekleyen talep yok.</p>';
  const memoryHtml = memories.length ? memories.map(row => `
    <div class="rowitem"><strong>#${row.id} · ${escapeHtml(row.memory_key)}</strong>
      <div class="small">Kullanıcı ${escapeHtml(row.user_id)} · Sunucu ${escapeHtml(row.guild_id)}</div>
      <p>${escapeHtml(row.memory_value)}</p>
      <form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="id" value="${row.id}"><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Kalıcı olarak silmeyi onaylıyorum</label><button class="btn danger" name="action" value="memory-delete">Bu kaydı sil</button></form>
    </div>`).join('') : '<p class="muted">Arama için bir Discord kullanıcı ID gir veya eşleşen kayıt bulunmadı.</p>';
  const noticeText = ({
    maintenance_on: 'Bakım modu açıldı.',
    maintenance_off: 'Bakım modu kapatıldı.',
    approval_approved: 'Talep onaylandı. Kod otomatik çalıştırılmadı.',
    approval_rejected: 'Talep reddedildi.',
    memory_deleted: 'Hafıza kaydı silindi.',
    announcement_sent: 'Duyuru seçilen kanala gönderildi.',
    invalid: 'İşlem tamamlanamadı. Alanları ve bot izinlerini kontrol et.'
  })[notice] || '';
  return page('Owner Kontrol Merkezi', `
    <div class="top"><div><div class="brand">FRIEREN · PRIVATE OPERATIONS</div><div class="small">OWNER CONTROL CENTER</div></div>
      <form method="post" action="/owner/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="btn secondary">Güvenli çıkış</button></form>
    </div>
    ${renderOwnerNavigation()}
    <section class="hero" id="overview"><span class="tag">OWNER · DOĞRULANDI</span><h1>Frieren Kontrol Merkezi</h1><p class="muted">Bu panel yalnızca yetkili Discord hesabına açıktır. Yönetim işlemleri kayıt altına alınır.</p>
      ${noticeText ? '<div class="notice">' + escapeHtml(noticeText) + '</div>' : ''}
      <div class="grid" id="system">
        <div class="stat"><small>Bot bağlantısı</small><strong class="${overview.ready ? 'good' : 'bad'}">${overview.ready ? 'Çevrimiçi' : 'Çevrimdışı'}</strong></div>
        <div class="stat"><small>Discord gecikmesi</small><strong>${overview.ping === null ? '—' : overview.ping + ' ms'}</strong></div>
        <div class="stat"><small>Çalışma süresi</small><strong>${escapeHtml(formatDuration(overview.uptimeSeconds))}</strong></div>
        <div class="stat"><small>Sunucular</small><strong>${overview.guildCount}</strong></div>
        <div class="stat"><small>Üye toplamı (önbellek)</small><strong>${overview.userCount}</strong></div>
        <div class="stat"><small>Slash komutları</small><strong>${overview.commandCount}</strong></div>
        <div class="stat"><small>Node heap / RSS</small><strong>${escapeHtml(formatBytes(overview.heapUsedBytes))} / ${escapeHtml(formatBytes(overview.rssBytes))}</strong></div>
        <div class="stat"><small>Veritabanı</small><strong class="${overview.databaseReady ? 'good' : 'bad'}">${overview.databaseReady ? 'Bağlı' : 'Hata'}</strong></div>
        <div class="stat"><small>Kayıtlı kullanıcı hafızası</small><strong>${overview.memoryCount}</strong></div>
        <div class="stat"><small>Bekleyen teknik talepler</small><strong>${overview.pendingApprovals}</strong></div>
        <div class="stat"><small>Bakım modu</small><strong class="${overview.maintenance ? 'warn' : 'good'}">${overview.maintenance ? 'Açık' : 'Kapalı'}</strong></div>
        <div class="stat"><small>Çalışma ortamı</small><strong>${escapeHtml(process.version)}</strong></div>
      </div>
      <div class="actions"><a class="btn secondary" href="/owner">Durumu yenile</a><span class="small">Canlı süreç ölçümleri · Son sayfa yüklemesi</span></div>
    </section>
    <div class="columns">
      <section class="panel" id="maintenance"><h2>Bakım modu</h2><p class="muted">Açıldığında normal kullanıcı komutları ve Frieren sohbeti durdurulur. Owner komutları çalışmaya devam eder.</p>
        <form method="post" action="/owner/action" class="actions"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Bakım modu değişikliğini onaylıyorum</label><button class="btn" name="action" value="maintenance-on">Bakımı aç</button><button class="btn secondary" name="action" value="maintenance-off">Bakımı kapat</button></form>
      </section>
      <section class="panel" id="announcements"><h2>Duyuru gönder</h2><p class="muted">Yalnızca seçtiğin sunucu ve kanala gönderilir. Botun kanalda mesaj gönderme izni olmalıdır.</p>
        <form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="action" value="announcement-send">
          <label>Hedef sunucu</label><select name="guildId" required><option value="">Sunucu seç</option>${guildOptions}</select>
          <label>Hedef metin kanalı</label><select name="channelId" required><option value="">Kanal seç</option>${channelOptions}</select>
          <label>Duyuru metni</label><textarea name="message" maxlength="1800" required placeholder="Duyuru içeriği..."></textarea><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Seçtiğim kanala bu duyurunun gönderilmesini onaylıyorum</label>
          <button class="btn">Duyuruyu gönder</button>
        </form>
      </section>
    </div>
    <div class="columns">
      <section class="panel" id="approvals"><h2>Teknik talep onayları</h2><p class="muted">Onay/ret yalnızca talebin durumunu değiştirir; hiçbir kod otomatik çalıştırılmaz.</p>${approvalHtml}</section>
      <section class="panel" id="memories"><h2>Kullanıcı hafızaları</h2><p class="muted">Yalnızca mevcut Frieren hafıza kayıtları listelenir. Silme işlemi kalıcıdır ve denetim kaydına yazılır.</p>
        <form method="get" action="/owner"><label>Discord kullanıcı ID</label><input name="memoryUser" value="${escapeHtml(memoryUser)}" inputmode="numeric" placeholder="Örn. 123456789012345678" required><button class="btn secondary">Hafızaları getir</button></form>
        ${memoryHtml}
      </section>
    </div>
<div class="columns">
      <section class="panel" id="activity"><h2>Komut kullanım istatistikleri</h2>${activity.commands.length ? activity.commands.map(row => '<div class="rowitem"><strong>/' + escapeHtml(row.command_name) + '</strong><div class="small">' + escapeHtml(row.usage_count) + ' kullanım · Son: ' + escapeHtml(new Date(row.last_used_at).toLocaleString('tr-TR')) + '</div></div>').join('') : '<p class="muted">Komut ölçümleri bu sürümden itibaren birikmeye başlayacak.</p>'}</section>
      <section class="panel"><h2>Son teknik hatalar</h2>${activity.errors.length ? activity.errors.map(row => '<div class="rowitem"><strong>' + escapeHtml(row.scope) + '</strong><div class="small">' + escapeHtml(row.error_type) + ' · ' + escapeHtml(new Date(row.created_at).toLocaleString('tr-TR')) + '</div></div>').join('') : '<p class="muted">Kaydedilmiş teknik hata yok.</p>'}</section>
    </div>
    <section class="panel"><h2>Owner işlem geçmişi</h2>${activity.audit.length ? activity.audit.map(row => '<div class="rowitem"><strong>' + escapeHtml(row.action) + '</strong><div class="small">' + escapeHtml(row.target || 'Genel') + ' · ' + escapeHtml(new Date(row.created_at).toLocaleString('tr-TR')) + '</div></div>').join('') : '<p class="muted">Henüz yönetim işlemi kaydedilmedi.</p>'}</section>
    <section class="panel"><h2>Güvenlik ve denetim</h2><p class="muted">Owner OAuth, 8 saatlik imzalı oturum, HttpOnly/Secure/SameSite=Lax çerezi, CSRF doğrulaması ve işlem günlüğü aktiftir. Bot tokeni, OAuth sırrı ve veritabanı bağlantı adresi panelde gösterilmez.</p></section>
  `);
}

export async function handleOwnerDashboardRequest(req, res, { client, db }) {
  const url = new URL(req.url, BASE_URL);
  if (!url.pathname.startsWith('/owner')) return false;

  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32 || !db) {
    send(res, 503, page('Kurulum gerekli', '<h1>Owner paneli yapılandırılamadı</h1><p>OAuth ortam değişkenlerini ve veritabanı bağlantısını kontrol et.</p>'));
    return true;
  }

  const cookie = cookies(req);
  const redirectUri = process.env.OWNER_DASHBOARD_REDIRECT_URI || BASE_URL + '/owner/callback';

  if (url.pathname === '/owner/login' && req.method === 'GET') {
    const state = randomBytes(32).toString('base64url');
    const stateToken = sign({ state, exp: Date.now() + 10 * 60 * 1000 }, sessionSecret);
    const location = new URL('https://discord.com/oauth2/authorize');
    location.search = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state
    }).toString();
    res.writeHead(302, {
      Location: location.toString(), 'Cache-Control': 'no-store',
      'Set-Cookie': STATE_COOKIE + '=' + encodeURIComponent(stateToken) + '; Path=/owner; HttpOnly; Secure; SameSite=Lax; Max-Age=600'
    });
    res.end();
    return true;
  }

  if (url.pathname === '/owner/callback' && req.method === 'GET') {
    const savedState = unsign(cookie[STATE_COOKIE], sessionSecret);
    const receivedState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!savedState || savedState.exp < Date.now() || !receivedState || savedState.state !== receivedState || !code) {
      send(res, 400, page('Giriş reddedildi', '<h1>Giriş doğrulanamadı</h1><p>OAuth doğrulaması geçersiz veya süresi dolmuş. Yeniden giriş yap.</p>'), { 'Set-Cookie': clearOwnerCookie(STATE_COOKIE, '/owner') });
      return true;
    }
    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed');
      const tokenData = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token }, signal: AbortSignal.timeout(10000)
      });
      if (!userResponse.ok) throw new Error('Discord identity lookup failed');
      const user = await userResponse.json();
      if (String(user.id) !== OWNER_ID) {
        send(res, 403, page('Erişim reddedildi', '<h1>Bu panel sana açık değil</h1><p>Discord hesabın owner hesabı olarak doğrulanmadı.</p><a class="btn" href="/owner/login">Tekrar dene</a>'), { 'Set-Cookie': [clearOwnerCookie(STATE_COOKIE, '/owner'), clearOwnerCookie(SESSION_COOKIE, '/owner')] });
        return true;
      }
      const session = createOwnerSession(sessionSecret, Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
      res.writeHead(302, {
        Location: '/owner', 'Cache-Control': 'no-store',
        'Set-Cookie': [clearOwnerCookie(STATE_COOKIE, '/owner'), buildOwnerSessionCookie(session, SESSION_TTL_SECONDS)]
      });
      res.end();
    } catch (error) {
      console.error('Owner OAuth login failed:', error?.message || 'unknown error');
      send(res, 502, page('Discord bağlantı hatası', '<h1>Discord ile giriş tamamlanamadı</h1><p>Biraz sonra yeniden dene.</p>'), { 'Set-Cookie': [clearOwnerCookie(STATE_COOKIE, '/owner'), clearOwnerCookie(SESSION_COOKIE, '/owner')] });
    }
    return true;
  }

  const session = readOwnerSession(cookie[SESSION_COOKIE], sessionSecret);
  if (!session) {
    if (url.pathname === '/owner/logout' || url.pathname === '/owner/action') {
      send(res, 401, page('Oturum gerekli', '<h1>Oturum süresi doldu</h1><a class="btn" href="/owner/login">Yeniden giriş yap</a>'), { 'Set-Cookie': clearOwnerCookie(SESSION_COOKIE, '/owner') });
    } else {
      send(res, 200, page('Owner girişi', '<span class="tag">ÖZEL ERİŞİM</span><h1>Frieren · Owner Paneli</h1><p>Bu yönetim alanı yalnızca bot sahibine açıktır. Giriş, Discord hesabının kimliği doğrulanarak yapılır.</p><a class="btn" href="/owner/login">Discord ile giriş yap</a><p class="muted">Yetkisiz hesaplar panele erişemez.</p>'));
    }
    return true;
  }

  if (url.pathname === '/owner/logout' && req.method === 'POST') {
    try {
      const form = await readForm(req);
      if (!safeStringEqual(form.get('csrf'), session.csrf)) return send(res, 403, page('İstek reddedildi', '<h1>Güvenlik doğrulaması başarısız</h1>'));
    } catch { return send(res, 400, page('Geçersiz istek', '<h1>İstek okunamadı</h1>')); }
    res.writeHead(303, { Location: '/owner', 'Cache-Control': 'no-store', 'Set-Cookie': clearOwnerCookie(SESSION_COOKIE, '/owner') });
    res.end();
    return true;
  }

  if (url.pathname === '/owner/action' && req.method === 'POST') {
    try {
      const form = await readForm(req);
      if (!safeStringEqual(form.get('csrf'), session.csrf)) return send(res, 403, page('İstek reddedildi', '<h1>CSRF doğrulaması başarısız</h1>'));
      const action = form.get('action');
      let notice = 'invalid';
      if ((action === 'maintenance-on' || action === 'maintenance-off') && form.get('confirm') === 'yes') {
        await setMaintenanceState(db, action === 'maintenance-on', OWNER_ID);
        notice = action === 'maintenance-on' ? 'maintenance_on' : 'maintenance_off';
      } else if (action === 'approval-approved' || action === 'approval-rejected') {
        const result = await reviewApproval(db, form.get('id'), action === 'approval-approved' ? 'approved' : 'rejected', OWNER_ID);
        notice = result ? action.replace('-', '_') : 'invalid';
      } else if (action === 'memory-delete' && form.get('confirm') === 'yes') {
        const result = await deleteUserMemory(db, form.get('id'), OWNER_ID);
        notice = result ? 'memory_deleted' : 'invalid';
      } else if (action === 'announcement-send' && form.get('confirm') === 'yes') {
        const result = await sendOwnerAnnouncement(client, db, {
          guildId: form.get('guildId'), channelId: form.get('channelId'), message: form.get('message'), actorId: OWNER_ID
        });
        notice = result ? 'announcement_sent' : 'invalid';
      }
      redirect(res, '/owner?notice=' + notice);
    } catch (error) {
      console.error('Owner dashboard action failed:', error?.message || error);
      redirect(res, '/owner?notice=invalid');
    }
    return true;
  }

  if ((url.pathname !== '/owner' && url.pathname !== '/owner/') || req.method !== 'GET') {
    send(res, 404, page('Bulunamadı', '<h1>Sayfa bulunamadı</h1><a href="/owner">Panele dön</a>'));
    return true;
  }

  try {
    const [overview, approvals, activity] = await Promise.all([
      getOwnerOverview(client, db),
      listPendingApprovals(db, 15),
      getRecentOwnerActivity(db)
    ]);
    const memoryUser = String(url.searchParams.get('memoryUser') || '').replace(/\D/g, '').slice(0, 24);
    const memories = memoryUser ? await listUserMemories(db, memoryUser, null, 30) : [];
    send(res, 200, renderDashboard({
      session, overview, client, approvals, memories, memoryUser,
      notice: url.searchParams.get('notice'), activity
    }));
  } catch (error) {
    console.error('Owner dashboard load failed:', error?.message || error);
    send(res, 503, page('Panel verisi alınamadı', '<h1>Kontrol merkezi yüklenemedi</h1><p>Veritabanı bağlantısını kontrol et.</p><a href="/owner">Yeniden dene</a>'));
  }
  return true;
}
