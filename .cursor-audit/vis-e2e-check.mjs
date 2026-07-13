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
  const failures = [], runReqs = [], runResps = [];
  page.on('response', async res => {
    if (res.status() >= 400 && !res.url().includes('management/health') && !res.url().includes('/account'))
      failures.push({ url: res.url(), status: res.status() });
    if (res.url().includes('utm-visualizations/run')) {
      let body = ''; try { body = (await res.text()).slice(0, 200); } catch {}
      runResps.push({ status: res.status(), body });
    }
  });
  page.on('request', req => {
    if (req.url().includes('utm-visualizations/run'))
      try { runReqs.push(JSON.parse(req.postData() || '{}')); } catch {}
  });
  const out = { steps: [], failures: [], runReqs: [], runResps: [] };

  // Login
  await page.goto(`${BASE}/creator/visualization/list`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/creator/visualization/list`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
    out.steps.push('logged in');
  }

  // 1. Check visualization list loaded
  await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
  const rows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  out.steps.push(`vis-list: ${rows} rows rendered`);

  // 2. Check breadcrumb buttons are projected
  const btns = await page.evaluate(() => {
    const bar = document.querySelector('app-utm-breadcrumb-bar');
    return bar ? Array.from(bar.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
  });
  out.steps.push(`breadcrumb buttons: ${JSON.stringify(btns)}`);

  // 3. Open "New visualization" modal
  try {
    await page.getByText('New visualization', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);
    const chartCards = await page.evaluate(() => document.querySelectorAll('.card-icon').length);
    out.steps.push(`chart picker modal: ${chartCards} chart types`);
    // Select Bar chart
    await page.locator('.card-icon').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    out.steps.push('selected first chart type');
    // Click Create visualization
    await page.getByText('Create visualization', { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    out.steps.push(`after create → url: ${page.url()}`);
  } catch (e) { out.steps.push('modal flow failed: ' + e.message); }

  // 4. On chart builder — check run
  if (page.url().includes('chart-builder')) {
    await page.waitForTimeout(2000);
    try {
      await page.locator('button:has-text("Run"), .cb-run-btn').first().click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      out.steps.push('clicked Run');
    } catch (e) { out.steps.push('Run click failed: ' + e.message); }

    const errorToast = await page.evaluate(() => {
      return !!document.querySelector('.ngx-toastr.toast-error, .toast-error');
    });
    out.steps.push(`error toast after run: ${errorToast}`);
    out.runReqs = runReqs.map(r => ({ chartType: r.chartType, queryLanguage: r.queryLanguage }));
    out.runResps = runResps;
  }

  out.failures = failures.filter(f => !f.url.includes('account') && !f.url.includes('health'));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
