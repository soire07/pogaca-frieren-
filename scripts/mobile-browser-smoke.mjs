import { chromium, webkit, request } from 'playwright';
import { createPublicSiteSession } from '../owner-dashboard.js';

const configuredBaseUrl = String(process.env.MOBILE_SMOKE_BASE_URL || '').trim();
const allowLocal = process.env.MOBILE_SMOKE_ALLOW_LOCAL === '1';
if (!configuredBaseUrl) throw new Error('MOBILE_SMOKE_BASE_URL is required.');
const parsedBaseUrl = new URL(configuredBaseUrl);
const isLocalSmokeServer = allowLocal && parsedBaseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsedBaseUrl.hostname);
if (!isLocalSmokeServer) throw new Error('Browser smoke accepts only the isolated local CI server; production and Vercel proxy URLs are forbidden.');
const baseUrl = parsedBaseUrl.origin.replace(/\/$/, '');
const scenarios = [
  { name: 'Android Chrome viewport', engine: chromium, viewport: { width: 412, height: 915 }, isMobile: true },
  { name: 'iOS Safari viewport', engine: webkit, viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'Desktop Chromium viewport', engine: chromium, viewport: { width: 1440, height: 960 }, isMobile: false }
];

for (const scenario of scenarios) {
  const browser = await scenario.engine.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: 2,
      isMobile: scenario.isMobile,
      hasTouch: true
    });
    const page = await context.newPage();
    const siteSession = createPublicSiteSession(
      process.env.ADMIN_SESSION_SECRET,
      { id: 'site_123e4567-e89b-12d3-a456-426614174000', username: 'Smoke Gezgin' },
      Math.floor(Date.now() / 1000) + 3600
    );
    await context.addCookies([{ name: 'frieren_site_session', value: siteSession, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
    for (const route of ['/login', '/register']) {
      const response = await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || response.status() !== 200) throw new Error(scenario.name + ' ' + route + ' HTTP ' + (response?.status() || 'no response'));
      // The auth page loads the shared stylesheet as a separate request. Safari
      // can report its pre-style native control geometry immediately after
      // DOMContentLoaded; wait for stylesheets and fonts before measuring.
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await page.evaluate(() => document.fonts?.ready);
      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewport: Boolean(document.querySelector('meta[name="viewport"]')),
        form: Boolean(document.querySelector('form')),
        controls: [...document.querySelectorAll('input,button,select,textarea')].map(node => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return { left: rect.left, right: rect.right, height: rect.height, visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && node.type !== 'hidden' };
        }).filter(control => control.visible)
      }));
      if (!layout.viewport || !layout.form) throw new Error(scenario.name + ' ' + route + ' missing mobile viewport or form');
      const authFields = await page.locator('input[name="csrf"]').count();
      if (!authFields) {
        const diagnostics = await page.evaluate(() => ({
          title: document.title,
          url: location.href,
          forms: [...document.forms].map(form => form.getAttribute('action')),
          inputs: [...document.querySelectorAll('input')].map(input => ({ name: input.name, type: input.type })),
          body: document.body.innerText.slice(0, 240)
        }));
        throw new Error(scenario.name + ' ' + route + ' missing CSRF-protected form: ' + JSON.stringify(diagnostics));
      }
      if (layout.documentWidth > layout.width + 1) throw new Error(scenario.name + ' ' + route + ' horizontal overflow: ' + layout.documentWidth + ' > ' + layout.width);
      if (layout.controls.some(control => control.left < -1 || control.right > layout.width + 1 || control.height < 44)) {
        throw new Error(scenario.name + ' ' + route + ' has clipped or undersized controls: ' + JSON.stringify(layout.controls));
      }
    }
    const playerPage = await page.goto(baseUrl + '/kesfet', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!playerPage || playerPage.status() !== 200) throw new Error(scenario.name + ' authenticated site page HTTP ' + (playerPage?.status() || 'no response'));
    const menuToggle = page.locator('#site-menu-toggle');
    const sidebar = page.locator('#site-sidebar');
    if (await menuToggle.count() !== 1) throw new Error(scenario.name + ' missing compact navigation toggle');
    const menuButtonStyle = await menuToggle.evaluate(node => { const r=node.getBoundingClientRect(); const s=getComputedStyle(node); return {left:r.left,top:r.top,width:r.width,height:r.height,position:s.position}; });
    if (menuButtonStyle.position !== 'fixed' || menuButtonStyle.left > 24 || menuButtonStyle.top > 24 || menuButtonStyle.width > 52 || menuButtonStyle.height > 52) throw new Error(scenario.name + ' menu button is not a compact top-left app control: ' + JSON.stringify(menuButtonStyle));
    await menuToggle.click();
    await page.waitForFunction(() => {
      const toggle = document.getElementById('site-menu-toggle');
      const menu = document.getElementById('site-sidebar');
      return toggle?.getAttribute('aria-expanded') === 'true' && menu?.classList.contains('is-open') && getComputedStyle(menu).visibility === 'visible';
    }, { timeout: 5000 });
    await sidebar.waitFor({ state: 'visible', timeout: 5000 });
    if (await menuToggle.getAttribute('aria-expanded') !== 'true' || !(await sidebar.isVisible())) throw new Error(scenario.name + ' menu did not open');
    const menuStyle = await sidebar.evaluate(node => { const r=node.getBoundingClientRect(); const s=getComputedStyle(node); return {left:r.left,top:r.top,width:r.width,position:s.position,backdrop:s.backdropFilter}; });
    if (menuStyle.position !== 'fixed' || menuStyle.left > 24 || menuStyle.top > 80 || menuStyle.width > 340) throw new Error(scenario.name + ' navigation is not a compact anchored popover: ' + JSON.stringify(menuStyle));
    if (!(await sidebar.getByRole('link', { name: /Kullanıcı Paneli/ }).count())) throw new Error(scenario.name + ' missing player interface shortcut');
    if (await sidebar.locator('[data-nav-path="/kesfet"]').getAttribute('aria-current') !== 'page') throw new Error(scenario.name + ' active navigation item is not marked');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('site-sidebar')?.hidden === true);
    if (await menuToggle.getAttribute('aria-expanded') !== 'false' || await sidebar.isVisible()) throw new Error(scenario.name + ' Escape did not close navigation');
    await menuToggle.click();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    await page.mouse.click(viewportWidth - 8, 12);
    await page.waitForFunction(() => document.getElementById('site-sidebar')?.hidden === true);
    if (await menuToggle.getAttribute('aria-expanded') !== 'false' || await sidebar.isVisible()) throw new Error(scenario.name + ' outside click did not close navigation');
    await menuToggle.click();
    await sidebar.getByRole('link', { name: /Kullanıcı Paneli/ }).click();
    await page.waitForURL(url => url.pathname === '/');
    if (page.url().split('?')[0] !== baseUrl + '/') throw new Error(scenario.name + ' user panel shortcut did not navigate to the account dashboard');
    if (!(await page.getByRole('heading', { name: /Maceracı Paneli/ }).count())) throw new Error(scenario.name + ' player dashboard heading is missing');
    if (!(await page.getByText('Henüz bağlı karakter yok').count())) throw new Error(scenario.name + ' expected isolated empty-character state is missing');
    if (!(await page.locator('form[action="/maceraci/link"]').count())) throw new Error(scenario.name + ' character-link form is missing from the user dashboard');
    await context.close();
    process.stdout.write('PASS ' + scenario.name + ' /login /register and authenticated left navigation\n');
  } finally {
    await browser.close();
  }
}

const api = await request.newContext({ timeout: 30000 });
try {
  const loginPage = await api.get(baseUrl + '/login');
  if (loginPage.status() !== 200) throw new Error('Local site login form is unavailable: HTTP ' + loginPage.status());
  const loginHtml = await loginPage.text();
  const invalidCsrf = await api.post(baseUrl + '/login', { form: { csrf: 'invalid', username: 'smoke-user', password: 'not-a-real-password' } });
  if (invalidCsrf.status() !== 403) throw new Error('Invalid site-login CSRF was not rejected: HTTP ' + invalidCsrf.status());
  const response = await api.get(baseUrl + '/owner/login', { maxRedirects: 0 });
  const location = response.headers()['location'] || '';
  if (response.status() !== 302 || !location.startsWith('https://discord.com/oauth2/authorize')) {
    throw new Error('Owner OAuth redirect is not healthy: HTTP ' + response.status() + ' ' + location.slice(0, 120));
  }
  const authorize = new URL(location);
  const state = authorize.searchParams.get('state') || '';
  if (!authorize.searchParams.get('client_id') || !authorize.searchParams.get('redirect_uri') || authorize.searchParams.get('response_type') !== 'code' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state)) {
    throw new Error('Owner OAuth authorization request is missing valid client, callback, response type or state');
  }
  const invalidCallback = await api.get(baseUrl + '/owner/callback?code=smoke-test&state=invalid-state', { maxRedirects: 0 });
  if (invalidCallback.status() !== 400) throw new Error('Invalid OAuth callback state was not rejected: HTTP ' + invalidCallback.status());
  process.stdout.write('PASS site-login CSRF rejection and owner OAuth authorize redirect, signed state, OAuth parameters and invalid callback rejection\n');
} finally {
  await api.dispose();
}
