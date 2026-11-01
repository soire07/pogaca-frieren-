import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getRenderServiceMetrics, renderMetricBars } from './owner-metrics.js';
import {
  auditOwnerAction, getOwnerOverview, getMaintenanceState, listPendingApprovals,
  reviewApproval, listUserMemories, deleteUserMemory, setMaintenanceState,
  sendOwnerAnnouncement, getRecentOwnerActivity, listOwnerAuditLogs, listOwnerErrorLogs, recordOwnerTestRun, listOwnerTestRuns,
  searchOwnerMemories, updateOwnerMemory
} from './owner-admin.js';
import { listOwnerPartnerLinks, saveOwnerPartnerLink, deleteOwnerPartnerLink, getOwnerRpgMetrics, updateGuildConfiguration, listGuildConfigurations, searchOwnerRpgPlayers, getOwnerRpgPlayerDetails, adjustOwnerRpgResources, adjustOwnerRpgInventory, setOwnerRpgEquipment } from './owner-platform.js';
import { DEFAULT_GUILD_FEATURES, listGuildFeatureSettingsForGuilds, setGuildFeatureEnabled, resetGuildFeatureSetting } from './guild-feature-settings.js';
import { getOwnerDatabaseDiagnostics, getOwnerDatabaseTablePreview, renderOwnerWorkspace } from './owner-workspaces.js';
import { getFrierenChatSettings, updateFrierenChatSettings } from './frieren-chat-settings.js';
import { listOwnerDailyQuests, saveOwnerDailyQuest, setOwnerDailyQuestActive } from './owner-rpg-quests.js';
import { listOwnerRpgContent, saveOwnerRpgContent, setOwnerRpgContentActive } from './owner-rpg-content.js';
import { RENDER_BOT_SERVICES, getRenderBotServiceStatuses, executeRenderServiceAction } from './owner-render-control.js';
import { getOwnerData, getStaleOwnerData } from './owner-data-cache.js';

const OWNER_ID = '1553794496234262641';
const BASE_URL = process.env.OWNER_DASHBOARD_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://pogaca-frieren.onrender.com';
const SESSION_COOKIE = 'frieren_owner_session';
const STATE_COOKIE = 'frieren_owner_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_BODY_BYTES = 24_576;

export const OWNER_PANEL_SECTIONS = Object.freeze([
  { id: 'overview', label: 'Genel Bakış', command: '/owner' },
  { id: 'system', label: 'Sistem Durumu', command: '/owner-bilgi' },
  { id: 'bot-control', label: 'Bot Kontrol Merkezi', command: null },
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
    { label: 'BOT KONTROL', ids: ['bot-control'] },
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
        return section ? '<a href="/owner#' + section.id + '" aria-label="' + section.label + '"><span class="nav-icon" aria-hidden="true">' + ({
          overview: '⌂', system: '◈', servers: '⌘', rpg: '✧', partners: '◇',
          memories: '✦', approvals: '⚝', announcements: '➤', maintenance: '◉'
        }[section.id] || '✧') + '</span><span class="nav-link-copy"><strong>' + section.label + '</strong>'
          + (section.command ? '<small>' + section.command + '</small>' : '') + '</span></a>' : '';
      }).join('') + '</div>').join('')
    + '<div class="nav-group"><div class="nav-group-title">İŞLEM GEÇMİŞİ</div><a href="/owner/activity"><span class="nav-icon">◷</span><span class="nav-link-copy"><strong>Denetim ve test geçmişi</strong></span></a></div>'
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
    'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
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

export function createOwnerOAuthState(secret, now = Date.now(), flow = 'owner') {
  if (!secret || secret.length < 32) throw new Error('Owner OAuth signing secret is invalid');
  if (!['owner', 'register', 'login'].includes(flow)) throw new Error('Invalid site OAuth flow');
  return sign({ purpose: 'discord-owner-oauth', flow, nonce: randomBytes(32).toString('base64url'), exp: now + 10 * 60 * 1000 }, secret);
}

export function verifyOwnerOAuthState(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32) return false;
  const payload = unsign(token, secret);
  return payload?.purpose === 'discord-owner-oauth'
    && typeof payload.nonce === 'string' && payload.nonce.length >= 32
    && Number.isFinite(payload.exp) && payload.exp > now && payload.exp <= now + 10 * 60 * 1000 + 1000
    && (payload.flow === undefined || ['owner', 'register', 'login'].includes(payload.flow));
}

export function getOwnerOAuthFlow(token, secret, now = Date.now()) {
  if (!verifyOwnerOAuthState(token, secret, now)) return null;
  const payload = unsign(token, secret);
  return payload.flow || 'owner';
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

export function createPublicSiteSession(secret, user, expiresAt) {
  const id = String(user?.id || '');
  if (!/^\d{17,20}$/.test(id)) throw new Error('Invalid Discord user for site session');
  const avatarHash = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]{2,128}$/.test(user.avatar) ? user.avatar : null;
  return sign({
    purpose: 'frieren-site-session',
    sub: id,
    username: String(user?.username || 'Gezgin').slice(0, 64),
    avatarHash,
    exp: expiresAt
  }, secret);
}

export function readPublicSiteSession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32 || !token) return null;
  const session = unsign(token, secret);
  if (session?.purpose !== 'frieren-site-session' || !/^\d{17,20}$/.test(String(session.sub || ''))
      || !Number.isInteger(session.exp) || session.exp <= nowSeconds) return null;
  const avatarHash = typeof session.avatarHash === 'string' && /^[a-zA-Z0-9_]{2,128}$/.test(session.avatarHash)
    ? session.avatarHash : null;
  return {
    id: String(session.sub),
    username: String(session.username || 'Gezgin').slice(0, 64),
    avatarUrl: avatarHash ? 'https://cdn.discordapp.com/avatars/' + session.sub + '/' + avatarHash + '.png?size=128' : null
  };
}

export function buildPublicSiteSessionCookie(session, maxAgeSeconds) {
  return 'frieren_site_session=' + encodeURIComponent(session) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAgeSeconds;
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
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Frieren Owner</title><link rel="stylesheet" href="/assets/owner.css"></head><body><main>${content}</main></body></html>`;
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

export function renderOwnerBotCards(overview, aiReadiness, renderServices = null) {
  const aiReady = aiReadiness?.status === 'ok' && aiReadiness?.discordReady === true
    && aiReadiness?.memoryDatabaseReady === true && aiReadiness?.modelConfigured === true;
  const aiService = renderServices?.services?.frieren_ai;
  const aiState = aiService?.suspended ? 'Askıda' : aiReady ? 'Çevrimiçi'
    : aiService?.status === 'running' ? 'Servis açık · kontrol gerekli' : 'Kontrol gerekli';
  return '<section class="columns bot-cards" aria-label="Bot çalışma alanları">'
    + '<article class="panel bot-card ai"><div class="bot-symbol">✧</div><div class="bot-card-content"><span class="tag">AI · TEST & HAFIZA</span><h2>Frieren AI</h2><p class="muted">Kod denetimi, senaryo testleri ve kalıcı hafıza için ayrı asistan.</p><strong class="' + (aiReady ? 'good' : 'warn') + '">' + aiState + '</strong><div class="bot-card-actions"><a class="btn secondary" href="#memories">AI hafızası</a><a class="btn secondary" href="#approvals">Teknik talepler</a><a class="btn secondary" href="#bot-control">Servis kontrolü</a></div></div></article>'
    + '<article class="panel bot-card pogaca"><div class="bot-symbol">✿</div><div class="bot-card-content"><span class="tag">EĞLENCE · RPG</span><h2>Frieren Poğaça</h2><p class="muted">Anime, karakterler, büyüler, görevler, zindanlar ve ekonomi.</p><strong class="' + (overview.ready ? 'good' : 'bad') + '">' + (overview.ready ? 'Çevrimiçi' : 'Çevrimdışı') + '</strong><div class="bot-card-actions"><a class="btn secondary" href="#rpg">RPG merkezi</a><a class="btn secondary" href="#behavior">Komut ve davranışlar</a><a class="btn secondary" href="#bot-control">Servis kontrolü</a></div></div></article>'
    + '</section>';
}

function renderRenderActionForm(serviceKey, action, label, csrf, warningText = '') {
  return '<form method="post" action="/owner/action" class="render-action-form">'
    + '<input type="hidden" name="csrf" value="' + escapeHtml(csrf || '') + '">'
    + '<input type="hidden" name="action" value="render-service-action">'
    + '<input type="hidden" name="serviceKey" value="' + escapeHtml(serviceKey) + '">'
    + '<input type="hidden" name="serviceAction" value="' + escapeHtml(action) + '">'
    + '<label>İşlem gerekçesi</label><input name="reason" maxlength="200" required placeholder="Bu işlemi neden yapıyorsun?">'
    + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> ' + escapeHtml(warningText || (label + ' işlemini onaylıyorum')) + '</label>'
    + '<button class="btn ' + (action === 'suspend' ? 'danger' : 'secondary') + '">' + escapeHtml(label) + '</button></form>';
}

export function renderOwnerControlCenter(renderServices, overview, csrf, renderMetrics = null, aiRenderMetrics = null) {
  const apiConfigured = renderServices?.apiConfigured === true;
  const renderApiError = renderServices?.apiError || null;
  const serviceStatus = service => {
    if (service?.suspended === true || service?.status === 'suspended') return { label: 'Askıya alınmış', css: 'warn' };
    if (service?.suspended === null && service?.health === 'healthy') return { label: 'Health 200 · Render askı durumu bilinmiyor', css: 'good' };
    if (service?.suspended === null && service?.health === 'unhealthy') return { label: 'Health başarısız · Render askı durumu bilinmiyor', css: 'bad' };
    if (service?.status === 'running') return { label: 'Çalışıyor · Health 200', css: 'good' };
    if (service?.health === 'healthy') return { label: 'Health 200 · Render durumu doğrulanamadı', css: 'good' };
    if (service?.health === 'unhealthy') return { label: 'Health kontrolü başarısız', css: 'bad' };
    return { label: 'Durum bilinmiyor', css: 'warn' };
  };
  const serviceCard = (key, title, note) => {
    const service = renderServices?.services?.[key] || {};
    const state = serviceStatus(service);
    const canControl = service.apiConfigured === true && !service.apiError;
    const metrics = key === 'pogaca' ? renderMetrics : aiRenderMetrics;
    const metricText = metrics?.status === 'available'
      ? 'CPU ' + Number(metrics.cpuPercent).toFixed(1) + '% · RAM ' + Number(metrics.memoryPercent).toFixed(1) + '%'
      : metrics?.message || '';
    const meta = [
      service.plan ? 'Plan: ' + escapeHtml(service.plan) : '',
      service.updatedAt ? 'Son güncelleme: ' + escapeHtml(new Date(service.updatedAt).toLocaleString('tr-TR')) : '',
      service.healthStatus ? 'Health HTTP ' + Number(service.healthStatus) : '',
      metricText ? escapeHtml(metricText) : ''
    ].filter(Boolean).join(' · ');
    let actions = '';
    if (key === 'pogaca') {
      actions = canControl
        ? renderRenderActionForm(key, 'restart', 'Yeniden başlat', csrf, 'Poğaça ve Owner Panel servisini yeniden başlatmayı onaylıyorum')
        : '<p class="small">Yeniden başlatma için Render API bağlantısı gerekli.</p>';
    } else if (canControl && service.suspended === true) {
      actions = '<div class="notice warn">Bu servis kullanıcı tarafından askıya alınmış. Otomatik olarak başlatılmadı. Başlatma, AI servisini yeniden erişilebilir yapar ve Render Free çalışma süresini yeniden kullanmaya başlar.</div>'
        + renderRenderActionForm(key, 'resume', 'AI servisini başlat', csrf, 'Askıdaki Frieren AI servisini başlatmayı onaylıyorum');
    } else if (canControl && service.suspended === false) {
      actions = renderRenderActionForm(key, 'restart', 'Yeniden başlat', csrf, 'Frieren AI servisini yeniden başlatmayı onaylıyorum')
        + renderRenderActionForm(key, 'suspend', 'Askıya al', csrf, 'Frieren AI servisini durdurmayı ve erişimi kapatmayı onaylıyorum');
    } else {
      actions = '<p class="small">Başlatma, durdurma ve yeniden başlatma kontrolleri Render API bağlantısı doğrulandığında açılır.</p>';
    }
    return '<article class="panel render-service-card"><div class="actions"><span class="tag">' + (key === 'pogaca' ? 'ANA BOT + PANEL' : 'AYRI AI SERVİSİ') + '</span><strong class="' + state.css + '">' + state.label + '</strong></div>'
      + '<h3>' + title + '</h3><p class="small">' + escapeHtml(service.url || '') + '</p>'
      + (meta ? '<p class="small">' + meta + '</p>' : '')
      + '<p class="muted">' + note + '</p>'
      + (service.suspenders?.length ? '<p class="small">Askıya alma kaynağı: ' + escapeHtml(service.suspenders.join(', ')) + '</p>' : '')
      + (service.apiError ? '<p class="notice warn">Render API: ' + escapeHtml(service.apiError) + '</p>' : '')
      + '<div class="actions"><a class="btn secondary" href="' + escapeHtml(service.dashboardUrl || '#') + '" target="_blank" rel="noopener">Render servisini aç</a></div>'
      + actions + '</article>';
  };
  const connectionNotice = !apiConfigured
    ? '<div class="notice warn">Render API anahtarı henüz bağlı değil. Kontrolleri etkinleştirmek için her Render hesabının anahtarını ayrı sakla: Poğaça için RENDER_POGACA_API_KEY (veya RENDER_API_KEY), yeni Frieren AI hesabı için RENDER_FRIEREN_AI_API_KEY. Değerleri yalnızca Owner Panel ortamında çalıştığı Poğaça Render servisinin Environment bölümüne ekle; tarayıcıya veya Discord mesajına yazma. Servis kimlikleri için RENDER_POGACA_SERVICE_ID ve RENDER_FRIEREN_AI_SERVICE_ID ayarları kullanılabilir.</div>'
    : renderApiError
      ? '<div class="notice warn">En az bir Render servisi doğrulanamadı: ' + escapeHtml(renderApiError) + '. Hata bulunan servis kartının kontrolleri kapalıdır; diğer doğrulanmış servisler bağımsız kalır.</div>'
      : '<div class="notice">Render API bağlı. İşlemler sunucu tarafında yürütülür, her istek denetim kaydına yazılır ve servis başına 90 saniyelik bekleme uygulanır.</div>';
  return '<section class="panel" id="bot-control"><h2>Bot Kontrol Merkezi</h2><p class="muted">Poğaça Frieren ve Frieren AI birbirinden bağımsız yönetilir. Durumlar Render servis kaydı ve health endpoint üzerinden okunur.</p>'
    + connectionNotice
    + '<div class="columns">' 
    + serviceCard('pogaca', 'Poğaça Frieren', 'Owner Panel bu servis üzerinde çalışıyor. Paneli erişilemez bırakmamak için Render askıya alma kontrolü kapalıdır. Kullanıcı komutlarını durdurmak için bakım modunu kullan: <a href="#maintenance">Bakım moduna git</a>.')
    + serviceCard('frieren_ai', 'Frieren AI', 'Ayrı Render servisi. Askıya alma AI testlerini ve AI erişimini durdurur; başlatma yeniden çalışma süresini başlatır.')
    + '</div><div class="small">Son sayfa yenilemesinde kontrol edildi. Servis işlemleri kabul edildikten sonra durumun değişmesi birkaç saniye sürebilir; sonucu görmek için sayfayı yenile.</div></section>';
}

export async function getFrierenAIReadiness({
  fetchImpl = globalThis.fetch,
  serviceUrl = RENDER_BOT_SERVICES.frieren_ai.url,
  healthPath = RENDER_BOT_SERVICES.frieren_ai.healthPath
} = {}) {
  try {
    const response = await fetchImpl(String(serviceUrl).replace(/\/$/, '') + healthPath, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

function renderDashboard({ session, overview, client, approvals, memories, memoryUser, memoryGuild, memoryKey, notice, activity, renderMetrics, aiReadiness, renderServices, aiRenderMetrics, partners, rpgMetrics, guildConfigurations, featureSettingsByGuild }) {
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
      <form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="id" value="${row.id}"><input type="hidden" name="action" value="memory-update"><label>Hafıza içeriği</label><textarea name="value" maxlength="1000" required>${escapeHtml(row.memory_value)}</textarea><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Düzenlemeyi onaylıyorum</label><button class="btn secondary">Hafızayı güncelle</button></form>
      <form method="post" action="/owner/action"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="id" value="${row.id}"><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Kalıcı olarak silmeyi onaylıyorum</label><button class="btn danger" name="action" value="memory-delete">Bu kaydı sil</button></form>
    </div>`).join('') : '<p class="muted">Filtrelere uygun hafıza kaydı bulunamadı.</p>';
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
    service_action_accepted: 'Render API işlemi kabul etti. Servis durumunu yenileyerek sonucu doğrula.',
    service_action_audit_pending: 'Render API işlemi kabul etti ancak denetim kaydı güncellemesi gecikti. Servis durumunu ve audit kayıtlarını kontrol et.',
    service_cooldown: 'Bu servis için yakın zamanda bir işlem yapıldı. Güvenlik bekleme süresi dolunca tekrar dene.',
    render_api_missing: 'Render API anahtarı tanımlı değil. RENDER_API_KEY değerini yalnızca Render ortam değişkenlerinde sakla.',
    render_api_auth_error: 'Render API kimlik doğrulaması veya yetki kapsamı yetersiz. Anahtar izinlerini Render hesabında kontrol et ve sunucu ortam değişkenini güncelle.',
    render_api_service_error: 'Render servis kimliği yanlış olabilir, API sınırına ulaşılmış olabilir veya Render geçici hata döndürmüş olabilir. Servis ID değerlerini ve Render durumunu kontrol et.',
    approval_approved: 'Talep onaylandı. Kod otomatik çalıştırılmadı.',
    approval_rejected: 'Talep reddedildi.',
    memory_deleted: 'Hafıza kaydı silindi.',
    memory_updated: 'Hafıza kaydı güncellendi ve denetim kaydına eklendi.',
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
      ${renderOwnerBotCards(overview, aiReadiness, renderServices)}
      ${renderOwnerControlCenter(renderServices, overview, session.csrf, renderMetrics, aiRenderMetrics)}
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
        <form method="get" action="/owner"><label>Discord kullanıcı ID (isteğe bağlı)</label><input name="memoryUser" value="${escapeHtml(memoryUser)}" inputmode="numeric" pattern="[0-9]{17,20}" placeholder="Kullanıcı ID"><label>Discord sunucu ID (isteğe bağlı)</label><input name="memoryGuild" value="${escapeHtml(memoryGuild)}" inputmode="numeric" pattern="[0-9]{17,20}" placeholder="Sunucu ID"><label>Hafıza anahtarı (isteğe bağlı)</label><input name="memoryKey" value="${escapeHtml(memoryKey)}" maxlength="60" placeholder="Örn. cevap-tercihi"><button class="btn secondary">Hafızaları filtrele</button></form>
        ${memoryHtml}
      </section>
    </div>

  `);
}

export function renderOwnerActivityWorkspace({ audit = { rows: [], page: 1, limit: 20, total: 0 }, errors = { rows: [], page: 1, limit: 20, total: 0 }, testRuns = { rows: [], page: 1, limit: 10, total: 0 }, action = '', target = '', errorScope = '' } = {}) {
  const auditRows = audit.rows || [];
  const testRows = testRuns.rows || [];
  const auditHtml = auditRows.length ? auditRows.map(row =>
    '<div class="rowitem"><div class="actions"><strong>#' + Number(row.id) + ' · ' + escapeHtml(row.action) + '</strong><span class="small">' + escapeHtml(new Date(row.created_at).toLocaleString('tr-TR')) + '</span></div>'
    + '<div class="small">İşlemi yapan: ' + escapeHtml(row.actor_id) + ' · Hedef: ' + escapeHtml(row.target || '—') + '</div></div>'
  ).join('') : '<p class="muted">Bu filtrelerle eşleşen işlem bulunamadı.</p>';
  const errorRows = errors.rows || [];
  const errorHtml = errorRows.length ? errorRows.map(row =>
    '<div class="rowitem"><div class="actions"><strong>#' + Number(row.id) + ' · ' + escapeHtml(row.error_type) + '</strong><span class="small">' + escapeHtml(new Date(row.created_at).toLocaleString('tr-TR')) + '</span></div>'
    + '<div class="small">Bölüm: ' + escapeHtml(row.scope) + '</div></div>'
  ).join('') : '<p class="muted">Kaydedilmiş hata kaydı bulunamadı.</p>';
  const errorQuery = page => '/owner/activity?' + new URLSearchParams({ action, target, page: String(audit.page), errorScope, errorPage: String(page) }).toString();
  const errorPrevious = errors.page > 1 ? '<a class="btn secondary" href="' + errorQuery(errors.page - 1) + '">Önceki hatalar</a>' : '';
  const errorNext = errors.page * errors.limit < errors.total ? '<a class="btn secondary" href="' + errorQuery(errors.page + 1) + '">Sonraki hatalar</a>' : '';
  const testHtml = testRows.length ? testRows.map(run =>
    '<div class="rowitem"><div class="actions"><strong>#' + Number(run.id) + ' · ' + escapeHtml(run.target) + '</strong><span class="' + (run.status === 'PASS' ? 'good' : run.status === 'FAIL' ? 'bad' : 'warn') + '">' + escapeHtml(run.status) + '</span></div>'
    + '<div class="small">' + Number(run.summary?.total || 0) + ' test · ' + Number(run.summary?.pass || 0) + ' PASS · ' + Number(run.summary?.fail || 0) + ' FAIL · ' + escapeHtml(new Date(run.created_at).toLocaleString('tr-TR')) + '</div>'
    + (Array.isArray(run.details?.testFiles) && run.details.testFiles.length ? '<div class="small">Test dosyaları: ' + escapeHtml(run.details.testFiles.join(', ')) + '</div>' : '')
    + (Array.isArray(run.details?.failedStages) && run.details.failedStages.length ? '<p class="notice warn">' + escapeHtml(run.details.failedStages.join(' · ')) + '</p>' : '')
    + '</div>'
  ).join('') : '<p class="muted">Henüz kaydedilmiş test çalıştırması yok.</p>';
  const auditQuery = page => '/owner/activity?' + new URLSearchParams({ action, target, page: String(page), errorScope, errorPage: String(errors.page) }).toString();
  const previous = audit.page > 1 ? '<a class="btn secondary" href="' + auditQuery(audit.page - 1) + '">Önceki</a>' : '';
  const next = audit.page * audit.limit < audit.total ? '<a class="btn secondary" href="' + auditQuery(audit.page + 1) + '">Sonraki</a>' : '';
  return page('Denetim ve test geçmişi', renderOwnerNavigation()
    + '<div class="top"><div><div class="brand">FRIEREN · PRIVATE OPERATIONS</div><div class="small">AUDIT & TEST HISTORY</div></div><a class="btn secondary" href="/owner">Kontrol merkezine dön</a></div>'
    + '<section class="hero"><span class="tag">OWNER · PRIVATE</span><h1>Denetim ve test geçmişi</h1><p class="muted">İşlemler, test sonuçları ve başarısız aşamalar. Hassas kayıt içerikleri bu listede gösterilmez.</p></section>'
    + '<section class="panel"><h2>İşlem kayıtları · ' + Number(audit.total) + '</h2><form method="get" action="/owner/activity"><label>İşlem türü</label><input name="action" maxlength="80" value="' + escapeHtml(action) + '" placeholder="Örn. memory.update"><label>Hedef</label><input name="target" maxlength="80" value="' + escapeHtml(target) + '" placeholder="Kayıt veya servis ID"><button class="btn secondary">Filtrele</button></form>'
    + auditHtml + '<div class="actions">' + previous + next + '<span class="small">Sayfa ' + Number(audit.page) + ' · En fazla ' + Number(audit.limit) + ' kayıt</span></div></section>'
    + '<section class="panel"><h2>Hata kayıtları · ' + Number(errors.total) + '</h2><form method="get" action="/owner/activity"><input type="hidden" name="action" value="' + escapeHtml(action) + '"><input type="hidden" name="target" value="' + escapeHtml(target) + '"><input type="hidden" name="page" value="' + Number(audit.page) + '"><label>Hata bölümü</label><input name="errorScope" maxlength="80" value="' + escapeHtml(errorScope) + '" placeholder="Örn. discord"><button class="btn secondary">Hataları filtrele</button></form>' + errorHtml + '<div class="actions">' + errorPrevious + errorNext + '<span class="small">Sayfa ' + Number(errors.page) + '</span></div></section>'
    + '<section class="panel"><h2>Frieren AI test geçmişi · ' + Number(testRuns.total) + '</h2>' + testHtml + '</section>');
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
    const requestedFlow = url.searchParams.get('flow');
    const flow = ['register', 'login'].includes(requestedFlow) ? requestedFlow : 'owner';
    const state = createOwnerOAuthState(sessionSecret, Date.now(), flow);
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
    const flow = getOwnerOAuthFlow(receivedState, sessionSecret);
    if (!verifyOwnerOAuthState(receivedState, sessionSecret) || !flow || !code) {
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
      const userId = String(user?.id || '');
      const username = String(user?.username || 'Gezgin').slice(0, 64);
      const avatarHash = typeof user?.avatar === 'string' && /^[a-zA-Z0-9_]{2,128}$/.test(user.avatar) ? user.avatar : null;
      if (flow === 'register' || flow === 'login') {
        if (!/^\d{17,20}$/.test(userId)) throw new Error('INVALID_DISCORD_USER_ID');
        await db.query(`
          CREATE TABLE IF NOT EXISTS frieren_site_members (
            discord_user_id TEXT PRIMARY KEY CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
            username VARCHAR(64) NOT NULL,
            avatar_hash TEXT,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        if (flow === 'register') {
          const created = await db.query(
            'INSERT INTO frieren_site_members (discord_user_id, username, avatar_hash) VALUES ($1,$2,$3) ON CONFLICT (discord_user_id) DO NOTHING RETURNING discord_user_id',
            [userId, username, avatarHash]
          );
          if (!created.rowCount) {
            res.writeHead(302, { Location: '/login?status=already_registered', 'Cache-Control': 'no-store', 'Set-Cookie': clearOwnerCookie(STATE_COOKIE, '/owner') });
            res.end();
            return true;
          }
        } else {
          const existing = await db.query('SELECT discord_user_id FROM frieren_site_members WHERE discord_user_id=$1', [userId]);
          if (!existing.rowCount) {
            res.writeHead(302, { Location: '/register?status=not_registered', 'Cache-Control': 'no-store', 'Set-Cookie': clearOwnerCookie(STATE_COOKIE, '/owner') });
            res.end();
            return true;
          }
          await db.query(
            'UPDATE frieren_site_members SET username=$2, avatar_hash=$3, last_login_at=NOW() WHERE discord_user_id=$1',
            [userId, username, avatarHash]
          );
        }
      } else if (userId !== OWNER_ID) {
        send(res, 403, page('Owner erişimi reddedildi', '<h1>Bu alan yalnızca site sahibine açıktır</h1><p>Siteye normal giriş yapmak için kayıt veya giriş sayfasını kullan.</p><a class="btn" href="/login">Siteye dön</a>'), { 'Set-Cookie': clearOwnerCookie(STATE_COOKIE, '/owner') });
        return true;
      }
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
      const setCookies = [clearOwnerCookie(STATE_COOKIE, '/owner')];
      if (flow === 'register' || flow === 'login' || userId === OWNER_ID) {
        const siteSession = createPublicSiteSession(sessionSecret, user, expiresAt);
        setCookies.push(buildPublicSiteSessionCookie(siteSession, SESSION_TTL_SECONDS));
      }
      if (userId === OWNER_ID) {
        const ownerSession = createOwnerSession(sessionSecret, expiresAt);
        setCookies.push(buildOwnerSessionCookie(ownerSession, SESSION_TTL_SECONDS));
      }
      res.writeHead(302, {
        Location: '/', 'Cache-Control': 'no-store',
        'Set-Cookie': setCookies
      });
      res.end();
    } catch (error) {
      console.error('Owner OAuth login failed:', error?.message || 'unknown error');
      if (flow === 'register' || flow === 'login') {
        res.writeHead(302, {
          Location: '/' + flow + '?status=oauth_error',
          'Cache-Control': 'no-store',
          'Set-Cookie': [clearOwnerCookie(STATE_COOKIE, '/owner'), clearOwnerCookie(SESSION_COOKIE, '/owner')]
        });
        res.end();
      } else {
        send(res, 502, page('Discord bağlantı hatası', '<h1>Discord ile giriş tamamlanamadı</h1><p>Biraz sonra yeniden dene.</p><a class="btn secondary" href="/">Ana sayfaya dön</a>'), { 'Set-Cookie': [clearOwnerCookie(STATE_COOKIE, '/owner'), clearOwnerCookie(SESSION_COOKIE, '/owner')] });
      }
    }
    return true;
  }

  const session = readOwnerSession(cookie[SESSION_COOKIE], sessionSecret);
  if (!session) {
    if (url.pathname === '/owner/logout' || url.pathname === '/owner/action') {
      send(res, 401, page('Oturum gerekli', '<h1>Oturum süresi doldu</h1><a class="btn" href="/owner/login">Yeniden giriş yap</a>'), { 'Set-Cookie': clearOwnerCookie(SESSION_COOKIE, '/owner') });
    } else {
      send(res, 200, page('Frieren giriş', '<span class="tag">✧ FANTASTİK YOLCULUĞA GİRİŞ</span><h1>Frieren evrenine hoş geldin</h1><p>Siteye devam etmek için Discord hesabınla giriş yap. Girişten sonra ana sayfa, bot tanıtımı ve GIF galerisi açılır. Owner Panel yalnızca bot sahibine özeldir.</p><a class="btn" href="/owner/login">Discord ile devam et</a><p class="muted">Güvenli giriş · Discord kimlik doğrulaması</p>'));
    }
    return true;
  }

  if (url.pathname === '/owner/frieren-ai/health' && req.method === 'GET') {
    const aiBase = (process.env.FRIEREN_AI_PUBLIC_URL || 'https://pogaca-frieren-kltd.onrender.com').replace(/\/$/, '');
    const healthSecret = process.env.FRIEREN_AI_HEALTH_SECRET || process.env.FRIEREN_BRIDGE_SECRET || '';
    if (healthSecret.length < 32) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'unconfigured', error: 'Owner sağlık kontrolü henüz yapılandırılmadı.' }));
      return true;
    }
    try {
      const response = await fetch(aiBase + '/health', { headers: { 'x-frieren-health-secret': healthSecret }, signal: AbortSignal.timeout(10000) });
      const payload = await response.json().catch(() => ({ status: 'invalid_response' }));
      res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(payload));
    } catch {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'unreachable', error: 'Frieren AI sağlık bilgisine şu anda ulaşılamıyor.' }));
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
      if (kind === 'ai') { data.aiReadiness = await getFrierenAIReadiness(); data.chatSettings = await getFrierenChatSettings(db); data.testRuns = await listOwnerTestRuns(db, { limit: 10 }); data.csrf = session.csrf; data.notice = url.searchParams.get('notice') || ''; }
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
        if (data.guildId) data.dailyQuests = await listOwnerDailyQuests(db, { guildId: data.guildId });
        if (data.guildId) data.rpgContent = await listOwnerRpgContent(db, { guildId: data.guildId });
      }
      if (kind === 'database') {
        data.database = await getOwnerDatabaseDiagnostics(db);
        const neonProjectId = String(process.env.NEON_PROJECT_ID || '').trim();
        data.backup = { consoleUrl: /^[a-z0-9-]{1,60}$/.test(neonProjectId) ? 'https://console.neon.tech/app/projects/' + neonProjectId : null };
        const table = String(url.searchParams.get('table') || '');
        if (table) data.preview = await getOwnerDatabaseTablePreview(db, { table, search: url.searchParams.get('search') || '' });
      }
      if (kind === 'settings') data.settings = [
        { label: 'Discord OAuth istemcisi', configured: Boolean(process.env.CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) },
        { label: 'Owner oturum imzası', configured: Boolean(process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32) },
        { label: 'PostgreSQL bağlantısı', configured: Boolean(db) },
        { label: 'Frieren AI köprü anahtarı', configured: Boolean(process.env.FRIEREN_AI_BRIDGE_SECRET || process.env.FRIEREN_BRIDGE_SECRET) },
        { label: 'Poğaça Render API anahtarı', configured: Boolean(process.env.RENDER_POGACA_API_KEY || process.env.RENDER_API_KEY) },
        { label: 'Frieren AI Render API anahtarı', configured: Boolean(process.env.RENDER_FRIEREN_AI_API_KEY) },
        { label: 'Poğaça Render servis kimliği', configured: Boolean(process.env.RENDER_POGACA_SERVICE_ID || process.env.RENDER_SERVICE_ID) },
        { label: 'Frieren AI Render servis kimliği', configured: Boolean(process.env.RENDER_FRIEREN_AI_SERVICE_ID) },
        { label: 'Neon proje kimliği', configured: Boolean(process.env.NEON_PROJECT_ID) }
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

  if (url.pathname === '/owner/activity' && req.method === 'GET') {
    try {
      const actionFilter = String(url.searchParams.get('action') || '').slice(0, 80);
      const targetFilter = String(url.searchParams.get('target') || '').slice(0, 80);
      const pageNumber = Math.max(1, Math.min(Number(url.searchParams.get('page')) || 1, 100000));
      const errorPage = Math.max(1, Math.min(Number(url.searchParams.get('errorPage')) || 1, 100000));
      const errorScope = String(url.searchParams.get('errorScope') || '').slice(0, 80);
      const [audit, errors, testRuns] = await Promise.all([
        listOwnerAuditLogs(db, { action: actionFilter, target: targetFilter, page: pageNumber, limit: 20 }),
        listOwnerErrorLogs(db, { scope: errorScope, page: errorPage, limit: 20 }),
        listOwnerTestRuns(db, { page: 1, limit: 20 })
      ]);
      send(res, 200, renderOwnerActivityWorkspace({ audit, errors, testRuns, action: actionFilter, target: targetFilter, errorScope }));
    } catch (error) {
      console.error('Owner activity history failed:', error?.message || error);
      send(res, 503, page('Geçmiş yüklenemedi', '<h1>Denetim geçmişi yüklenemedi</h1><a class="btn" href="/owner">Panele dön</a>'));
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
      if (action === 'render-service-action' && form.get('confirm') === 'yes') {
        const result = await executeRenderServiceAction(db, {
          serviceKey: form.get('serviceKey'),
          action: form.get('serviceAction'),
          reason: form.get('reason'),
          actorId: OWNER_ID,
          confirm: 'yes'
        });
        redirect(res, '/owner?notice=' + (result.auditPending ? 'service_action_audit_pending' : 'service_action_accepted') + '&serviceAction=' + encodeURIComponent(result.action));
        return true;
      }
      if (action === 'rpg-daily-quest-save' && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        await saveOwnerDailyQuest(db, {
          guildId,
          questKey: form.get('questKey'),
          title: form.get('title'),
          description: form.get('description'),
          objectiveType: form.get('objectiveType'),
          className: form.get('className'),
          rewardCoins: Number(form.get('rewardCoins')),
          active: form.get('active') !== 'no',
          reason: form.get('reason'),
          actorId: OWNER_ID
        });
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&notice=quest_saved');
        return true;
      }
      if (action === 'rpg-daily-quest-disable' && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        await setOwnerDailyQuestActive(db, {
          guildId,
          questKey: form.get('questKey'),
          active: false,
          reason: form.get('reason'),
          actorId: OWNER_ID
        });
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&notice=quest_disabled');
        return true;
      }
      if (action === 'rpg-content-save' && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        const contentType = String(form.get('contentType') || '');
        let config;
        if (contentType === 'dungeon') {
          config = { name: form.get('name'), hp: Number(form.get('hp')), damage: Number(form.get('damage')), xp: Number(form.get('xp')), coins: Number(form.get('coins')), lootChance: Number(form.get('lootChance')), loot: form.get('loot') };
        } else if (contentType === 'solo_boss') {
          config = { name: form.get('name'), region: form.get('region'), maxHp: Number(form.get('maxHp')), minDamage: Number(form.get('minDamage')), maxDamage: Number(form.get('maxDamage')), coinMin: Number(form.get('coinMin')), coinMax: Number(form.get('coinMax')), xpMin: Number(form.get('xpMin')), xpMax: Number(form.get('xpMax')), lootChance: Number(form.get('lootChance')), loot: form.get('loot') };
        } else if (contentType === 'raid_boss') {
          config = { name: form.get('name'), hp: Number(form.get('hp')), damage: Number(form.get('damage')), xp: Number(form.get('xp')), coins: Number(form.get('coins')), loot: form.get('loot'), weakness: form.get('weakness'), weaknessLabel: form.get('weaknessLabel') };
        } else {
          throw new Error('INVALID_RPG_CONTENT');
        }
        await saveOwnerRpgContent(db, {
          guildId, contentType, contentKey: form.get('contentKey'), config,
          active: form.get('active') !== 'no', reason: form.get('reason'), actorId: OWNER_ID
        });
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&notice=content_saved');
        return true;
      }
      if (action === 'rpg-content-disable' && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        await setOwnerRpgContentActive(db, {
          guildId, contentType: form.get('contentType'), contentKey: form.get('contentKey'),
          active: false, reason: form.get('reason'), actorId: OWNER_ID
        });
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&notice=content_disabled');
        return true;
      }
      if ((action === 'rpg-inventory-adjust' || action === 'rpg-equipment-set') && form.get('confirm') === 'yes') {
        const guildId = String(form.get('guildId') || '');
        const userId = String(form.get('userId') || '');
        if (!client?.guilds?.cache?.has(guildId)) throw new Error('RPG_GUILD_NOT_AVAILABLE');
        if (action === 'rpg-inventory-adjust') {
          await adjustOwnerRpgInventory(db, {
            guildId, userId, itemId: form.get('itemId'),
            quantityDelta: Number(form.get('quantityDelta')),
            reason: form.get('reason'), actorId: OWNER_ID
          });
        } else {
          await setOwnerRpgEquipment(db, {
            guildId, userId, slot: form.get('slot'),
            itemId: form.get('itemId') || null,
            reason: form.get('reason'), actorId: OWNER_ID
          });
        }
        redirect(res, '/owner/pogaca?guildId=' + encodeURIComponent(guildId) + '&userId=' + encodeURIComponent(userId) + '&notice=rpg_saved');
        return true;
      }
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
      if (action === 'frieren-chat-settings') {
        await updateFrierenChatSettings(db, {
          enabled: form.get('enabled') === 'yes',
          style: String(form.get('style') || ''),
          responseLength: String(form.get('responseLength') || ''),
          loreFocus: form.get('loreFocus') === 'yes'
        }, OWNER_ID);
        redirect(res, '/owner/frieren-ai?notice=chat_settings_saved');
        return true;
      }
      if (action === 'ai-test-run' && form.get('confirm') === 'yes') {
        const target = String(form.get('target') || '').trim().slice(0, 4000);
        const rawCommands = String(form.get('commands') || '');
        const commands = rawCommands.split(/[\x09-\x0d ,;]+/).map(value => value.trim()).filter(Boolean).slice(0, 80);
        const secret = String(process.env.FRIEREN_AI_BRIDGE_SECRET || process.env.FRIEREN_BRIDGE_SECRET || '').trim();
        let response;
        if (target) {
          if (secret.length < 32) throw new Error('AI_TEST_BRIDGE_NOT_CONFIGURED');
          response = await fetch('http://127.0.0.1:10001/internal/test-scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
            body: JSON.stringify({ target }),
            signal: AbortSignal.timeout(240000)
          });
        } else {
          if (secret.length < 32) throw new Error('AI_TEST_BRIDGE_NOT_CONFIGURED');
          response = await fetch(BASE_URL + '/internal/test-suite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
            body: JSON.stringify({ commands }),
            signal: AbortSignal.timeout(45000)
          });
        }
        const report = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('AI_TEST_RUN_FAILED_' + response.status);
        const savedTarget = target || (commands.length ? 'Komut denetimi: ' + commands.join(', ') : 'Tüm komutların denetimi');
        await recordOwnerTestRun(db, { actorId: OWNER_ID, target: savedTarget, report });
        redirect(res, '/owner/frieren-ai?notice=test_saved');
        return true;
      }
      let notice = 'invalid';
      if ((action === 'maintenance-on' || action === 'maintenance-off') && form.get('confirm') === 'yes') {
        await setMaintenanceState(db, action === 'maintenance-on', OWNER_ID);
        notice = action === 'maintenance-on' ? 'maintenance_on' : 'maintenance_off';
      } else if (action === 'approval-approved' || action === 'approval-rejected') {
        const result = await reviewApproval(db, form.get('id'), action === 'approval-approved' ? 'approved' : 'rejected', OWNER_ID);
        notice = result ? action.replace('-', '_') : 'invalid';
      } else if (action === 'memory-update' && form.get('confirm') === 'yes') {
        const result = await updateOwnerMemory(db, { id: form.get('id'), value: form.get('value'), actorId: OWNER_ID });
        notice = result ? 'memory_updated' : 'invalid';
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
      const code = String(error?.message || '');
      console.error('Owner dashboard action failed:', code || 'unknown error');
      const notice = code === 'RENDER_API_NOT_CONFIGURED' ? 'render_api_missing'
        : code === 'RENDER_ACTION_COOLDOWN' ? 'service_cooldown'
        : /^RENDER_API_HTTP_(401|403)$/.test(code) ? 'render_api_auth_error'
        : /^RENDER_API_HTTP_(404|429|5\d\d)$/.test(code) ? 'render_api_service_error'
        : 'invalid';
      redirect(res, '/owner?notice=' + notice);
    }
    return true;
  }

  if ((url.pathname !== '/owner' && url.pathname !== '/owner/') || req.method !== 'GET') {
    send(res, 404, page('Bulunamadı', '<h1>Sayfa bulunamadı</h1><a href="/owner">Panele dön</a>'));
    return true;
  }

  try {
    const [overview, approvals, activity, partners, rpgMetrics, guildConfigurations, featureSettingsByGuild] = await Promise.all([
      getOwnerData('dashboard:overview', () => getOwnerOverview(client, db), 5_000),
      listPendingApprovals(db, 15),
      getOwnerData('dashboard:activity', () => getRecentOwnerActivity(db), 15_000),
      getOwnerData('dashboard:partners', () => listOwnerPartnerLinks(db), 15_000),
      getOwnerData('dashboard:rpg-metrics', () => getOwnerRpgMetrics(db), 15_000),
      getOwnerData('dashboard:guild-configurations', () => listGuildConfigurations(db), 10_000),
      getOwnerData('dashboard:feature-settings', () => listGuildFeatureSettingsForGuilds(
        db, [...(client?.guilds?.cache?.keys?.() || [])]
      ), 10_000)
    ]);
    const renderMetrics = getStaleOwnerData(
      'render-metrics:pogaca',
      () => getRenderServiceMetrics({ resourceId: RENDER_BOT_SERVICES.pogaca.id }),
      { status: 'loading', source: 'render', points: [], message: 'Render metrikleri arka planda yenileniyor.' }
    );
    const renderServices = getStaleOwnerData(
      'render-services',
      () => getRenderBotServiceStatuses(),
      {
        status: 'loading',
        apiConfigured: Boolean(process.env.RENDER_POGACA_API_KEY || process.env.RENDER_API_KEY || process.env.RENDER_FRIEREN_AI_API_KEY),
        services: {
          pogaca: { status: 'checking', url: RENDER_BOT_SERVICES.pogaca.url, apiConfigured: Boolean(process.env.RENDER_POGACA_API_KEY || process.env.RENDER_API_KEY) },
          frieren_ai: { status: 'checking', url: RENDER_BOT_SERVICES.frieren_ai.url, apiConfigured: Boolean(process.env.RENDER_FRIEREN_AI_API_KEY) }
        },
        updatedAt: null
      }
    );
    const frierenService = renderServices?.services?.frieren_ai;
    const aiReadiness = frierenService?.healthPayload || null;
    const aiRenderMetrics = getStaleOwnerData(
      'render-metrics:frieren-ai',
      () => frierenService?.status === 'running' && frierenService?.apiConfigured && !frierenService?.apiError
        ? getRenderServiceMetrics({ resourceId: RENDER_BOT_SERVICES.frieren_ai.id, apiKey: process.env.RENDER_FRIEREN_AI_API_KEY })
        : Promise.resolve({ status: 'unavailable', source: 'render', points: [], message: frierenService?.suspended ? 'Frieren AI askıda; metrik sorgusu yapılmadı.' : 'Frieren AI servis durumu doğrulandıktan sonra metrikler alınacak.' }),
      { status: 'loading', source: 'render', points: [], message: 'Frieren AI metrikleri arka planda yenileniyor.' }
    );
    const memoryUser = String(url.searchParams.get('memoryUser') || '').trim().slice(0, 24);
    const memoryGuild = String(url.searchParams.get('memoryGuild') || '').trim().slice(0, 24);
    const memoryKey = String(url.searchParams.get('memoryKey') || '').trim().slice(0, 60);
    const memories = memoryUser || memoryGuild || memoryKey
      ? await searchOwnerMemories(db, { userId: memoryUser, guildId: memoryGuild, key: memoryKey, limit: 30 }) : [];
    send(res, 200, renderDashboard({
      session, overview, client, approvals, memories, memoryUser,
      notice: url.searchParams.get('notice'), activity, renderMetrics, aiReadiness, renderServices, aiRenderMetrics, partners, rpgMetrics, guildConfigurations, featureSettingsByGuild
    }));
  } catch (error) {
    console.error('Owner dashboard load failed:', error?.message || error);
    send(res, 503, page('Panel verisi alınamadı', '<h1>Kontrol merkezi yüklenemedi</h1><p>Veritabanı bağlantısını kontrol et.</p><a href="/owner">Yeniden dene</a>'));
  }
  return true;
}
