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
  const runResponses = [];
  const consoleErrors = [];

  page.on('response', async (res) => {
    if (res.url().includes('utm-visualizations/run')) {
      let body = '';
      try { body = (await res.text()).slice(0, 800); } catch (e) {}
      runResponses.push({ status: res.status(), body });
    }
  });
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

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

  // Wait for the page to load, select a source, then click Run
  await page.waitForTimeout(2000);

  // Click Run button
  try {
    await page.locator('.cb-run-btn, button:has-text("Run")').first().click({ timeout: 8000 });
    await page.waitForTimeout(3000);
  } catch (e) { console.error('Run click failed:', e.message); }

  // Intercept a run by directly calling the API with a minimal payload that mirrors what the frontend sends
  // but with the correct enum value
  const apiResults = [];
  const chartTypes = ['VERTICAL_BAR_CHART', 'BAR_CHART', 'PIE_CHART'];
  for (const ct of chartTypes) {
    const minimal = {
      chartType: ct,
      queryLanguage: 'DSL',
      filterType: [{ field: '@timestamp', operator: 'is_between', value: ['now-24h', 'now'] }],
      aggregationType: { metrics: [{ id: 1, aggregation: 'COUNT', field: null, customLabel: '' }], bucket: null },
      chartConfig: { legend: {}, colors: {}, toolbox: {}, grid: {} },
      chartAction: { enable: false },
      idPattern: null, name: '', pattern: 'v11-log-*', eventType: null
    };
    const res = await page.evaluate(async (payload) => {
      try {
        const r = await fetch('/api/utm-visualizations/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await r.text();
        return { chartType: payload.chartType, status: r.status, body: text.slice(0, 600) };
      } catch (e) { return { chartType: payload.chartType, error: String(e) }; }
    }, minimal);
    apiResults.push(res);
  }

  console.log(JSON.stringify({ runResponses, apiResults, consoleErrors: consoleErrors.slice(0, 8) }, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
