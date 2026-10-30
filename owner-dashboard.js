import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const OWNER_ID = '1553794496234262641';
const BASE_URL = 'https://pogaca-frieren.onrender.com';
const SESSION_COOKIE = 'frieren_owner_session';
const STATE_COOKIE = 'frieren_owner_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

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
  return sign({ sub: OWNER_ID, exp: expiresAt }, secret);
}

export function verifyOwnerSession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32) return false;
  const session = unsign(token, secret);
  return session?.sub === OWNER_ID && Number.isInteger(session.exp) && session.exp > nowSeconds;
}

function clearCookie(name) {
  return name + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function page(title, content) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Frieren Owner</title><style>
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#10131b;color:#eef1f8}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#253047 0,#10131b 58%)}main{width:min(100%,680px);border:1px solid #39445a;border-radius:22px;background:#171d29;padding:30px;box-shadow:0 24px 80px #0008}h1{margin:0 0 8px;font-size:26px}p{color:#b9c3d5;line-height:1.6}.tag{display:inline-block;padding:6px 10px;border:1px solid #52627d;border-radius:999px;color:#c8d8f5;font-size:12px;margin:8px 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:22px 0}.item{background:#202a3a;border:1px solid #34435a;border-radius:14px;padding:16px}.item small{display:block;color:#aab8ce;margin-bottom:8px}.item strong{font-size:18px}.btn{display:inline-block;background:#d5e2fa;color:#172033;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;border:0;cursor:pointer}.muted{font-size:13px;color:#8997ad}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}form{display:inline}a{color:#d5e2fa}
  </style></head><body><main>${content}</main></body></html>`;
}

export async function handleOwnerDashboardRequest(req, res, { client }) {
  const url = new URL(req.url, BASE_URL);
  if (!url.pathname.startsWith('/owner')) return false;

  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) {
    send(res, 503, page('Kurulum gerekli', '<h1>Owner paneli henüz yapılandırılmadı</h1><p>Discord OAuth istemci sırrı ve en az 32 karakterlik oturum imzalama anahtarı Render ortam değişkenlerine eklenmeli.</p>'));
    return true;
  }

  const cookie = cookies(req);
  const redirectUri = process.env.OWNER_DASHBOARD_REDIRECT_URI || BASE_URL + '/owner/callback';
  const commonHeaders = { 'Set-Cookie': clearCookie(STATE_COOKIE) };

  if (url.pathname === '/owner/login' && req.method === 'GET') {
    const state = randomBytes(32).toString('base64url');
    const stateToken = sign({ state, exp: Date.now() + 10 * 60 * 1000 }, sessionSecret);
    const location = new URL('https://discord.com/oauth2/authorize');
    location.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      state
    }).toString();
    res.writeHead(302, {
      Location: location.toString(),
      'Cache-Control': 'no-store',
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
      send(res, 400, page('Giriş reddedildi', '<h1>Giriş doğrulanamadı</h1><p>OAuth doğrulaması geçersiz veya süresi dolmuş. Yeniden giriş yap.</p>'), { 'Set-Cookie': clearCookie(STATE_COOKIE) });
      return true;
    }

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed');
      const tokenData = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token },
        signal: AbortSignal.timeout(10000)
      });
      if (!userResponse.ok) throw new Error('Discord identity lookup failed');
      const user = await userResponse.json();
      if (String(user.id) !== OWNER_ID) {
        send(res, 403, page('Erişim reddedildi', '<h1>Bu panel sana açık değil</h1><p>Discord hesabın owner hesabı olarak doğrulanmadı.</p><a class="btn" href="/owner/login">Tekrar dene</a>'), { 'Set-Cookie': clearCookie(STATE_COOKIE) });
        return true;
      }

      const session = createOwnerSession(sessionSecret, Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
      res.writeHead(302, {
        Location: '/owner',
        'Cache-Control': 'no-store',
        'Set-Cookie': [
          clearCookie(STATE_COOKIE),
          SESSION_COOKIE + '=' + encodeURIComponent(session) + '; Path=/owner; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_TTL_SECONDS
        ]
      });
      res.end();
    } catch (error) {
      console.error('Owner OAuth login failed:', error?.message || 'unknown error');
      send(res, 502, page('Discord bağlantı hatası', '<h1>Discord ile giriş tamamlanamadı</h1><p>Biraz sonra yeniden dene.</p>'), { 'Set-Cookie': clearCookie(STATE_COOKIE) });
    }
    return true;
  }

  if (url.pathname === '/owner/logout' && req.method === 'POST') {
    res.writeHead(303, { Location: '/owner', 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie(SESSION_COOKIE) });
    res.end();
    return true;
  }

  const authenticated = verifyOwnerSession(cookie[SESSION_COOKIE], sessionSecret);
  if (!authenticated) {
    send(res, 200, page('Owner girişi', '<span class="tag">ÖZEL ERİŞİM</span><h1>Frieren · Owner Paneli</h1><p>Bu yönetim alanı yalnızca bot sahibine açıktır. Giriş, Discord hesabının kimliği doğrulanarak yapılır.</p><a class="btn" href="/owner/login">Discord ile giriş yap</a><p class="muted">Yetkisiz hesaplar panele erişemez.</p>'));
    return true;
  }

  if (url.pathname !== '/owner' && url.pathname !== '/owner/') {
    send(res, 404, page('Bulunamadı', '<h1>Sayfa bulunamadı</h1><a href="/owner">Panele dön</a>'));
    return true;
  }

  const ready = Boolean(client?.isReady?.());
  const guildCount = ready ? client.guilds.cache.size : 0;
  const commandCount = ready ? client.commands?.size || 0 : 0;
  const botName = ready ? String(client.user?.tag || 'Bağlı') : 'Çevrimdışı';
  send(res, 200, page('Owner paneli', `<span class="tag">OWNER · DOĞRULANDI</span><h1>Frieren · Yönetim Paneli</h1><p>Bu sayfayı yalnızca doğrulanmış owner hesabı görüntüleyebilir.</p><div class="grid"><div class="item"><small>Bot bağlantısı</small><strong>${ready ? 'Çevrimiçi' : 'Çevrimdışı'}</strong></div><div class="item"><small>Discord kimliği</small><strong>${botName.replace(/[&<>"]/g, '')}</strong></div><div class="item"><small>Sunucu sayısı</small><strong>${guildCount}</strong></div><div class="item"><small>Yüklü komut</small><strong>${commandCount}</strong></div></div><p class="muted">Bu ilk sürüm salt okunur durum panelidir. Yönetim işlemleri ayrıca güvenli ve denetlenebilir biçimde eklenecek.</p><div class="actions"><a class="btn" href="/owner">Durumu yenile</a><form method="post" action="/owner/logout"><button class="btn" type="submit">Güvenli çıkış</button></form></div>`));
  return true;
}
