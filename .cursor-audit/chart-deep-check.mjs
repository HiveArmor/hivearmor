import { chromium } from 'playwright';
const BASE = 'http://localhost:4200';

async function waitApp(page) {
  await page.waitForLoadState('domcontentloaded');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const txt = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '');
    if (!txt.includes('Preparing your workspace')) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const runRequests = [], runResponses = [], consoleErrors = [];

  page.on('request', req => {
    if (req.url().includes('utm-visualizations/run')) {
      try { runRequests.push({ body: JSON.parse(req.postData() || '{}') }); } catch {}
    }
  });
  page.on('response', async res => {
    if (res.url().includes('utm-visualizations/run')) {
      let body = '';
      try { body = (await res.text()).slice(0, 800); } catch {}
      runResponses.push({ status: res.status(), body });
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 400)));

  await page.goto(`${BASE}/creator/builder/chart-builder?chart=BAR_CHART`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/creator/builder/chart-builder?chart=BAR_CHART`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
  }

  // Wait for page to settle, select a source pattern
  await page.waitForTimeout(2000);

  // Check what the Angular component state looks like after load
  const angularState = await page.evaluate(() => {
    // Find the chart-builder component via Angular
    const el = document.querySelector('app-chart-builder');
    if (!el) return { found: false };
    try {
      const ng = window['ng'];
      if (ng) {
        const comp = ng.getComponent(el);
        return {
          found: true,
          chart: comp ? comp['chart'] : null,
          pattern: comp ? comp['pattern'] : null,
          visualization_chartType: comp && comp['visualization'] ? comp['visualization']['chartType'] : null,
          isSqlMode: comp ? comp['isSqlMode'] : null,
          loading: comp ? comp['loading'] : null,
        };
      }
    } catch (e) {}
    return { found: true, note: 'Angular debug API not available' };
  });

  // Click Run
  try {
    await page.locator('button:has-text("Run"), .cb-run-btn').first().click({ timeout: 8000 });
    await page.waitForTimeout(4000);
  } catch (e) { console.error('Run click failed:', e.message); }

  // Check error state
  const errorState = await page.evaluate(() => {
    const errorEl = document.querySelector('[class*="error"], .run-with-error, app-no-data-chart');
    const chartEl = document.querySelector('.viewer-container');
    return {
      errorElFound: !!errorEl,
      errorText: errorEl ? (errorEl.textContent || '').trim().slice(0, 100) : null,
      chartElHtml: chartEl ? chartEl.innerHTML.slice(0, 400) : null,
    };
  });

  console.log(JSON.stringify({
    angularState,
    runRequests: runRequests.map(r => ({
      chartType: r.body.chartType,
      pattern: r.body.pattern,
      queryLanguage: r.body.queryLanguage,
      aggregationType: r.body.aggregationType,
    })),
    runResponses,
    errorState,
    consoleErrors: consoleErrors.slice(0, 10),
  }, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
