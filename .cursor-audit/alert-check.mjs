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
  const out = { steps: [] };

  await page.goto(`${BASE}/data/alert/view`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/data/alert/view`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
    out.steps.push('logged in');
  }

  // select first alert row checkbox
  try {
    await page.waitForSelector('tbody tr', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.locator('tbody tr .list-icons i.icon-checkbox-unchecked').first().click({ timeout: 8000, force: true });
    await page.waitForTimeout(1200);
    out.steps.push('selected first alert row');
  } catch (e) { out.steps.push('select failed: ' + e.message); }

  out.reportIncident = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, span, a'));
    const el = btns.find(b => (b.textContent || '').trim().startsWith('Report incident'));
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const chain = [];
    let n = el;
    for (let i = 0; i < 5 && n; i++) { chain.push(n.tagName + '.' + (n.className || '').toString().slice(0, 50)); n = n.parentElement; }
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      position: cs.position, float: cs.cssFloat, margin: cs.margin, display: cs.display,
      parents: chain,
    };
  });

  // Also report the toolbar layout + columns + status filter
  out.toolbar = await page.evaluate(() => {
    const time = document.querySelector('.time-filter-trigger');
    const status = document.querySelector('app-status-filter');
    const heads = Array.from(document.querySelectorAll('thead th')).map(th => (th.textContent || '').trim()).filter(Boolean);
    const noData = document.body.innerText.includes('No data found');
    return {
      columnHeaders: heads,
      noData,
      timeTriggerWidth: time ? Math.round(time.getBoundingClientRect().width) : null,
      statusFilterFound: !!status,
      statusFilterRect: status ? (() => { const r = status.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
      statusText: status ? (status.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
