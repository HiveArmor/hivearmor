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
  const failures = [];
  const consoleErrors = [];

  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let bodySnippet = '';
      try { bodySnippet = (await res.text()).slice(0, 300); } catch (e) {}
      failures.push({ url: res.url(), status: res.status(), body: bodySnippet });
    }
  });
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 300)));

  await page.goto(`${BASE}/data/alert/view`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/data/alert/view`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
  }
  await page.waitForTimeout(3000);

  // Filter to the alert-listing related failures
  const alertFails = failures.filter(f => /alert|search|_search|index-pattern|elastic|values/i.test(f.url));

  console.log(JSON.stringify({
    failedRequests: failures.slice(0, 12),
    alertRelatedFailures: alertFails.slice(0, 8),
    consoleErrors: consoleErrors.slice(0, 12),
  }, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
