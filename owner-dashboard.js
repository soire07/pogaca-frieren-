import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getRenderServiceMetrics, renderMetricBars } from './owner-metrics.js';
import {
  auditOwnerAction, getOwnerOverview, getMaintenanceState, listPendingApprovals,
  reviewApproval, listUserMemories, deleteUserMemory, setMaintenanceState,
  sendOwnerAnnouncement, getRecentOwnerActivity
} from './owner-admin.js';
import { listOwnerPartnerLinks, saveOwnerPartnerLink, deleteOwnerPartnerLink, getOwnerRpgMetrics, updateGuildConfiguration, listGuildConfigurations, searchOwnerRpgPlayers, getOwnerRpgPlayerDetails, adjustOwnerRpgResources } from './owner-platform.js';
import { DEFAULT_GUILD_FEATURES, listGuildFeatureSettings, setGuildFeatureEnabled, resetGuildFeatureSetting } from './guild-feature-settings.js';
import { getOwnerDatabaseDiagnostics, getOwnerDatabaseTablePreview, renderOwnerWorkspace } from './owner-workspaces.js';

const OWNER_ID = '1553794496234262641';
const BASE_URL = process.env.OWNER_DASHBOARD_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://pogaca-frieren.onrender.com';
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
  { id: 'servers', label: 'Sunucu Yönetimi', command: null },
  { id: 'partners', label: 'Partnerlik', command: null },
  { id: 'rpg', label: 'RPG Yönetimi', command: null }
]);

export function getDiscordOAuthFailureDiagnostic(status, payload = {}) {
  const numericStatus = Number(status);
  const safeStatus = Number.isFinite(numericStatus) && numericStatus > 0 ? numericStatus : 0;
  const rawCode = typeof payload?.error === 'string' ? payload.error : '';
  const safeCode = /^[a-z0-9_]{1,64}$/i.test(rawCode) ? rawCode : 'unknown_error';
  return 'HTTP ' + safeStatus + '; ' + safeCode;
}

export function renderOwnerNavigation() {
  const groups = [
    { label: 'GENEL', ids: ['overview', 'system'] },
    { label: 'Frieren Poğaça', ids: ['servers', 'rpg', 'partners', 'behavior'] },
    { label: 'Frieren AI', ids: ['memories', 'approvals'] },
    { label: 'İŞLEMLER', ids: ['announcements', 'maintenance'] }
  ];
  const sections = new Map(OWNER_PANEL_SECTIONS.map(section => [section.id, section]));
  return '<nav class="nav" aria-label="Owner panel bölümleri">'
    + '<div class="nav-brand"><span class="nav-brand-mark">✧</span><strong>FRIEREN</strong><small>THE ARCANE SANCTUARY</small></div>'
    + groups.map(group => '<div class="nav-group"><div class="nav-group-title">' + group.label + '</div>'
      + group.ids.map(id => {
        const section = sections.get(id) || (id === 'behavior' ? { id: 'behavior', label: 'Komut ve davranışlar', command: null } : null);
        return section ? '<a href="#' + section.id + '" aria-label="' + section.label + '"><span class="nav-icon" aria-hidden="true">' + ({
          overview: '⌂', system: '◈', servers: '⌘', rpg: '✧', partners: '◇',
          memories: '✦', approvals: '⚝', announcements: '➤', maintenance: '◉'
        }[section.id] || '✧') + '</span><span class="nav-link-copy"><strong>' + section.label + '</strong>'
          + (section.command ? '<small>' + section.command + '</small>' : '') + '</span></a>' : '';
      }).join('') + '</div>').join('')
    + '<div class="nav-group"><div class="nav-group-title">ÇALIŞMA ALANLARI</div>'
    + '<a href="/owner/pogaca"><span class="nav-icon">✿</span><span class="nav-link-copy"><strong>Poğaça çalışma alanı</strong></span></a>'
    + '<a href="/owner/frieren-ai"><span class="nav-icon">✧</span><span class="nav-link-copy"><strong>Frieren AI merkezi</strong></span></a>'
    + '<a href="/owner/database"><span class="nav-icon">◈</span><span class="nav-link-copy"><strong>Veritabanı</strong></span></a>'
    + '<a href="/owner/settings"><span class="nav-icon">⚙</span><span class="nav-link-copy"><strong>Owner ayarları</strong></span></a></div>'
    + '<div class="nav-footer"><span class="nav-status-dot"></span> OWNER ACCESS · PRIVATE</div></nav>';
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

export function createOwnerOAuthState(secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('Owner OAuth signing secret is invalid');
  return sign({ purpose: 'discord-owner-oauth', nonce: randomBytes(32).toString('base64url'), exp: now + 10 * 60 * 1000 }, secret);
}

export function verifyOwnerOAuthState(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32) return false;
  const payload = unsign(token, secret);
  return payload?.purpose === 'discord-owner-oauth'
    && typeof payload.nonce === 'string' && payload.nonce.length >= 32
    && Number.isFinite(payload.exp) && payload.exp > now && payload.exp <= now + 10 * 60 * 1000 + 1000;
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
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#070d1c;color:#edf3ff;--line:rgba(143,178,235,.23);--muted:#9eb0d0}
  *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:22px}
  body{margin:0;min-height:100vh;padding:24px;background:radial-gradient(ellipse at 68% -8%,rgba(83,109,190,.38),transparent 39%),radial-gradient(ellipse at 12% 45%,rgba(38,100,158,.19),transparent 38%),linear-gradient(145deg,#070d1c,#0b1530 55%,#0a1022);overflow-x:hidden}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.42;background-image:radial-gradient(1px 1px at 12% 18%,#e4efff 99%,transparent),radial-gradient(1px 1px at 72% 12%,#d4e6ff 99%,transparent),radial-gradient(1.5px 1.5px at 88% 42%,#c6d9ff 99%,transparent),radial-gradient(1px 1px at 32% 72%,#e4efff 99%,transparent);background-size:420px 360px}
  main{position:relative;width:min(100%,1440px);margin:0 auto;padding-left:260px}
  .top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px;padding:10px 2px}
  .brand{font-family:Georgia,serif;font-size:22px;letter-spacing:.18em;color:#d9e9ff;text-shadow:0 0 24px #8ebeff66}.top .small{margin-top:5px;letter-spacing:.2em;font-size:9px;color:#849cc4}
  .hero,.panel{position:relative;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,rgba(15,31,64,.94),rgba(7,17,39,.94));padding:22px;box-shadow:0 18px 55px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.04);backdrop-filter:blur(15px)}
  .hero{margin-bottom:16px;overflow:hidden}.hero:before{content:"✧";position:absolute;right:25px;top:8px;font-size:100px;color:rgba(185,214,255,.08);pointer-events:none}
  .hero h1{margin:8px 0;font-family:Georgia,serif;font-weight:500;font-size:clamp(27px,3vw,38px);color:#f1f6ff;text-shadow:0 0 28px #9dc9ff44}
  .muted{color:var(--muted);font-size:13px;line-height:1.65}.tag{display:inline-block;padding:6px 10px;border:1px solid rgba(155,195,255,.32);border-radius:999px;background:rgba(101,150,222,.09);color:#cce5ff;font-size:10px;letter-spacing:.12em}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0}.stat{background:linear-gradient(145deg,rgba(20,42,82,.88),rgba(10,24,52,.9));border:1px solid rgba(123,165,230,.24);border-radius:13px;padding:15px}.stat small{display:block;color:#aabedc;margin-bottom:7px}.stat strong{font-size:21px;color:#f0f5ff}
  .columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px;margin:14px 0}
  .bot-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.bot-card{display:flex;align-items:center;gap:18px;min-height:150px;overflow:hidden}.bot-card.ai{background:radial-gradient(circle at 12% 50%,rgba(108,151,225,.28),transparent 42%),linear-gradient(140deg,rgba(18,39,79,.96),rgba(8,19,44,.96))}.bot-card.pogaca{background:radial-gradient(circle at 12% 50%,rgba(171,120,222,.24),transparent 42%),linear-gradient(140deg,rgba(38,29,73,.94),rgba(12,19,47,.96))}.bot-symbol{flex:0 0 64px;width:64px;height:64px;display:grid;place-items:center;border-radius:50%;font-size:34px;color:#d7e9ff;background:radial-gradient(circle,rgba(127,178,255,.3),rgba(53,86,155,.1));border:1px solid rgba(166,205,255,.36);box-shadow:0 0 30px rgba(106,158,255,.16)}.bot-card.pogaca .bot-symbol{color:#f1d8ff;background:radial-gradient(circle,rgba(194,147,255,.3),rgba(94,60,143,.1));border-color:rgba(205,166,255,.35)}.bot-card h2{margin:7px 0 4px}.bot-card p{margin:0 0 8px}
  .panel h2{font-family:Georgia,serif;font-size:18px;font-weight:500;color:#e4efff;margin:0 0 14px}.panel h3{font-size:14px;margin:18px 0 8px;color:#dceaff}
  .btn{display:inline-block;background:linear-gradient(120deg,#c4ddff,#a8b8ff);color:#101d3a;padding:10px 15px;border-radius:9px;text-decoration:none;font-weight:700;border:0;cursor:pointer}.btn.danger{background:#63364d;color:#ffe3ed}.btn.secondary{background:#1c3158;color:#e0eaff;border:1px solid #45618f}
  form{margin:9px 0}label{display:block;font-size:12px;color:#afc2e1;margin:9px 0 5px}input,select,textarea{display:block;width:100%;border:1px solid #334d79;border-radius:8px;background:#08152d;color:#f2f6ff;padding:10px;font:inherit}textarea{min-height:90px;resize:vertical}
  .actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.rowitem{border-top:1px solid rgba(125,162,220,.2);padding:12px 0}.rowitem:first-of-type{border-top:0}.mono{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}
  .data-table{width:100%;border-collapse:collapse;min-width:520px;font-size:12px}.data-table th,.data-table td{text-align:left;padding:10px;border-bottom:1px solid rgba(125,162,220,.2);vertical-align:top}.data-table th{color:#bcd2f4;background:rgba(85,122,184,.12)}.data-table td{color:#e1ebfc;max-width:280px;overflow-wrap:anywhere}
  .notice{border:1px solid #526e9c;background:#152b50;border-radius:10px;padding:11px;margin:12px 0}.good{color:#72e7b8}.warn{color:#f4ce83}.bad{color:#ff9aa8}.small{font-size:12px;color:#91a8ca}
  .metric-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:12px 0}.metric-charts{margin-top:10px}.metric-bars{height:84px;display:flex;align-items:flex-end;gap:4px;padding:8px 0;border-bottom:1px solid #405a85}.metric-bars i{display:block;flex:1;min-width:3px;max-width:18px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#c2dfff,#657dce);opacity:.9}.metrics-panel{margin:14px 0}
  .nav{position:fixed;left:max(18px,calc((100vw - 1440px)/2));top:22px;bottom:22px;width:232px;z-index:5;display:flex;flex-direction:column;gap:7px;overflow-y:auto;padding:14px;border:1px solid var(--line);border-radius:17px;background:linear-gradient(180deg,rgba(5,15,35,.96),rgba(8,21,47,.94));box-shadow:0 18px 55px #0006;backdrop-filter:blur(18px)}
  .nav:before{content:"✧ F R I E R E N";font-family:Georgia,serif;font-size:17px;letter-spacing:.08em;color:#d8eaff;padding:8px 8px 16px;border-bottom:1px solid rgba(135,174,231,.2);margin-bottom:7px}
  .nav a{display:flex;flex-direction:column;gap:4px;padding:11px 12px;border-radius:9px;text-decoration:none;color:#c6d8f4;font-size:13px;border:1px solid transparent}.nav a:hover,.nav a:focus{background:linear-gradient(100deg,rgba(38,91,164,.52),rgba(71,62,135,.22));border-color:rgba(133,179,247,.25);outline:none}.nav span{font:10px ui-monospace,monospace;color:#829dc6}
  .hero,.panel{scroll-margin-top:24px}
  @media(max-width:760px){body{padding:12px}main{padding-left:0}.bot-cards{grid-template-columns:1fr}.nav{position:sticky;top:6px;bottom:auto;left:auto;width:100%;max-height:190px;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;margin:0 0 14px;padding:8px}.nav:before{display:none}.nav a{flex:0 0 auto;min-width:116px}.hero,.panel{padding:16px}.hero h1{font-size:25px}}
  @media(prefers-reduced-motion:no-preference){.panel,.stat{transition:border-color .2s ease,transform .2s ease}.panel:hover{border-color:rgba(165,199,255,.38)}.stat:hover{transform:translateY(-2px)}}

  /* FRIEREN OWNER EXPERIENCE */
  body{background:radial-gradient(ellipse at 78% 0%,rgba(110,139,218,.25),transparent 34%),radial-gradient(ellipse at 4% 58%,rgba(69,112,181,.18),transparent 38%),linear-gradient(145deg,#050a18,#0b1530 52%,#080e21)}
  body:after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.2;background-image:radial-gradient(2px 2px at 18% 34%,#d9e9ff 99%,transparent),radial-gradient(1px 1px at 62% 64%,#fff 99%,transparent),radial-gradient(1px 1px at 91% 13%,#b9d6ff 99%,transparent);background-size:520px 460px;animation:owner-stars 11s ease-in-out infinite alternate}
  @keyframes owner-stars{from{opacity:.12;transform:translateY(0)}to{opacity:.34;transform:translateY(-8px)}}
  main{width:min(100%,1520px);padding-left:270px}
  .top{padding:16px 20px;border:1px solid rgba(171,199,255,.18);border-radius:17px;background:linear-gradient(100deg,rgba(19,36,74,.72),rgba(9,18,42,.52));box-shadow:0 12px 40px #0003}
  .brand{font-size:24px;letter-spacing:.24em;text-shadow:0 0 28px #b8d5ff88}
  .hero{background:radial-gradient(ellipse at 90% 15%,rgba(120,154,232,.24),transparent 40%),linear-gradient(145deg,rgba(18,35,73,.96),rgba(7,16,38,.97));border-color:rgba(180,207,255,.3);box-shadow:0 25px 80px #0005,inset 0 1px #fff1}
  .hero:after{content:"";position:absolute;right:0;top:0;width:42%;height:100%;pointer-events:none;opacity:.22;background:url('/assets/frieren.gif') right center/contain no-repeat;mask-image:linear-gradient(90deg,transparent,#000 32%)}
  .hero>*{position:relative;z-index:1}
  .hero h1{font-size:clamp(30px,4vw,46px);letter-spacing:.01em}
  .panel{background:linear-gradient(145deg,rgba(18,33,68,.94),rgba(7,16,37,.96));border-color:rgba(154,188,246,.2);box-shadow:0 16px 48px #0004,inset 0 1px #fff1;transition:transform .22s,border-color .22s,box-shadow .22s}
  .panel:hover{transform:translateY(-2px);border-color:rgba(178,207,255,.42);box-shadow:0 20px 55px #0005,0 0 25px #9fc7ff0c}
  .stat{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(28,52,99,.88),rgba(10,24,53,.95));border-color:rgba(148,186,248,.24);box-shadow:inset 0 1px #fff1}
  .stat:after{content:"✧";position:absolute;right:12px;top:5px;color:#d9eaff22;font-size:28px}
  .stat strong{font-family:Georgia,serif;font-size:24px;letter-spacing:.01em}
  .nav{width:244px;border-radius:20px;background:linear-gradient(180deg,rgba(7,17,40,.98),rgba(10,23,51,.96));border-color:rgba(173,202,255,.22);box-shadow:0 20px 70px #0008}
  .nav:before{font-size:18px;letter-spacing:.2em;padding:12px 8px 19px}
  .nav a{position:relative;overflow:hidden;border-radius:11px;padding:12px 13px;background:rgba(255,255,255,.015);transition:background .2s,border-color .2s,transform .2s}
  .nav a:hover,.nav a:focus{transform:translateX(3px);background:linear-gradient(100deg,rgba(57,111,190,.38),rgba(94,81,157,.2));border-color:rgba(161,198,255,.35);box-shadow:inset 3px 0 #bcd8ff}
  .btn{position:relative;overflow:hidden;box-shadow:0 7px 24px #8ebeff24;transition:transform .18s,filter .18s,box-shadow .18s}
  .btn:after{content:"";position:absolute;inset:-60% auto -60% -40%;width:28%;transform:rotate(24deg);background:linear-gradient(90deg,transparent,#fff8,transparent);transition:left .45s}
  .btn:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 10px 30px #9fc5ff40}
  .btn:hover:after{left:125%}
  input:focus,select:focus,textarea:focus{outline:2px solid #9fc5ff99;outline-offset:2px;border-color:#b8d5ff}
  .tag{box-shadow:0 0 22px #8ebeff12}
  .notice{border-color:#9cbfff66;background:linear-gradient(100deg,#172f56,#172747)}
  .rowitem{border-color:rgba(154,190,249,.17)}
  @media(max-width:760px){main{padding-left:0}.hero:after{width:100%;opacity:.12;background-position:right bottom;background-size:auto 65%}.nav{max-height:160px}.nav a{min-width:126px}.top{padding:12px}.hero h1{font-size:28px}}
  @media(prefers-reduced-motion:reduce){body:after{animation:none}.panel,.btn,.nav a{transition:none}}

  /* Arcane Sanctuary — reference-matched owner interface */
  :root{--line:rgba(126,164,238,.28);--muted:#a9badb;--ice:#dceaff;--blue:#315fca;--violet:#8e82e8}
  body{padding:14px;background:#030918 url('/assets/frieren.gif') center top/cover fixed no-repeat}
  body:before{opacity:.68;background:linear-gradient(180deg,rgba(3,8,25,.48),rgba(3,8,25,.9)),radial-gradient(ellipse at 50% 0%,rgba(83,125,231,.3),transparent 52%),radial-gradient(1px 1px at 20% 28%,#fff 99%,transparent);background-size:cover,cover,360px 320px}
  main{width:min(100%,1580px);padding-left:258px}
  .nav{left:max(14px,calc((100vw - 1580px)/2));top:14px;bottom:14px;width:230px;padding:13px 11px;border-radius:15px;background:linear-gradient(180deg,rgba(3,10,29,.97),rgba(5,15,38,.95));border-color:rgba(144,177,247,.32)}
  .nav:before{content:"✧  Frieren  ✧\\A Owner Panel\\A The Arcane Sanctuary";white-space:pre-line;line-height:1.65;letter-spacing:.04em;font-size:18px;text-align:center;padding:12px 6px 17px}
  .nav a{flex-direction:row;align-items:center;gap:10px;min-height:39px;padding:9px 11px;border-radius:8px;font-size:12px}
  .nav a:before{content:"✧";color:#8fb5ff;font-size:14px}
  .nav a:hover,.nav a:focus{transform:none;background:linear-gradient(90deg,rgba(29,83,174,.68),rgba(56,69,137,.22));box-shadow:inset 3px 0 #8cb7ff}
  .top{margin-bottom:12px;padding:12px 18px;background:rgba(4,13,34,.7);border-color:rgba(148,181,247,.27);border-radius:12px}
  .brand{font-size:24px;letter-spacing:.06em}
  .hero{min-height:180px;padding:28px 30px;background:linear-gradient(90deg,rgba(4,13,36,.97) 0%,rgba(5,17,45,.88) 42%,rgba(5,17,45,.2) 100%),url('/assets/frieren.gif') right 42%/auto 155% no-repeat,linear-gradient(120deg,#0b1d4a,#111b45);border-radius:13px;border-color:rgba(142,177,246,.38)}
  .hero:before{content:"";right:0;top:0;width:100%;height:100%;font-size:0;background:linear-gradient(90deg,transparent 58%,rgba(7,16,42,.06));}
  .hero:after{display:none}
  .hero h1{font-size:clamp(28px,3vw,40px);margin:8px 0 5px}
  .grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
  .stat{min-height:88px;padding:13px 14px;border-radius:11px;background:linear-gradient(145deg,rgba(9,27,66,.96),rgba(4,15,39,.96));border-color:rgba(111,153,229,.3)}
  .stat small{font-size:11px;letter-spacing:.01em}
  .stat strong{font-size:21px}
  .bot-cards{gap:12px}
  .bot-card{min-height:116px;padding:17px 20px}
  .bot-symbol{width:54px;height:54px;flex-basis:54px;font-size:28px}
  .panel{border-radius:12px;background:linear-gradient(145deg,rgba(8,23,56,.96),rgba(4,13,34,.97));border-color:rgba(112,153,225,.28);padding:19px}
  .panel h2{font-family:Georgia,serif;font-size:19px}
  .columns{gap:12px}
  .btn{background:linear-gradient(110deg,#426cf0,#6478e9);color:white;border:1px solid rgba(180,201,255,.22);border-radius:7px}
  .btn.secondary{background:rgba(19,42,86,.92);color:#dceaff}
  .tag{border-radius:5px;background:rgba(43,78,150,.28);letter-spacing:.08em}
  .notice{border-radius:8px}
  @media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:760px){
    body{padding:8px;background-position:62% top;background-size:auto 420px}
    main{padding-left:0}
    .nav{position:sticky;top:5px;left:auto;width:100%;max-height:128px;bottom:auto;margin-bottom:10px;padding:7px;background:rgba(3,10,29,.97)}
    .nav:before{display:none}
    .nav a{min-width:max-content;min-height:34px;padding:8px 10px}
    .nav a:before{display:none}
    .top{padding:10px 12px}
    .brand{font-size:18px}
    .hero{min-height:165px;padding:20px 17px;background-position:center,right 35%;background-size:auto,auto 115%,cover}
    .hero h1{font-size:26px}
    .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .stat{min-height:78px;padding:11px}
    .stat strong{font-size:18px}
    .panel{padding:14px}
    .bot-card{min-height:100px}
  }
  @media(prefers-reduced-motion:reduce){body:after{animation:none}.panel,.btn,.nav a{transition:none}}


  /* Owner sanctuary v2 — structured workspace, responsive navigation and usable controls */
  :root{--surface:#09152f;--surface-raised:#102247;--stroke:rgba(145,177,241,.22);--text:#edf4ff;--muted:#a8bad9;--accent:#9dbdff;--accent-violet:#b5a2ff}
  body{padding:18px;background:radial-gradient(ellipse at 82% 4%,rgba(90,119,205,.2),transparent 32%),radial-gradient(ellipse at 12% 72%,rgba(58,108,170,.16),transparent 36%),linear-gradient(145deg,#030817 0%,#08152f 48%,#080d20 100%)}
  body:before{opacity:.34;background-size:480px 410px}
  main{width:min(100%,1600px);padding-left:278px}
  .nav{left:max(18px,calc((100vw - 1600px)/2));top:18px;bottom:18px;width:242px;gap:14px;padding:15px 12px;border-radius:18px;border:1px solid rgba(149,181,242,.25);background:linear-gradient(180deg,rgba(5,14,34,.98),rgba(8,20,47,.97));box-shadow:0 22px 70px rgba(0,0,0,.48)}
  .nav:before{display:none}
  .nav-brand{display:grid;grid-template-columns:34px 1fr;align-items:center;column-gap:9px;padding:8px 8px 17px;border-bottom:1px solid var(--stroke)}
  .nav-brand-mark{grid-row:span 2;display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(164,195,255,.38);border-radius:11px;background:linear-gradient(145deg,#263f7b,#17274f);color:#e5efff;font-size:20px}
  .nav-brand strong{font:600 16px Georgia,serif;letter-spacing:.18em;color:#e8f1ff}
  .nav-brand small{font-size:8px;letter-spacing:.16em;color:#839dc8}
  .nav-group{display:grid;gap:5px}
  .nav-group-title{padding:2px 10px 5px;color:#718bb9;font-size:9px;font-weight:800;letter-spacing:.18em}
  .nav a{display:flex;flex-direction:row;align-items:center;gap:10px;min-height:44px;padding:8px 10px;border:1px solid transparent;border-radius:10px;background:transparent;color:#c8d8f2}
  .nav a:before{display:none}
  .nav a:hover,.nav a:focus{transform:translateX(2px);background:linear-gradient(100deg,rgba(57,102,183,.3),rgba(106,91,173,.12));border-color:rgba(148,185,250,.25);box-shadow:inset 3px 0 #a9c7ff}
  .nav-icon{display:grid;place-items:center;flex:0 0 28px;height:28px;border-radius:8px;background:rgba(110,151,225,.11);color:#b9d2ff;font-size:15px}
  .nav-link-copy{display:grid;gap:3px;min-width:0}
  .nav-link-copy strong{font-size:12px;font-weight:600;color:#dce8fc}
  .nav-link-copy small{font:9px ui-monospace,monospace;color:#8199c2}
  .nav-footer{margin-top:auto;padding:12px 9px 5px;border-top:1px solid var(--stroke);font-size:9px;letter-spacing:.1em;color:#8299bd}
  .nav-status-dot{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#73ddb0;box-shadow:0 0 10px #73ddb088}
  .top{position:relative;margin-bottom:16px;padding:13px 18px;border-radius:14px;background:rgba(9,22,49,.78);border-color:var(--stroke)}
  .brand{font-size:20px;letter-spacing:.14em}
  .hero{min-height:205px;padding:30px 32px;margin-bottom:17px;border-radius:16px;border-color:rgba(151,184,246,.3);background:linear-gradient(90deg,rgba(5,14,36,.98) 0%,rgba(7,20,49,.88) 52%,rgba(7,20,49,.34) 100%),url('/assets/frieren.gif') right center/auto 150% no-repeat,linear-gradient(120deg,#10295b,#121c43);box-shadow:0 24px 70px #0005}
  .hero h1{font-size:clamp(30px,3.6vw,44px)}
  .hero .muted{max-width:660px}
  .grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:15px 0 18px}
  .stat{min-height:92px;border-radius:13px;padding:14px;background:linear-gradient(145deg,rgba(17,39,81,.95),rgba(7,20,48,.98));border-color:rgba(127,164,232,.23)}
  .stat small{font-size:11px;color:#a9bddf}
  .stat strong{font:600 23px Georgia,serif}
  .bot-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .bot-card{align-items:flex-start;min-height:220px;padding:20px;gap:15px;border-radius:15px}
  .bot-card.ai{background:radial-gradient(circle at 10% 12%,rgba(102,157,238,.25),transparent 45%),linear-gradient(145deg,#102a58,#091833)}
  .bot-card.pogaca{background:radial-gradient(circle at 10% 12%,rgba(176,127,232,.23),transparent 45%),linear-gradient(145deg,#28234f,#111a3a)}
  .bot-card-content{min-width:0;flex:1}
  .bot-card h2{font:500 23px Georgia,serif;color:#edf4ff}
  .bot-card p{min-height:42px;margin:5px 0 10px}
  .bot-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
  .bot-card-actions .btn{font-size:11px;padding:8px 10px}
  .panel{padding:21px;border-radius:15px;background:linear-gradient(145deg,rgba(12,29,64,.97),rgba(5,15,37,.98));border-color:rgba(135,169,232,.22)}
  .panel h2{font-size:20px;margin-bottom:8px}
  .panel h3{font-size:14px}
  .panel>.muted{margin:0 0 15px}
  .columns{gap:14px;margin:15px 0}
  .feature-setting{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:8px;padding:13px 0}
  .feature-setting>div{min-width:0}
  .feature-setting .small{margin-top:4px}
  .inline-toggle{display:flex;align-items:center;gap:7px;white-space:nowrap;margin:0}
  .inline-toggle input{width:17px;height:17px;accent-color:#9bbcff}
  form{margin:12px 0}
  input,select,textarea{border-color:rgba(121,157,221,.34);background:rgba(3,12,31,.82);border-radius:9px;padding:11px 12px}
  input[type=checkbox]{width:auto;accent-color:#9bbcff}
  label{font-size:12px;color:#b8c9e6}
  .btn{border-radius:9px;background:linear-gradient(115deg,#527ff0,#786fe0);box-shadow:0 6px 20px rgba(75,112,208,.2)}
  .btn.secondary{background:rgba(29,51,94,.9);border:1px solid rgba(133,169,232,.25);color:#dceaff;box-shadow:none}
  .btn.danger{background:linear-gradient(115deg,#813f61,#62304f);color:#ffe8f0}
  .rowitem{padding:14px 0;border-color:rgba(134,169,231,.18)}
  .notice{border-radius:11px;background:rgba(33,62,111,.72);border-color:rgba(149,185,247,.32)}
  .metrics-panel{margin:15px 0}
  .hero,.panel{scroll-margin-top:18px}
  @media(max-width:1100px){main{padding-left:250px}.nav{width:218px}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.feature-setting{grid-template-columns:minmax(0,1fr) auto auto}}
  @media(max-width:760px){
    body{padding:9px}
    main{padding-left:0}
    .nav{position:sticky;top:5px;left:auto;bottom:auto;width:100%;max-height:none;display:flex;flex-direction:row;align-items:stretch;gap:8px;overflow-x:auto;margin:0 0 11px;padding:8px;border-radius:12px}
    .nav-brand{display:none}
    .nav-group{display:flex;flex:0 0 auto;align-items:center;gap:5px}
    .nav-group-title{display:none}
    .nav a{flex:0 0 auto;min-height:38px;padding:7px 9px;gap:7px}
    .nav a:hover,.nav a:focus{transform:none}
    .nav-icon{flex-basis:22px;height:22px;font-size:12px}
    .nav-link-copy strong{font-size:11px;white-space:nowrap}
    .nav-link-copy small{display:none}
    .nav-footer{display:none}
    .top{padding:10px 12px}
    .hero{min-height:175px;padding:21px 17px;background-position:center,right 35%;background-size:auto,auto 120%,cover}
    .hero h1{font-size:27px}
    .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .stat{min-height:78px;padding:11px}
    .stat strong{font-size:18px}
    .bot-cards{grid-template-columns:1fr}
    .bot-card{min-height:0;padding:15px}
    .bot-card p{min-height:0}
    .panel{padding:15px}
    .feature-setting{grid-template-columns:minmax(0,1fr) auto;gap:8px}
    .feature-setting .btn{grid-column:auto}
    .feature-setting .btn.secondary{font-size:10px;padding:8px}
    .columns{grid-template-columns:1fr}
  }
  @media(max-width:390px){.nav a{padding:6px 7px}.nav-icon{display:none}.nav-link-copy strong{font-size:10px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

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

function renderRenderMetrics(metrics, overview) {
  if (metrics?.status === 'available') {
    return '<section class="panel metrics-panel"><div class="metric-heading"><div><h2>Render kaynak kullanımı</h2><p class="muted">Gerçek Render servis metrikleri · Son 60 dakika</p></div><span class="tag good">RENDER API BAĞLI</span></div>'
      + '<div class="metric-grid"><div class="stat"><small>CPU kullanımı</small><strong>' + metrics.cpuPercent.toFixed(1) + '%</strong><div class="small">' + metrics.cpuUsed.toFixed(3) + ' / ' + metrics.cpuCapacity.toFixed(2) + ' CPU</div></div>'
      + '<div class="stat"><small>RAM kullanımı</small><strong>' + metrics.memoryPercent.toFixed(1) + '%</strong><div class="small">' + formatBytes(metrics.memoryUsedBytes) + ' / ' + formatBytes(metrics.memoryLimitBytes) + '</div></div></div>'
      + '<div class="columns metric-charts"><div><h3>CPU · Son 24 ölçüm</h3>' + renderMetricBars(metrics.points, 'cpuPercent', 'Render CPU kullanımı yüzdesi') + '</div><div><h3>RAM · Son 24 ölçüm</h3>' + renderMetricBars(metrics.points, 'memoryPercent', 'Render RAM kullanımı yüzdesi') + '</div></div>'
      + '<p class="small">Son ölçüm: ' + escapeHtml(new Date(metrics.updatedAt).toLocaleString('tr-TR')) + ' · Ölçüm aralığı 60 saniye</p></section>';
  }
  const statusText = metrics?.status === 'not_configured'
    ? 'Render API anahtarı henüz tanımlanmadı. Render CPU/RAM grafikleri için RENDER_API_KEY ortam değişkeni eklenmeli.'
    : (metrics?.message || 'Render metrikleri şu anda alınamıyor.');
  return '<section class="panel metrics-panel"><div class="metric-heading"><div><h2>Render kaynak kullanımı</h2><p class="muted">Render host metrikleri henüz bağlı değil.</p></div><span class="tag warn">YEREL ÖLÇÜM</span></div>'
    + '<div class="metric-grid"><div class="stat"><small>Node.js RSS</small><strong>' + formatBytes(overview.rssBytes) + '</strong><div class="small">Bu süreç için ayrılan fiziksel bellek</div></div>'
    + '<div class="stat"><small>Node.js heap</small><strong>' + formatBytes(overview.heapUsedBytes) + '</strong><div class="small">JavaScript heap kullanımı</div></div></div>'
    + '<div class="notice warn">' + escapeHtml(statusText) + '</div><p class="small">Yerel Node.js bellek ölçümleri Render servisinin toplam RAM kullanımının yerine geçmez. CPU yüzdesi bu durumda gösterilmez.</p></section>';
}

export function renderOwnerBotCards(overview, aiReadiness) {
  const aiReady = aiReadiness?.status === 'ok' && aiReadiness?.discordReady === true
    && aiReadiness?.memoryDatabaseReady === true && aiReadiness?.modelConfigured === true;
  const aiState = aiReady ? 'Çevrimiçi' : 'Kontrol gerekli';
  return '<section class="columns bot-cards" aria-label="Bot çalışma alanları">'
    + '<article class="panel bot-card ai"><div class="bot-symbol">✧</div><div class="bot-card-content"><span class="tag">AI · TEST & HAFIZA</span><h2>Frieren AI</h2><p class="muted">Kod denetimi, senaryo testleri ve kalıcı hafıza için ayrı asistan.</p><strong class="' + (aiReady ? 'good' : 'warn') + '">' + aiState + '</strong><div class="bot-card-actions"><a class="btn secondary" href="#memories">AI hafızası</a><a class="btn secondary" href="#approvals">Teknik talepler</a></div></div></article>'
    + '<article class="panel bot-card pogaca"><div class="bot-symbol">✿</div><div class="bot-card-content"><span class="tag">EĞLENCE · RPG</span><h2>Frieren Poğaça</h2><p class="muted">Anime, karakterler, büyüler, görevler, zindanlar ve ekonomi.</p><strong class="' + (overview.ready ? 'good' : 'bad') + '">' + (overview.ready ? 'Çevrimiçi' : 'Çevrimdışı') + '</strong><div class="bot-card-actions"><a class="btn secondary" href="#rpg">RPG merkezi</a><a class="btn secondary" href="#behavior">Komut ve davranışlar</a></div></div></article>'
    + '</section>';
}

export async function getFrierenAIReadiness({
  fetchImpl = globalThis.fetch,
  baseUrl = 'http://127.0.0.1:' + (process.env.PORT || 3000)
} = {}) {
  try {
    const response = await fetchImpl(baseUrl + '/ai-ready', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

function renderDashboard({ session, overview, client, approvals, memories, memoryUser, notice, activity, renderMetrics, aiReadiness, partners, rpgMetrics, guildConfigurations, featureSettingsByGuild }) {
  const featureLabels = { commands: 'Tüm komutlar', rpg: 'RPG sistemi', character: 'Karakter sistemi', magic: 'Büyü ve yetenekler', equipment: 'Ekipman ve eşyalar', economy: 'Ekonomi ve mağaza', quests: 'Görevler', dungeons: 'Zindanlar', bosses: 'Boss sistemi', trading: 'Takas', messageXp: 'Mesaj XP kazanımı', aiChat: 'Frieren sohbet etkileşimi' };
  const guilds = [...client.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  const channelOptions = guilds.flatMap(guild => [...guild.channels.cache.values()]
    .filter(channel => channel.isTextBased?.() && channel.send)
    .map(channel => `<option value="${escapeHtml(guild.id)}:${escapeHtml(channel.id)}">${escapeHtml(guild.name)} / #${escapeHtml(channel.name)}</option>`)).join('');
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
  const configByGuild = new Map(guildConfigurations.map(row => [String(row.guild_id), row]));
  const serverManagementHtml = guilds.map(guild => {
    const config = configByGuild.get(guild.id) || {};
    const channels = [...guild.channels.cache.values()].filter(channel => channel.isTextBased?.() && channel.send);
    const options = selected => '<option value="">Kapalı / seçilmedi</option>' + channels.map(channel => '<option value="' + escapeHtml(channel.id) + '"' + (String(selected || '') === channel.id ? ' selected' : '') + '>#' + escapeHtml(channel.name) + '</option>').join('');
    return '<article class="panel"><h3>' + escapeHtml(guild.name) + '</h3><div class="small">Sunucu ID: ' + escapeHtml(guild.id) + ' · Üye: ' + Number(guild.memberCount || 0) + '</div>'
      + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(session.csrf) + '"><input type="hidden" name="action" value="guild-config"><input type="hidden" name="guildId" value="' + escapeHtml(guild.id) + '">'
      + '<label>Karşılama kanalı</label><select name="welcomeChannelId">' + options(config.welcome_channel_id) + '</select>'
      + '<label>Karşılama mesajı</label><textarea name="welcomeMessage" maxlength="300">' + escapeHtml(config.welcome_message || 'Hoş geldin {user}! 🥐 {server} sunucusuna katıldın.') + '</textarea><div class="small">{user} ve {server} yer tutucuları kullanılabilir.</div><button class="btn">Ayarları kaydet</button></form></article>';
  }).join('');
  const partnerHtml = partners.length ? partners.map(row => '<div class="rowitem"><strong>' + escapeHtml(row.partner_name) + '</strong><div class="small">Sunucu: ' + escapeHtml(row.guild_id) + ' · ' + escapeHtml(row.status) + '</div><a class="small" href="' + escapeHtml(row.invite_url) + '" target="_blank" rel="noopener">Davet bağlantısı ↗</a>'
    + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(session.csrf) + '"><input type="hidden" name="action" value="partner-delete"><input type="hidden" name="id" value="' + Number(row.id) + '"><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Silmeyi onaylıyorum</label><button class="btn danger">Partner kaydını sil</button></form></div>').join('') : '<p class="muted">Henüz partner kaydı yok.</p>';
  const featureManagementHtml = guilds.map(guild => {
    const saved = new Map((featureSettingsByGuild.get(guild.id) || []).map(row => [row.feature_key, row]));
    const keys = [...Object.keys(DEFAULT_GUILD_FEATURES), ...[...client.commands.keys()].map(name => 'command_' + name.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))];
    const uniqueKeys = [...new Set(keys)];
    const rows = uniqueKeys.map(key => {
      const row = saved.get(key);
      const enabled = row ? row.enabled === true : (DEFAULT_GUILD_FEATURES[key] ?? true);
      const label = featureLabels[key] || (key.startsWith('command_') ? '/' + key.slice(8).replace(/_/g, '-') : key);
      return '<form method="post" action="/owner/action" class="rowitem feature-setting"><input type="hidden" name="csrf" value="' + escapeHtml(session.csrf) + '"><input type="hidden" name="action" value="feature-setting"><input type="hidden" name="guildId" value="' + escapeHtml(guild.id) + '"><input type="hidden" name="featureKey" value="' + escapeHtml(key) + '"><div><strong>' + escapeHtml(label) + '</strong><div class="small">' + (row ? 'Sunucuya özel ayar' : 'Genel varsayılan: açık') + '</div></div><label class="inline-toggle"><input type="checkbox" name="enabled" value="yes"' + (enabled ? ' checked' : '') + '> Açık</label><button class="btn secondary" name="featureAction" value="save">Kaydet</button><button class="btn secondary" name="featureAction" value="reset">Varsayılana döndür</button></form>';
    }).join('');
    return '<article class="panel"><h3>' + escapeHtml(guild.name) + '</h3><div class="small">Sunucu ID: ' + escapeHtml(guild.id) + '</div>' + rows + '</article>';
  }).join('');
  const rpgHtml = '<div class="grid"><div class="stat"><small>Oyuncu</small><strong>' + rpgMetrics.players + '</strong></div><div class="stat"><small>Ortalama seviye</small><strong>' + rpgMetrics.averageLevel.toFixed(1) + '</strong></div><div class="stat"><small>Toplam oyun parası</small><strong>' + rpgMetrics.totalCoins.toLocaleString('tr-TR') + '</strong></div><div class="stat"><small>Envanter yığını / eşya</small><strong>' + rpgMetrics.inventoryStacks + ' / ' + rpgMetrics.itemCount + '</strong></div><div class="stat"><small>Boss zaferi</small><strong>' + rpgMetrics.bossWins + '</strong></div><div class="stat"><small>Zindan zaferi</small><strong>' + rpgMetrics.dungeonWins + '</strong></div></div><p class="muted">Mevcut PostgreSQL oyun verilerinden salt okunur ölçüm. Oyuncu ve ekonomi kayıtları bu ekrandan değiştirilmez.</p>';
  const noticeText = ({
    maintenance_on: 'Bakım modu açıldı.',
    maintenance_off: 'Bakım modu kapatıldı.',
    approval_approved: 'Talep onaylandı. Kod otomatik çalıştırılmadı.',
    approval_rejected: 'Talep reddedildi.',
    memory_deleted: 'Hafıza kaydı silindi.',
    announcement_sent: 'Duyuru seçilen kanala gönderildi.',
    guild_config_saved: 'Sunucu ayarları kaydedildi.',
    feature_saved: 'Bot davranışı bu sunucu için kaydedildi.',
    feature_reset: 'Sunucu ayarı genel varsayılana döndürüldü.',
    partner_saved: 'Partner kaydı kaydedildi.',
    partner_deleted: 'Partner kaydı silindi.',
    invalid: 'İşlem tamamlanamadı. Alanları ve bot izinlerini kontrol et.'
  })[notice] || '';
  return page('Owner Kontrol Merkezi', `
    <div class="top"><div><div class="brand">FRIEREN · PRIVATE OPERATIONS</div><div class="small">OWNER CONTROL CENTER</div></div>
      <form method="post" action="/owner/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="btn secondary">Güvenli çıkış</button></form>
    </div>
    ${renderOwnerNavigation()}
    <section class="hero" id="overview"><span class="tag">OWNER · DOĞRULANDI</span><h1>Frieren Kontrol Merkezi</h1><p class="muted">Bu panel yalnızca yetkili Discord hesabına açıktır. İki botun sunucu içi davranışını tek merkezden yönet.</p>
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
      ${renderOwnerBotCards(overview, aiReadiness)}
      <section class="panel" id="servers"><h2>Sunucu ve karşılama yönetimi</h2><p class="muted">Bağlı sunucuların karşılama ayarlarını ayrı ayrı yönet. Kaydetmeden önce bot izinleri doğrulanır.</p><div class="columns">${serverManagementHtml}</div></section>
      <section class="panel" id="partners"><h2>Partnerlik yönetimi</h2><p class="muted">Partner sunucularını kaydet, davet bağlantılarını güncelle ve kayıtları denetim altında tut.</p><form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="action" value="partner-save"><label>Partner sunucu adı</label><input name="partnerName" maxlength="80" required><label>Discord sunucu ID</label><input name="partnerGuildId" inputmode="numeric" pattern="[0-9]{17,20}" required><label>Discord davet bağlantısı</label><input name="partnerInvite" type="url" placeholder="https://discord.gg/..." required><button class="btn">Partner ekle / güncelle</button></form>${partnerHtml}</section>
      <section class="panel" id="behavior"><h2>Bot davranışları ve komutlar</h2><p class="muted">Ayarlar seçilen sunucuyla sınırlıdır. Komut kapatma gerçek etkileşim yönlendirmesinde uygulanır.</p><div class="columns">${featureManagementHtml}</div></section>
      <section class="panel" id="rpg"><h2>RPG sistem istatistikleri</h2>${rpgHtml}</section>
      ${renderRenderMetrics(renderMetrics, overview)}
      <div class="actions"><a class="btn secondary" href="/owner">Durumu yenile</a><span class="small">Canlı süreç ölçümleri · Son sayfa yüklemesi</span></div>
    </section>
    <div class="columns">
      <section class="panel" id="maintenance"><h2>Bakım modu</h2><p class="muted">Açıldığında normal kullanıcı komutları ve Frieren sohbeti durdurulur. Owner komutları çalışmaya devam eder.</p>
        <form method="post" action="/owner/action" class="actions"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Bakım modu değişikliğini onaylıyorum</label><button class="btn" name="action" value="maintenance-on">Bakımı aç</button><button class="btn secondary" name="action" value="maintenance-off">Bakımı kapat</button></form>
      </section>
      <section class="panel" id="announcements"><h2>Duyuru gönder</h2><p class="muted">Yalnızca seçtiğin sunucu ve kanala gönderilir. Botun kanalda mesaj gönderme izni olmalıdır.</p>
        <form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="action" value="announcement-send">
          <label>Hedef sunucu ve metin kanalı</label><select name="target" required><option value="">Sunucu / kanal seç</option>${channelOptions}</select>
          <label>Duyuru metni</label><textarea name="message" maxlength="1800" required placeholder="Duyuru içeriği..."></textarea><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Seçtiğim kanala bu duyurunun gönderilmesini onaylıyorum</label>
          <button class="btn">Duyuruyu gönder</button>
        </form>
      </section>
    </div>
    <div class="columns">
      <section class="panel" id="approvals"><h2>Teknik talep onayları</h2><p class="muted">Onay/ret yalnızca talebin durumunu değiştirir; hiçbir kod otomatik çalıştırılmaz.</p>${approvalHtml}</section>
      <section class="panel" id="memories"><h2>Kullanıcı hafızaları</h2><p class="muted">Yalnızca mevcut Frieren hafıza kayıtları listelenir. Silme işlemi kalıcıdır.</p>
        <form method="get" action="/owner"><label>Discord kullanıcı ID</label><input name="memoryUser" value="${escapeHtml(memoryUser)}" inputmode="numeric" placeholder="Örn. 123456789012345678" required><button class="btn secondary">Hafızaları getir</button></form>
        ${memoryHtml}
      </section>
    </div>

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
    const state = createOwnerOAuthState(sessionSecret);
    const location = new URL('https://discord.com/oauth2/authorize');
    location.search = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state
    }).toString();
    res.writeHead(302, { Location: location.toString(), 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }

  if (url.pathname === '/owner/callback' && req.method === 'GET') {
    const receivedState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!verifyOwnerOAuthState(receivedState, sessionSecret) || !code) {
      send(res, 400, page('Giriş reddedildi', '<h1>Giriş doğrulanamadı</h1><p>OAuth doğrulaması geçersiz veya süresi dolmuş. Yeniden giriş yap.</p>'));
      return true;
    }
    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) {
        const errorPayload = await tokenResponse.json().catch(() => ({}));
        throw new Error('OAuth token exchange failed (' + getDiscordOAuthFailureDiagnostic(tokenResponse.status, errorPayload) + ')');
      }
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

  const workspaceKinds = {
    '/owner/frieren-ai': 'ai',
    '/owner/pogaca': 'pogaca',
    '/owner/database': 'database',
    '/owner/settings': 'settings'
  };
  if (workspaceKinds[url.pathname] && req.method === 'GET') {
    try {
      const kind = workspaceKinds[url.pathname];
      const data = {};
      if (kind === 'ai') { data.aiReadiness = await getFrierenAIReadiness(); data.csrf = session.csrf; }
      if (kind === 'pogaca') {
        data.notice = url.searchParams.get('notice') || '';
        data.rpgMetrics = await getOwnerRpgMetrics(db);
        data.csrf = session.csrf;
        data.guildOptions = [...(client?.guilds?.cache?.values?.() || [])].map(guild => ({ id: String(guild.id), name: String(guild.name || guild.id) }));
        const requestedGuild = String(url.searchParams.get('guildId') || '');
        data.guildId = data.guildOptions.some(guild => guild.id === requestedGuild) ? requestedGuild :
          (data.guildOptions.some(guild => guild.id === '1539562273197260860') ? '1539562273197260860' : (data.guildOptions[0]?.id || ''));
        data.search = String(url.searchParams.get('search') || '').slice(0,80);
        if (data.guildId) data.players = await searchOwnerRpgPlayers(db, { guildId: data.guildId, query: data.search });
        const playerId = String(url.searchParams.get('userId') || '');
        if (playerId && data.guildId) data.player = await getOwnerRpgPlayerDetails(db, { guildId: data.guildId, userId: playerId });
      }
      if (kind === 'database') {
        data.database = await getOwnerDatabaseDiagnostics(db);
        const table = String(url.searchParams.get('table') || '');
        if (table) data.preview = await getOwnerDatabaseTablePreview(db, { table, search: url.searchParams.get('search') || '' });
      }
      if (kind === 'settings') data.settings = [
        { label: 'Discord OAuth istemcisi', configured: Boolean(process.env.CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) },
        { label: 'Owner oturum imzası', configured: Boolean(process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32) },
        { label: 'PostgreSQL bağlantısı', configured: Boolean(db) },
        { label: 'Frieren AI köprü anahtarı', configured: Boolean(process.env.FRIEREN_BRIDGE_SECRET || process.env.FRIEREN_AI_BRIDGE_SECRET) },
        { label: 'Render API metrikleri', configured: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) }
      ];
      const content = renderOwnerNavigation() + '<div class="top"><div><div class="brand">FRIEREN</div><div class="small">THE ARCANE SANCTUARY · OWNER WORKSPACE</div></div><a class="btn secondary" href="/owner">Genel bakış</a></div>'
        + renderOwnerWorkspace(kind, data);
      send(res, 200, page(kind === 'ai' ? 'Frieren AI' : kind === 'pogaca' ? 'Poğaça Frieren' : kind === 'database' ? 'PostgreSQL' : 'Owner ayarları', content));
    } catch (error) {
      console.error('Owner workspace load failed:', error?.message || error);
      send(res, 503, page('Çalışma alanı yüklenemedi', '<h1>Çalışma alanı yüklenemedi</h1><p>Bağlantı ve veritabanı durumunu kontrol et.</p><a class="btn" href="/owner">Panele dön</a>'));
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
      if (action === 'rpg-resource-adjust' && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        await adjustOwnerRpgResources(db, {
          guildId,
          userId: form.get('userId'),
          coinsDelta: Number(form.get('coinsDelta') || 0),
          xpDelta: Number(form.get('xpDelta') || 0),
          reason: form.get('reason'),
          actorId: OWNER_ID
        });
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&userId=' + encodeURIComponent(form.get('userId')) + '&notice=rpg_saved');
        return true;
      }
      if (action === 'ai-test-run' && form.get('confirm') === 'yes') {
        const secret = process.env.FRIEREN_BRIDGE_SECRET || process.env.FRIEREN_AI_BRIDGE_SECRET || '';
        if (secret.length < 32) throw new Error('AI_TEST_BRIDGE_NOT_CONFIGURED');
        const rawCommands = String(form.get('commands') || '');
        const commands = rawCommands.split(/[\x09-\x0d ,;]+/).map(value => value.trim()).filter(Boolean).slice(0, 80);
        const response = await fetch(BASE_URL + '/internal/test-suite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
          body: JSON.stringify({ commands }),
          signal: AbortSignal.timeout(45000)
        });
        const report = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('AI_TEST_RUN_FAILED_' + response.status);
        const content = renderOwnerNavigation() + '<div class="top"><div><div class="brand">FRIEREN</div><div class="small">THE ARCANE SANCTUARY · TEST RAPORU</div></div><a class="btn secondary" href="/owner/frieren-ai">AI merkezine dön</a></div>'
          + renderOwnerWorkspace('ai', { aiReadiness: await getFrierenAIReadiness(), csrf: session.csrf, testReport: report });
        send(res, 200, page('Frieren AI test raporu', content));
        return true;
      }
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
      } else if (action === 'feature-setting') {
        const guildId = String(form.get('guildId') || '');
        const featureKey = String(form.get('featureKey') || '');
        if (form.get('featureAction') === 'reset') {
          await resetGuildFeatureSetting(db, { guildId, featureKey });
          notice = 'feature_reset';
        } else {
          await setGuildFeatureEnabled(db, { guildId, featureKey, enabled: form.get('enabled') === 'yes', actorId: OWNER_ID });
          notice = 'feature_saved';
        }
      } else if (action === 'guild-config') {
        await updateGuildConfiguration(db, client, {
          guildId: form.get('guildId'), welcomeChannelId: form.get('welcomeChannelId') || null,
          logChannelId: form.get('logChannelId') || null, welcomeMessage: form.get('welcomeMessage'), actorId: OWNER_ID
        });
        notice = 'guild_config_saved';
      } else if (action === 'partner-save') {
        await saveOwnerPartnerLink(db, { guildId: form.get('partnerGuildId'), name: form.get('partnerName'), inviteUrl: form.get('partnerInvite') }, OWNER_ID);
        notice = 'partner_saved';
      } else if (action === 'partner-delete' && form.get('confirm') === 'yes') {
        const removed = await deleteOwnerPartnerLink(db, form.get('id'), OWNER_ID);
        notice = removed ? 'partner_deleted' : 'invalid';
      } else if (action === 'announcement-send' && form.get('confirm') === 'yes') {
        const [guildId, channelId, extra] = String(form.get('target') || '').split(':');
        if (extra || !/^\d{17,20}$/.test(guildId || '') || !/^\d{17,20}$/.test(channelId || '')) throw new Error('INVALID_ANNOUNCEMENT_TARGET');
        const result = await sendOwnerAnnouncement(client, db, {
          guildId, channelId, message: form.get('message'), actorId: OWNER_ID
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
    const [overview, approvals, activity, renderMetrics, aiReadiness, partners, rpgMetrics, guildConfigurations] = await Promise.all([
      getOwnerOverview(client, db),
      listPendingApprovals(db, 15),
      getRecentOwnerActivity(db),
      getRenderServiceMetrics(),
      getFrierenAIReadiness(),
      listOwnerPartnerLinks(db),
      getOwnerRpgMetrics(db),
      listGuildConfigurations(db)
    ]);
    const featureSettingsByGuild = new Map(await Promise.all([...client.guilds.cache.keys()].map(async guildId => [guildId, await listGuildFeatureSettings(db, guildId)])));
    const memoryUser = String(url.searchParams.get('memoryUser') || '').replace(/\D/g, '').slice(0, 24);
    const memories = memoryUser ? await listUserMemories(db, memoryUser, null, 30) : [];
    send(res, 200, renderDashboard({
      session, overview, client, approvals, memories, memoryUser,
      notice: url.searchParams.get('notice'), activity, renderMetrics, aiReadiness, partners, rpgMetrics, guildConfigurations, featureSettingsByGuild
    }));
  } catch (error) {
    console.error('Owner dashboard load failed:', error?.message || error);
    send(res, 503, page('Panel verisi alınamadı', '<h1>Kontrol merkezi yüklenemedi</h1><p>Veritabanı bağlantısını kontrol et.</p><a href="/owner">Yeniden dene</a>'));
  }
  return true;
}
