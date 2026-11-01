import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import tls from 'node:tls';

const scrypt = promisify(scryptCallback);
const COOKIE = 'frieren_site_session';
const SESSION_TTL = 28800;
const LIMIT = 16384;
const attempts = new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const signature = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');
const baseUrl = () => String(process.env.SITE_BASE_URL || 'https://frierenbot.vercel.app').replace(/\/+$/, '');

export function validateSiteUsername(value) {
  const username = String(value || '').trim();
  return /^[a-zA-Z0-9_.-]{3,24}$/.test(username) ? username : null;
}
export function validateSiteEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}
export async function hashSitePassword(password, salt = randomBytes(16).toString('hex')) {
  const value = String(password || '');
  if (value.length < 10 || value.length > 128) throw new Error('INVALID_PASSWORD_LENGTH');
  const result = await scrypt(value, salt, 64, {N:16384,r:8,p:1,maxmem:64*1024*1024});
  return 'scrypt$16384$8$1$' + salt + '$' + Buffer.from(result).toString('hex');
}
export async function verifySitePassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1'
    || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  try {
    const actual = Buffer.from(await scrypt(String(password || ''), parts[4], 64, {N:16384,r:8,p:1,maxmem:64*1024*1024}));
    const expected = Buffer.from(parts[5], 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
export function createSiteCsrfToken(secret, now = Date.now()) {
  const payload = String(Math.floor(now/1000)) + '.' + randomBytes(18).toString('base64url');
  return payload + '.' + signature(payload, secret);
}
export function verifySiteCsrfToken(token, secret, now = Date.now()) {
  const p = String(token || '').split('.');
  if (p.length !== 3 || !/^\d{10}$/.test(p[0]) || !/^[A-Za-z0-9_-]{20,32}$/.test(p[1])) return false;
  const age = Math.floor(now/1000) - Number(p[0]);
  if (age < -60 || age > 7200) return false;
  const a = Buffer.from(signature(p[0] + '.' + p[1], secret));
  const b = Buffer.from(p[2]);
  return a.length === b.length && timingSafeEqual(a,b);
}
function page(title, body) {
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17152c"><title>' + esc(title) + ' · Frieren</title><link rel="stylesheet" href="/assets/site.css"><style>.auth-wrap{min-height:100vh;display:grid;place-items:center;padding:28px 18px}.auth-card{width:min(100%,520px);padding:clamp(22px,5vw,36px);border:1px solid #e8dafa55;border-radius:26px;background:linear-gradient(145deg,#34294cdd,#17152eee);box-shadow:0 24px 80px #05030d88;text-align:center}.auth-mark{width:86px;height:86px;border-radius:50%;object-fit:cover;border:2px solid #e8dafa88}.auth-card h1{font:38px Georgia,serif;margin:18px 0 8px}.auth-card p{color:var(--muted);line-height:1.65}.auth-card form{text-align:left;display:grid;gap:9px;margin-top:22px}.auth-card label{font-size:13px;color:#e8dcf7}.auth-card input{width:100%;padding:13px 14px;border:1px solid #e8dafa44;border-radius:12px;background:#100d1dcc;color:#fff;font:inherit;box-sizing:border-box}.auth-card button{width:100%;margin:10px 0;padding:13px 16px;border:0;border-radius:12px;cursor:pointer;font:inherit}.auth-card .auth-notice{padding:12px 14px;border:1px solid #f0c8a866;border-radius:12px;color:#ffe3b4}.auth-card a{color:#e3c9ff}.auth-links{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin-top:18px}.auth-hint{font-size:12px!important}</style></head><body><main class="auth-wrap"><section class="auth-card"><img class="auth-mark" src="/assets/site-avatar.svg" alt="Frieren"><div class="eyebrow">✧ FRIEREN · THE ARCANE JOURNEY ✧</div>' + body + '</section></main></body></html>';
}
const messages = {
  registered:'Kayıt oluşturuldu. E-posta adresine gönderilen doğrulama bağlantısını aç.',
  invalid_login:'Kullanıcı adı veya şifre hatalı.',
  unverified:'E-posta adresin henüz doğrulanmadı. Gelen kutunu ve spam klasörünü kontrol et.',
  email_sent:'Adres sistemde kayıtlıysa gerekli bağlantı gönderildi.',
  verified:'E-posta adresin doğrulandı. Şimdi giriş yapabilirsin.',
  invalid_token:'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı iste.',
  password_reset:'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.',
  invalid_input:'Bilgileri kontrol et. Kullanıcı adı 3–24 karakter, şifre en az 10 karakter olmalı.',
  duplicate:'Bu kullanıcı adı veya e-posta zaten kullanılıyor.',
  csrf:'Formun süresi doldu. Sayfayı yenileyip tekrar dene.',
  rate_limited:'Çok fazla deneme yapıldı. Bir süre sonra yeniden dene.',
  mail_unavailable:'E-posta gönderimi henüz yapılandırılmadı. Site yöneticisi Gmail SMTP ayarlarını tamamlamalı.',
  mail_error:'E-posta gönderilemedi. Biraz sonra yeniden dene.'
};
function formToken(secret) { return '<input type="hidden" name="csrf" value="' + createSiteCsrfToken(secret) + '">'; }
function authPage(mode, secret, status = '', token = '') {
  const notice = status && messages[status] ? '<p class="auth-notice" role="status">' + esc(messages[status]) + '</p>' : '';
  let body = '';
  if (mode === 'register') body = '<h1>Yolculuğa katıl</h1><p>Frieren hesabını oluştur. Kullanıcı adın ve şifren sana ait olacak.</p>' + notice +
    '<form method="post" action="/register" autocomplete="on">' + formToken(secret) +
    '<label>Kullanıcı adı</label><input name="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_.-]{3,24}" autocomplete="username" required>' +
    '<label>E-posta adresi</label><input name="email" type="email" maxlength="254" autocomplete="email" required>' +
    '<label>Şifre</label><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required>' +
    '<label>Şifreyi tekrar gir</label><input name="confirmPassword" type="password" minlength="10" maxlength="128" autocomplete="new-password" required><button class="btn">Hesap oluştur</button></form>' +
    '<div class="auth-links"><a href="/login">Zaten hesabın var mı? Giriş yap</a><a href="/resend-verification">Doğrulama e-postasını tekrar gönder</a></div><p class="auth-hint">E-posta doğrulaması, hesabının güvenliği ve şifre kurtarma için gereklidir.</p>';
  else if (mode === 'login') body = '<h1>Yolculuğuna dön</h1><p>Kullanıcı adın ve şifrenle giriş yap.</p>' + notice +
    '<form method="post" action="/login" autocomplete="on">' + formToken(secret) +
    '<label>Kullanıcı adı</label><input name="username" maxlength="24" autocomplete="username" required>' +
    '<label>Şifre</label><input name="password" type="password" maxlength="128" autocomplete="current-password" required><button class="btn">Giriş yap</button></form>' +
    '<div class="auth-links"><a href="/register">Kayıt ol</a><a href="/forgot-password">Şifremi unuttum</a><a href="/resend-verification">Doğrulama e-postasını tekrar gönder</a></div>';
  else if (mode === 'forgot') body = '<h1>Şifreni yenile</h1><p>Hesabına bağlı doğrulanmış e-posta adresini gir.</p>' + notice +
    '<form method="post" action="/forgot-password">' + formToken(secret) + '<label>E-posta adresi</label><input name="email" type="email" maxlength="254" required><button class="btn">Yenileme bağlantısı gönder</button></form><div class="auth-links"><a href="/login">Giriş sayfasına dön</a></div>';
  else if (mode === 'reset') body = '<h1>Yeni şifre oluştur</h1><p>Hesabın için yeni ve güçlü bir şifre belirle.</p>' + notice +
    '<form method="post" action="/reset-password">' + formToken(secret) + '<input type="hidden" name="token" value="' + esc(token) + '">' +
    '<label>Yeni şifre</label><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required>' +
    '<label>Yeni şifreyi tekrar gir</label><input name="confirmPassword" type="password" minlength="10" maxlength="128" autocomplete="new-password" required><button class="btn">Şifreyi yenile</button></form><div class="auth-links"><a href="/login">Giriş sayfasına dön</a></div>';
  else if (mode === 'verify') body = '<h1>E-posta doğrulama</h1><p>' + esc(messages[status] || messages.invalid_token) + '</p><div class="auth-links"><a href="/login">Giriş yap</a><a href="/resend-verification">Yeni bağlantı iste</a></div>';
  else body = '<h1>Doğrulama bağlantısı</h1><p>Hesabına bağlı e-posta adresini gir.</p>' + notice +
    '<form method="post" action="/resend-verification">' + formToken(secret) + '<label>E-posta adresi</label><input name="email" type="email" maxlength="254" required><button class="btn">Yeni bağlantı gönder</button></form><div class="auth-links"><a href="/login">Giriş yap</a></div>';
  return page('Hesap güvenliği', body);
}
function mailReady() { return Boolean(process.env.SITE_SMTP_USER && process.env.SITE_SMTP_APP_PASSWORD && process.env.ADMIN_SESSION_SECRET?.length >= 32); }

async function sendGmail(to, subject, html, plain) {
  if (!mailReady()) throw new Error('SITE_MAIL_NOT_CONFIGURED');
  const from = String(process.env.SITE_EMAIL_FROM || process.env.SITE_SMTP_USER).trim();
  const user = String(process.env.SITE_SMTP_USER).trim();
  const pass = String(process.env.SITE_SMTP_APP_PASSWORD).replace(/\s/g,'');
  if (![from,user,to].every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || pass.length < 12) throw new Error('SITE_MAIL_CONFIG_INVALID');
  const socket = tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true});
  socket.setTimeout(20000, () => socket.destroy(new Error('SMTP_TIMEOUT')));
  let buffer = '', lines = [], queue = [], waiters = [], socketError = null;
  const deliver = () => { if (queue.length && waiters.length) waiters.shift().resolve(queue.shift()); };
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let at;
    while ((at=buffer.indexOf('\\r\\n')) >= 0) {
      const line=buffer.slice(0,at); buffer=buffer.slice(at+2); lines.push(line);
      if (/^\\d{3} /.test(line)) { queue.push(lines.join('\\n')); lines=[]; deliver(); }
    }
  });
  socket.on('error', error => { socketError=error; while(waiters.length) waiters.shift().reject(error); });
  const read = () => new Promise((resolve,reject) => { if(socketError) reject(socketError); else if(queue.length) resolve(queue.shift()); else waiters.push({resolve,reject}); });
  await new Promise((resolve,reject) => { socket.once('secureConnect',resolve); socket.once('error',reject); });
  const cmd = async (value,codes) => { socket.write(value+'\r\n'); const response=await read(); if(!codes.includes(Number(response.slice(0,3)))) throw new Error('SMTP_'+response.slice(0,3)); };
  try {
    const greeting=await read(); if(!greeting.startsWith('220')) throw new Error('SMTP_GREETING');
    await cmd('EHLO frierenbot.vercel.app',[250]); await cmd('AUTH LOGIN',[334]);
    await cmd(Buffer.from(user).toString('base64'),[334]); await cmd(Buffer.from(pass).toString('base64'),[235]);
    await cmd('MAIL FROM:<'+from+'>',[250]); await cmd('RCPT TO:<'+to+'>',[250,251]); await cmd('DATA',[354]);
    const boundary='frieren_'+randomBytes(12).toString('hex');
    const message=['From: Frieren Portal <'+from+'>','To: '+to,'Subject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"','',
      '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(plain).toString('base64'),
      '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(html).toString('base64'),'--'+boundary+'--','.'].join('\r\n').replace(/^\./gm,'..');
    socket.write(message+'\r\n'); const sent=await read(); if(!sent.startsWith('250')) throw new Error('SMTP_SEND');
    await cmd('QUIT',[221]);
  } finally { socket.end(); }
}
async function mailVerification(email,token) {
  const link=baseUrl()+'/verify-email?token='+encodeURIComponent(token);
  await sendGmail(email,'Frieren Portal · E-posta doğrulama','<h1>Frieren Portal</h1><p>E-posta adresini doğrula:</p><p><a href="'+link+'">E-posta adresimi doğrula</a></p><p>Bağlantı 24 saat geçerlidir.</p>','E-posta doğrulama: '+link);
}
async function mailReset(email,token) {
  const link=baseUrl()+'/reset-password?token='+encodeURIComponent(token);
  await sendGmail(email,'Frieren Portal · Şifre yenileme','<h1>Frieren Portal</h1><p>Şifreni yenile:</p><p><a href="'+link+'">Yeni şifre oluştur</a></p><p>Bağlantı 30 dakika geçerlidir.</p>','Şifre yenileme: '+link);
}
let schemaPromise = null;
async function schema(db) {
  if (!schemaPromise) schemaPromise = (async () => {
    await db.query("CREATE TABLE IF NOT EXISTS frieren_site_accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username VARCHAR(24) NOT NULL, email VARCHAR(254) NOT NULL, password_hash TEXT NOT NULL, email_verified_at TIMESTAMPTZ, verification_token_hash TEXT, verification_expires_at TIMESTAMPTZ, reset_token_hash TEXT, reset_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS frieren_site_accounts_username_uq ON frieren_site_accounts (LOWER(username))');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS frieren_site_accounts_email_uq ON frieren_site_accounts (LOWER(email))');
    await db.query('CREATE INDEX IF NOT EXISTS frieren_site_accounts_verification_idx ON frieren_site_accounts (verification_token_hash) WHERE verification_token_hash IS NOT NULL');
    await db.query('CREATE INDEX IF NOT EXISTS frieren_site_accounts_reset_idx ON frieren_site_accounts (reset_token_hash) WHERE reset_token_hash IS NOT NULL');
  })();
  try { await schemaPromise; } catch (error) { schemaPromise = null; throw error; }
}
function limited(key,max,now=Date.now()) {
  for(const [k,v] of attempts) if(v.until<=now) attempts.delete(k);
  if(attempts.size>4000) attempts.clear();
  let v=attempts.get(key); if(!v||v.until<=now){attempts.set(key,{count:1,until:now+900000});return false;}
  v.count++; return v.count>max;
}
function ip(req) { const v=String(req.headers['x-forwarded-for']||'').split(',')[0].trim(); return /^[0-9a-fA-F:.]{3,64}$/.test(v)?v:'unknown'; }
async function formBody(req) {
  let size=0, chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>LIMIT)throw new Error('BODY_TOO_LARGE');chunks.push(chunk);}
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}
function send(res,status,body,extra={}) {
  res.writeHead(status,{ 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'",...extra });
  res.end(body);
}
function tokenOk(token,stored) {
  if(!token||!stored)return false;
  const a=Buffer.from(hash(token)),b=Buffer.from(String(stored));
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function handleSiteAuthRequest(req,res,{db,sessionSecret,createSession}={}) {
  const url=new URL(req.url,'http://localhost'), path=url.pathname;
  const routes=['/login','/register','/forgot-password','/reset-password','/verify-email','/resend-verification','/logout'];
  if(!routes.includes(path))return false;
  if(path==='/logout'&&req.method==='GET'){
    res.writeHead(302,{Location:'/login?status=logged_out','Cache-Control':'no-store','Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});res.end();return true;
  }
  if(!db||!sessionSecret||sessionSecret.length<32){send(res,503,page('Kurulum gerekli','<h1>Hesap sistemi geçici olarak kullanılamıyor</h1>'));return true;}
  try {
    await schema(db);
    if(req.method==='GET'){
      if(path==='/verify-email'){
        const t=String(url.searchParams.get('token')||'');
        const result=/^[a-f0-9]{64}$/.test(t)?await db.query("UPDATE frieren_site_accounts SET email_verified_at=NOW(),verification_token_hash=NULL,verification_expires_at=NULL,updated_at=NOW() WHERE verification_token_hash=$1 AND verification_expires_at>NOW() RETURNING id",[hash(t)]):{rowCount:0};
        send(res,result.rowCount?200:400,authPage('verify',sessionSecret,result.rowCount?'verified':'invalid_token'));return true;
      }
      if(path==='/reset-password'){
        const t=String(url.searchParams.get('token')||'');
        const found=/^[a-f0-9]{64}$/.test(t)?await db.query('SELECT id FROM frieren_site_accounts WHERE reset_token_hash=$1 AND reset_expires_at>NOW() AND email_verified_at IS NOT NULL',[hash(t)]):{rowCount:0};
        send(res,found.rowCount?200:400,authPage('reset',sessionSecret,found.rowCount?'':'invalid_token',found.rowCount?t:''));return true;
      }
      const mode=path==='/register'?'register':path==='/forgot-password'?'forgot':path==='/resend-verification'?'resend':'login';
      send(res,200,authPage(mode,sessionSecret,url.searchParams.get('status')||''));return true;
    }
    if(req.method!=='POST'){send(res,405,page('Yöntem desteklenmiyor','<h1>Yöntem desteklenmiyor</h1>'),{Allow:'GET, POST'});return true;}
    if(!String(req.headers['content-type']||'').toLowerCase().includes('application/x-www-form-urlencoded')){send(res,415,page('Geçersiz form','<h1>Form biçimi geçersiz</h1>'));return true;}
    const f=await formBody(req);
    if(!verifySiteCsrfToken(f.csrf,sessionSecret)){
      const mode=path==='/register'?'register':path==='/forgot-password'?'forgot':path==='/resend-verification'?'resend':'login';
      send(res,403,authPage(mode,sessionSecret,'csrf'));return true;
    }
    const addr=ip(req);
    if(path==='/register'){
      if(limited('reg:'+addr,5)){send(res,429,authPage('register',sessionSecret,'rate_limited'));return true;}
      const username=validateSiteUsername(f.username),email=validateSiteEmail(f.email),password=String(f.password||'');
      if(!username||!email||password!==String(f.confirmPassword||'')||password.length<10||password.length>128){send(res,400,authPage('register',sessionSecret,'invalid_input'));return true;}
      if(!mailReady()){send(res,503,authPage('register',sessionSecret,'mail_unavailable'));return true;}
      const token=randomBytes(32).toString('hex'),passwordHash=await hashSitePassword(password);
      try { await db.query("INSERT INTO frieren_site_accounts(username,email,password_hash,verification_token_hash,verification_expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '24 hours')",[username,email,passwordHash,hash(token)]); }
      catch(e){if(e?.code==='23505'){send(res,409,authPage('register',sessionSecret,'duplicate'));return true;}throw e;}
      try{await mailVerification(email,token);}catch(e){console.error('Site verification email failed:',e?.message||'unknown');send(res,503,authPage('register',sessionSecret,'mail_error'));return true;}
      send(res,201,authPage('login',sessionSecret,'registered'));return true;
    }
    if(path==='/login'){
      if(limited('login:'+addr,10)){send(res,429,authPage('login',sessionSecret,'rate_limited'));return true;}
      const username=validateSiteUsername(f.username),password=String(f.password||'');
      const found=username?await db.query('SELECT id,username,password_hash,email_verified_at FROM frieren_site_accounts WHERE LOWER(username)=LOWER($1) LIMIT 1',[username]):{rows:[]};
      const account=found.rows?.[0],valid=await verifySitePassword(password,account?.password_hash||'invalid');
      if(!account||!valid){send(res,401,authPage('login',sessionSecret,'invalid_login'));return true;}
      if(!account.email_verified_at){send(res,403,authPage('login',sessionSecret,'unverified'));return true;}
      const session=createSession(sessionSecret,{id:'site_'+account.id,username:account.username},Math.floor(Date.now()/1000)+SESSION_TTL);
      res.writeHead(302,{Location:'/', 'Cache-Control':'no-store','Set-Cookie':COOKIE+'='+encodeURIComponent(session)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+SESSION_TTL});res.end();return true;
    }
    if(path==='/forgot-password'){
      if(limited('forgot:'+addr,4)){send(res,429,authPage('forgot',sessionSecret,'rate_limited'));return true;}
      const email=validateSiteEmail(f.email);
      if(email&&mailReady()){
        const found=await db.query('SELECT id,email FROM frieren_site_accounts WHERE LOWER(email)=LOWER($1) AND email_verified_at IS NOT NULL LIMIT 1',[email]);
        const account=found.rows?.[0];
        if(account){
          const token=randomBytes(32).toString('hex');
          await db.query("UPDATE frieren_site_accounts SET reset_token_hash=$2,reset_expires_at=NOW()+INTERVAL '30 minutes',updated_at=NOW() WHERE id=$1",[account.id,hash(token)]);
          try{await mailReset(account.email,token);}catch(e){console.error('Site reset email failed:',e?.message||'unknown');}
        }
      }
      send(res,200,authPage('forgot',sessionSecret,'email_sent'));return true;
    }
    if(path==='/resend-verification'){
      if(limited('resend:'+addr,4)){send(res,429,authPage('resend',sessionSecret,'rate_limited'));return true;}
      const email=validateSiteEmail(f.email);
      if(email&&mailReady()){
        const found=await db.query('SELECT id,email FROM frieren_site_accounts WHERE LOWER(email)=LOWER($1) AND email_verified_at IS NULL LIMIT 1',[email]);
        const account=found.rows?.[0];
        if(account){
          const token=randomBytes(32).toString('hex');
          await db.query("UPDATE frieren_site_accounts SET verification_token_hash=$2,verification_expires_at=NOW()+INTERVAL '24 hours',updated_at=NOW() WHERE id=$1",[account.id,hash(token)]);
          try{await mailVerification(account.email,token);}catch(e){console.error('Site verification resend failed:',e?.message||'unknown');}
        }
      }
      send(res,200,authPage('resend',sessionSecret,'email_sent'));return true;
    }
    if(path==='/reset-password'){
      if(limited('reset:'+addr,8)){send(res,429,authPage('reset',sessionSecret,'rate_limited'));return true;}
      const token=String(f.token||''),password=String(f.password||'');
      if(!/^[a-f0-9]{64}$/.test(token)||password!==String(f.confirmPassword||'')||password.length<10||password.length>128){send(res,400,authPage('reset',sessionSecret,'invalid_input',token));return true;}
      const passwordHash=await hashSitePassword(password);
      const updated=await db.query("UPDATE frieren_site_accounts SET password_hash=$2,reset_token_hash=NULL,reset_expires_at=NULL,updated_at=NOW() WHERE reset_token_hash=$1 AND reset_expires_at>NOW() AND email_verified_at IS NOT NULL RETURNING id",[hash(token),passwordHash]);
      send(res,updated.rowCount?200:400,authPage(updated.rowCount?'login':'reset',sessionSecret,updated.rowCount?'password_reset':'invalid_token'));return true;
    }
    return true;
  } catch(error) {
    console.error('Site account request failed:',error?.message||'unknown');
    const mode=path==='/register'?'register':path==='/forgot-password'?'forgot':path==='/reset-password'?'reset':path==='/resend-verification'?'resend':'login';
    send(res,503,authPage(mode,sessionSecret,'mail_error'));return true;
  }
}
