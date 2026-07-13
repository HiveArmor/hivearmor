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

async function auditPage(page, url, label) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  const snap = await page.evaluate((lbl) => {
    // Check overflow issues
    const scrollX = document.body.scrollWidth > window.innerWidth;
    const scrollY = document.body.scrollHeight > window.innerHeight;
    // Detect hardcoded light colors
    const lightEls = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return false;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const lum = (parseInt(m[1]) * 299 + parseInt(m[2]) * 587 + parseInt(m[3]) * 114) / 1000;
      return lum > 200;
    }).slice(0, 5).map(el => ({ tag: el.tagName, cls: el.className.toString().slice(0, 60), bg: getComputedStyle(el).backgroundColor }));
    // Measure key containers
    const filterBar = document.querySelector('.module-filter-bar');
    const cards = document.querySelectorAll('.playbook-card');
    const pagination = document.querySelector('ngb-pagination');
    const interactiveLayout = document.querySelector('.interactive-console-layout');
    return {
      label: lbl,
      hasHorizontalScroll: scrollX,
      hasVerticalOverflow: scrollY,
      filterBarHeight: filterBar ? Math.round(filterBar.getBoundingClientRect().height) : null,
      cardCount: cards.length,
      cardWidths: Array.from(cards).slice(0, 2).map(c => Math.round(c.getBoundingClientRect().width)),
      paginationFound: !!pagination,
      interactiveLayoutHeight: interactiveLayout ? Math.round(interactiveLayout.getBoundingClientRect().height) : null,
      lightColorEls: lightEls.length,
    };
  }, label);
  return snap;
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${BASE}/soar/flows`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }

  const results = [];
  results.push(await auditPage(page, '/soar/flows', 'flows'));
  results.push(await auditPage(page, '/soar/audit', 'audit'));
  results.push(await auditPage(page, '/soar/interactive-console', 'interactive-console'));
  results.push(await auditPage(page, '/soar/create-flow', 'create-flow'));

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
