import { chromium, webkit, request } from 'playwright';
import { createPublicSiteSession } from '../owner-dashboard.js';
import { renderExplorationAtlas } from '../exploration-atlas.js';

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
    const browserErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    const siteSession = createPublicSiteSession(
      process.env.ADMIN_SESSION_SECRET,
      { id: 'site_123e4567-e89b-12d3-a456-426614174000', username: 'Smoke Gezgin' },
      Math.floor(Date.now() / 1000) + 3600
    );
    await context.addCookies([{ name: 'frieren_site_session', value: siteSession, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
    for (const route of ['/login']) {
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
        controls: [...document.querySelectorAll('input,button,select,textarea,a.btn[href="/site/discord/login"]')].map(node => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return { left: rect.left, right: rect.right, height: rect.height, visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && node.type !== 'hidden' };
        }).filter(control => control.visible)
      }));
      if (!layout.viewport) throw new Error(scenario.name + ' ' + route + ' missing mobile viewport metadata');
      const discordLogin = await page.locator('a[href="/site/discord/login"]').count();
      if (!discordLogin) {
        const diagnostics = await page.evaluate(() => ({
          title: document.title,
          url: location.href,
          forms: [...document.forms].map(form => form.getAttribute('action')),
          inputs: [...document.querySelectorAll('input')].map(input => ({ name: input.name, type: input.type })),
          body: document.body.innerText.slice(0, 240)
        }));
        throw new Error(scenario.name + ' ' + route + ' missing Discord sign-in action: ' + JSON.stringify(diagnostics));
      }
      if (layout.documentWidth > layout.width + 1) throw new Error(scenario.name + ' ' + route + ' horizontal overflow: ' + layout.documentWidth + ' > ' + layout.width);
      if (layout.controls.some(control => control.left < -1 || control.right > layout.width + 1 || control.height < 44)) {
        throw new Error(scenario.name + ' ' + route + ' has clipped or undersized controls: ' + JSON.stringify(layout.controls));
      }
    }
    const playerPage = await page.goto(baseUrl + '/kesfet', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!playerPage || playerPage.status() !== 200) throw new Error(scenario.name + ' authenticated site page HTTP ' + (playerPage?.status() || 'no response'));
    const atlasKeys = [
      ['merkez', 'Merkez Topraklar', 1], ['orman', 'Größe Ormanı', 1],
      ['harabeler', 'Harabeler', 10], ['kuzey', 'Kuzey Toprakları', 20],
      ['yayla', 'Kuzey Yaylaları', 35], ['aus', 'Ende', 50]
    ];
    const atlasRegions = atlasKeys.map(([key, name, minLevel]) => ({
      region: { key, name, minLevel, emoji: '✧' },
      visits: 1, discovered: true, unlocked: true, state: 'discovered',
      masteryLevel: 0, visitsToNextMastery: 1, masteryProgressPercent: 33,
      bosses: [], dungeons: [], rareItems: [], dungeonWins: 0
    }));
    const atlasMarkup = renderExplorationAtlas({
      mapContent: {
        regions: atlasRegions,
        summary: { discoveredRegions: 1, totalRegions: 6, defeatedBosses: 0, totalBosses: 0, totalDungeons: 0 }
      },
      stats: {}
    });
    await page.setContent('<!doctype html><html lang="tr"><body>' + atlasMarkup + '</body></html>');
    await page.addScriptTag({ url: baseUrl + '/assets/exploration-atlas.js?v=atlas-365-1' });
    const terrainLayer = page.locator('[data-atlas-geography-layer="terrain-details"]');
    const terrainToggle = page.locator('[data-atlas-geography="terrain-details"]');
    if (await terrainLayer.count() !== 1 || await terrainLayer.getAttribute('hidden') !== null) {
      throw new Error(scenario.name + ' atlas terrain detail layer did not render visibly');
    }
    await terrainToggle.click();
    if (await terrainLayer.getAttribute('hidden') === null) throw new Error(scenario.name + ' atlas terrain detail toggle did not hide the SVG layer');
    await terrainToggle.click();
    if (await terrainLayer.getAttribute('hidden') !== null) throw new Error(scenario.name + ' atlas terrain detail toggle did not restore the SVG layer');
    await page.locator('select[data-atlas-weather]').selectOption('snow');
    const snowMode = await page.locator('.atlas-map-art').getAttribute('data-atlas-weather');
    if (snowMode !== 'snow') throw new Error(scenario.name + ' atlas snow mode was not applied');
    await page.locator('select[data-atlas-weather]').selectOption('rain');
    const rainMode = await page.locator('.atlas-map-art').getAttribute('data-atlas-weather');
    if (rainMode !== 'rain') throw new Error(scenario.name + ' atlas rain mode was not applied');
    const lightingToggle = page.locator('[data-atlas-lighting-toggle]');
    await lightingToggle.click();
    if (await page.locator('.atlas-map-art').getAttribute('data-atlas-lighting') !== 'night' || await lightingToggle.getAttribute('aria-pressed') !== 'true') {
      throw new Error(scenario.name + ' atlas night mode did not apply accessibly');
    }
    await lightingToggle.click();
    if (await page.locator('.atlas-map-art').getAttribute('data-atlas-lighting') !== 'day' || await lightingToggle.getAttribute('aria-pressed') !== 'false') {
      throw new Error(scenario.name + ' atlas day mode did not restore correctly');
    }
    await page.locator('[data-atlas-open]').first().click();
    if (await page.locator('[data-atlas-modal]').isHidden()) throw new Error(scenario.name + ' atlas marker click did not open its region detail panel');
    await page.locator('[data-atlas-close]').first().click();
    if (!(await page.locator('[data-atlas-modal]').isHidden())) throw new Error(scenario.name + ' atlas region detail panel did not close');
    const encyclopediaPage = await page.goto(baseUrl + '/ansiklopedi', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!encyclopediaPage || encyclopediaPage.status() !== 200) throw new Error(scenario.name + ' character encyclopedia HTTP ' + (encyclopediaPage?.status() || 'no response'));
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForTimeout(300);
    const accessibilityPanel = page.locator('[data-accessibility-panel]');
    if (await accessibilityPanel.count() !== 1) throw new Error(scenario.name + ' accessibility controls are missing');
    await accessibilityPanel.locator('summary').click();
    await accessibilityPanel.locator('[data-accessibility-font="large"]').click();
    await accessibilityPanel.locator('[data-accessibility-contrast]').click();
    await accessibilityPanel.locator('[data-accessibility-motion]').click();
    const accessibilityState = await page.evaluate(() => ({
      font: document.documentElement.dataset.a11yFont,
      contrast: document.documentElement.dataset.a11yContrast,
      motion: document.documentElement.dataset.a11yMotion,
      saved: Boolean(localStorage.getItem('frieren-accessibility-v1'))
    }));
    if (accessibilityState.font !== 'large' || accessibilityState.contrast !== 'high' || accessibilityState.motion !== 'reduce' || !accessibilityState.saved) {
      throw new Error(scenario.name + ' accessibility controls did not apply and persist: ' + JSON.stringify(accessibilityState));
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    const restoredAccessibility = await page.evaluate(() => ({
      font: document.documentElement.dataset.a11yFont,
      contrast: document.documentElement.dataset.a11yContrast,
      motion: document.documentElement.dataset.a11yMotion
    }));
    if (restoredAccessibility.font !== 'large' || restoredAccessibility.contrast !== 'high' || restoredAccessibility.motion !== 'reduce') {
      throw new Error(scenario.name + ' accessibility preferences were not restored after reload: ' + JSON.stringify(restoredAccessibility));
    }
    const encyclopediaDiagnostics = await page.evaluate(() => ({
      root: Boolean(document.querySelector('[data-character-encyclopedia]')),
      ready: document.querySelector('[data-character-encyclopedia]')?.dataset.characterEncyclopediaReady || null,
      script: [...document.scripts].filter(script => script.src.includes('character-encyclopedia.js')).map(script => ({ src: script.src, defer: script.defer }))
    }));
    if (encyclopediaDiagnostics.ready !== 'true') throw new Error(scenario.name + ' character encyclopedia did not initialize: ' + JSON.stringify({ encyclopediaDiagnostics, browserErrors, pageErrors, failedRequests }));
    await page.locator('[data-character-search]').fill('frieren');
    const frierenAnimeOption = await page.locator('[data-character-anime] option').evaluateAll(options => options.map(option => option.value).find(value => value.includes('Frieren')));
    if (!frierenAnimeOption) throw new Error(scenario.name + ' character encyclopedia is missing the Frieren series filter');
    await page.locator('[data-character-anime]').selectOption(frierenAnimeOption);
    await page.locator('[data-character-rarity]').selectOption('Efsanevi');
    const visibleCharacterCount = await page.locator('[data-character-card]:visible').count();
    if (visibleCharacterCount < 1) throw new Error(scenario.name + ' character encyclopedia filters returned no expected Frieren character');
    const spoilerButton = page.locator('[data-character-card]:visible').first().locator('[data-character-spoiler-toggle]');
    const spoilerDetails = page.locator('[data-character-card]:visible').first().locator('[data-character-spoiler]');
    if (!(await spoilerDetails.isHidden())) throw new Error(scenario.name + ' character encyclopedia exposed spoiler details by default');
    await spoilerButton.click();
    const revealedSpoiler = await page.evaluate(() => {
      const root = document.querySelector('[data-character-encyclopedia]');
      const button = root?.querySelector('[data-character-card]:not([hidden]) [data-character-spoiler-toggle]');
      const details = root?.querySelector('[data-character-card]:not([hidden]) [data-character-spoiler]');
      return { ready: root?.dataset.characterEncyclopediaReady, expanded: button?.getAttribute('aria-expanded'), hidden: details?.hidden, script: [...document.scripts].some(script => script.src.includes('character-encyclopedia.js')) };
    });
    if (await spoilerDetails.isHidden() || await spoilerButton.getAttribute('aria-expanded') !== 'true') throw new Error(scenario.name + ' character spoiler reveal did not open accessibly: ' + JSON.stringify(revealedSpoiler));
    await spoilerButton.click();
    if (!(await spoilerDetails.isHidden()) || await spoilerButton.getAttribute('aria-expanded') !== 'false') throw new Error(scenario.name + ' character spoiler toggle did not close');
    const encyclopediaLayout = await page.evaluate(() => ({ width: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
    if (encyclopediaLayout.documentWidth > encyclopediaLayout.width + 1) throw new Error(scenario.name + ' character encyclopedia horizontal overflow: ' + JSON.stringify(encyclopediaLayout));
    await page.setContent('<main class="profile-page"><input data-profile-achievement-search><select data-profile-achievement-sort><option value="date-desc">Yeni</option><option value="name-asc">Ad</option></select><output id="profile-achievement-count"></output><div id="profile-achievement-list"><article data-achievement-name="frieren" data-achievement-date="2" data-achievement-reward="20">Frieren</article><article data-achievement-name="fern" data-achievement-date="1" data-achievement-reward="10">Fern</article></div><div id="profile-activity-list"><li data-activity-type="macera">Macera</li><li data-activity-type="başarım">Başarım</li></div><button type="button" data-profile-activity-filter="all">Tümü</button><button type="button" data-profile-activity-filter="başarım">Başarım</button><form id="profile-settings-form"><select name="showStats"><option value="false" selected>Gizli</option><option value="true">Açık</option></select><select name="showAchievements"><option value="true" selected>Açık</option><option value="false">Gizli</option></select><select name="showCollections"><option value="true" selected>Açık</option><option value="false">Gizli</option></select><select name="showActivity"><option value="false" selected>Gizli</option><option value="true">Açık</option></select><select name="showCosmetics"><option value="true" selected>Açık</option><option value="false">Gizli</option></select><select name="activeTitle"><option value="">Varsayılan</option></select></form><section data-profile-privacy="showStats">İstatistik</section><section data-profile-privacy="showActivity">Günlük</section><button type="button" id="profile-preview-toggle">Önizleme</button><button type="button" id="profile-settings-reset">Sıfırla</button><p id="profile-preview-note" hidden>Önizleme notu</p></main>');
    await page.addScriptTag({ url: baseUrl + '/assets/profile-interactions.js' });
    await page.locator('[data-profile-achievement-search]').fill('frieren');
    if (await page.locator('#profile-achievement-count').textContent() !== '1 / 2 başarım') throw new Error(scenario.name + ' achievement search did not filter');
    await page.locator('[data-profile-achievement-search]').fill('');
    await page.locator('[data-profile-achievement-sort]').selectOption('name-asc');
    const sortedNames = await page.locator('#profile-achievement-list article').allTextContents();
    if (sortedNames.join(',') !== 'Fern,Frieren') throw new Error(scenario.name + ' achievement sorting did not reorder entries');
    await page.locator('[data-profile-activity-filter="başarım"]').click();
    if (!(await page.locator('#profile-activity-list li[data-activity-type="macera"]').isHidden())) throw new Error(scenario.name + ' adventure journal filter did not hide other entries');
    await page.locator('#profile-preview-toggle').click();
    if (!(await page.locator('[data-profile-privacy="showStats"]').isHidden())) throw new Error(scenario.name + ' privacy preview did not hide disabled statistics');
    await page.locator('select[name="showStats"]').selectOption('true');
    if (await page.locator('[data-profile-privacy="showStats"]').isHidden()) throw new Error(scenario.name + ' privacy preview did not reflect draft changes');
    await page.locator('#profile-settings-reset').click();
    if (!(await page.locator('[data-profile-privacy="showStats"]').isHidden())) throw new Error(scenario.name + ' privacy reset did not restore default draft');
    await page.locator('#profile-preview-toggle').click();
    if (await page.locator('[data-profile-privacy="showStats"]').isHidden()) throw new Error(scenario.name + ' closing privacy preview did not restore profile sections');

    await page.setContent('<form id="action-test" action="/unused"><input type="hidden" name="serverAction" value="kept"><button type="submit" name="action" value="feature-save">Kaydet</button></form>');
    await page.addScriptTag({ url: baseUrl + '/assets/site-actions.js' });
    await page.evaluate(() => {
      window.siteSubmitEvents = [];
      document.addEventListener('submit', event => {
        window.siteSubmitEvents.push({ prevented: event.defaultPrevented, name: event.submitter?.name, value: event.submitter?.value, disabled: event.submitter?.disabled });
        event.preventDefault();
      });
    });
    const actionButton = page.locator('#action-test button[type="submit"]');
    await actionButton.click();
    await actionButton.click();
    const actionEvents = await page.evaluate(() => window.siteSubmitEvents);
    if (actionEvents.length !== 2 || actionEvents[0].value !== 'feature-save' || actionEvents[0].disabled || !actionEvents[1].prevented) {
      throw new Error(scenario.name + ' shared action handler broke named form controls or duplicate-submit protection: ' + JSON.stringify(actionEvents));
    }
    const restoredPlayerPage = await page.goto(baseUrl + '/kesfet', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!restoredPlayerPage || restoredPlayerPage.status() !== 200) throw new Error(scenario.name + ' restored authenticated site page HTTP ' + (restoredPlayerPage?.status() || 'no response'));
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
    const maxMenuWidth = scenario.isMobile ? 340 : 440;
    if (menuStyle.position !== 'fixed' || menuStyle.left > 24 || menuStyle.top > 80 || menuStyle.width > maxMenuWidth || (!scenario.isMobile && menuStyle.width < 380)) throw new Error(scenario.name + ' navigation width or anchored popover layout is invalid: ' + JSON.stringify(menuStyle));
    const playerShortcut = sidebar.locator('[data-nav-path="/"]');
    if (await playerShortcut.count() !== 1) throw new Error(scenario.name + ' missing player interface shortcut; nav=' + await sidebar.innerText());
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
    await playerShortcut.click();
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
  const disabledPasswordLogin = await api.post(baseUrl + '/login', { form: { username: 'legacy-user', password: 'not-a-real-password' } });
  if (disabledPasswordLogin.status() !== 405) throw new Error('Password login endpoint is not disabled: HTTP ' + disabledPasswordLogin.status());
  const disabledRegistration = await api.get(baseUrl + '/register', { maxRedirects: 0 });
  if (disabledRegistration.status() !== 303 || new URL(disabledRegistration.headers()['location'] || '/', baseUrl).pathname !== '/login') throw new Error('Legacy registration route does not redirect to Discord sign-in');
  const siteOAuth = await api.get(baseUrl + '/site/discord/login', { maxRedirects: 0 });
  const siteLocation = siteOAuth.headers()['location'] || '';
  if (siteOAuth.status() !== 302 || !siteLocation.startsWith('https://discord.com/oauth2/authorize')) throw new Error('Public site Discord OAuth redirect is not healthy: HTTP ' + siteOAuth.status());
  const siteAuthorize = new URL(siteLocation);
  if (siteAuthorize.searchParams.get('scope') !== 'identify' || !siteAuthorize.searchParams.get('redirect_uri')) throw new Error('Public site Discord OAuth must request identify only and provide a callback URL');
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
