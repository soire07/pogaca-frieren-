import { lookup } from 'node:dns/promises';
import { chromium, webkit } from 'playwright';

const configuredUrl = String(process.env.SITE_SMOKE_BASE_URL || 'https://frierenbot.vercel.app').trim();
const baseUrl = new URL(configuredUrl);
const allowedHost = 'frierenbot.vercel.app';

if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== allowedHost || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
  throw new Error('Production smoke accepts only the canonical HTTPS Frieren site origin.');
}

const dnsRecords = await lookup(baseUrl.hostname, { all: true, verbatim: true });
if (!dnsRecords.length) throw new Error('DNS lookup returned no addresses for ' + baseUrl.hostname);
process.stdout.write('PASS external DNS lookup: ' + baseUrl.hostname + ' -> ' + dnsRecords.map(record => record.address).join(', ') + '\n');

const routes = [
  { path: '/login', label: 'login page', requiresDiscordAction: true },
  { path: '/tanitim', label: 'public introduction page', minimumTextLength: 100 },
  { path: '/', label: 'site root' }
];
const assets = [
  { path: '/assets/site.css?v=atlas-370-1', label: 'site stylesheet' },
  { path: '/assets/exploration-atlas.js?v=atlas-371-1', label: 'world atlas client script' }
];
const engines = [
  { name: 'Chromium / Android-sized viewport', engine: chromium, viewport: { width: 412, height: 915 }, mobile: true },
  { name: 'WebKit / iOS-sized viewport', engine: webkit, viewport: { width: 390, height: 844 }, mobile: true }
];

for (const asset of assets) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(new URL(asset.path, baseUrl), { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (response.status !== 200) throw new Error('HTTP ' + response.status);
      const body = await response.arrayBuffer();
      if (!body.byteLength) throw new Error('empty response body');
      process.stdout.write('PASS ' + asset.label + ': HTTP 200 (' + body.byteLength + ' bytes)\n');
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      process.stderr.write('WARN ' + asset.label + ' attempt ' + attempt + '/3: ' + error.message + '\n');
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  if (lastError) throw new Error(asset.label + ' failed after 3 attempts: ' + lastError.message);
}

for (const scenario of engines) {
  const browser = await scenario.engine.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: 2,
      isMobile: scenario.mobile,
      hasTouch: true
    });

    for (const route of routes) {
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        try {
          const response = await page.goto(new URL(route.path, baseUrl).toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          });
          if (!response) throw new Error('navigation returned no HTTP response');
          if (response.status() !== 200) throw new Error('HTTP ' + response.status());
          if (new URL(page.url()).origin !== baseUrl.origin) throw new Error('redirected outside the canonical site origin');
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          const details = await page.evaluate(() => ({
            title: document.title,
            textLength: (document.body?.innerText || '').trim().length,
            width: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            hasViewport: Boolean(document.querySelector('meta[name="viewport"]')),
            hasDiscordAction: Boolean(document.querySelector('a[href="/site/discord/login"]'))
          }));
          if (!details.title) throw new Error('document title is empty');
          if (details.documentWidth > details.width + 1) throw new Error('horizontal overflow: ' + details.documentWidth + ' > ' + details.width);
          if (!details.hasViewport) throw new Error('responsive viewport metadata is missing');
          if (route.requiresDiscordAction && !details.hasDiscordAction) throw new Error('Discord sign-in action is missing');
          if (route.minimumTextLength && details.textLength < route.minimumTextLength) throw new Error('public page content is unexpectedly short: ' + details.textLength + ' characters');
          if (pageErrors.length) throw new Error('browser page errors: ' + pageErrors.join(' | '));
          process.stdout.write('PASS ' + scenario.name + ' · ' + route.label + ': HTTP 200, title, responsive layout, no page errors\n');
          lastError = null;
          await page.close();
          break;
        } catch (error) {
          lastError = error;
          process.stderr.write('WARN ' + scenario.name + ' · ' + route.path + ' attempt ' + attempt + '/3: ' + error.message + '\n');
          await page.close().catch(() => {});
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      if (lastError) throw new Error(scenario.name + ' · ' + route.path + ' failed after 3 attempts: ' + lastError.message);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

process.stdout.write('PASS Vercel production external browser smoke completed. This is hosted-browser emulation, not a physical-device test.\n');
