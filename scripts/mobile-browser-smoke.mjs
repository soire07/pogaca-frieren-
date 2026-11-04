import { chromium, webkit, request } from 'playwright';

const baseUrl = String(process.env.MOBILE_SMOKE_BASE_URL || 'https://frierenbot.vercel.app').replace(/\/$/, '');
const scenarios = [
  { name: 'Android Chrome viewport', engine: chromium, viewport: { width: 412, height: 915 }, isMobile: true },
  { name: 'iOS Safari viewport', engine: webkit, viewport: { width: 390, height: 844 }, isMobile: true }
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
    for (const route of ['/login', '/register']) {
      const response = await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || response.status() !== 200) throw new Error(scenario.name + ' ' + route + ' HTTP ' + (response?.status() || 'no response'));
      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewport: Boolean(document.querySelector('meta[name="viewport"]')),
        form: Boolean(document.querySelector('form')),
        controls: [...document.querySelectorAll('input,button,select,textarea')].map(node => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, height: rect.height };
        })
      }));
      if (!layout.viewport || !layout.form) throw new Error(scenario.name + ' ' + route + ' missing mobile viewport or form');
      if (layout.documentWidth > layout.width + 1) throw new Error(scenario.name + ' ' + route + ' horizontal overflow: ' + layout.documentWidth + ' > ' + layout.width);
      if (layout.controls.some(control => control.left < -1 || control.right > layout.width + 1 || control.height < 32)) {
        throw new Error(scenario.name + ' ' + route + ' has clipped or undersized controls');
      }
    }
    await context.close();
    process.stdout.write('PASS ' + scenario.name + ' /login /register layout\n');
  } finally {
    await browser.close();
  }
}

const api = await request.newContext({ timeout: 30000 });
try {
  const response = await api.get(baseUrl + '/owner/login', { maxRedirects: 0 });
  const location = response.headers()['location'] || '';
  const stateCookie = response.headers()['set-cookie'] || '';
  if (response.status() !== 302 || !location.startsWith('https://discord.com/oauth2/authorize')) {
    throw new Error('Owner OAuth redirect is not healthy: HTTP ' + response.status() + ' ' + location.slice(0, 120));
  }
  if (!stateCookie.includes('frieren_owner_oauth_state')) throw new Error('Owner OAuth state cookie is missing');
  process.stdout.write('PASS owner OAuth authorize redirect and state cookie\n');
} finally {
  await api.dispose();
}
