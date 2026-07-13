import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);

const apiData = {};
page.on('response', async resp => {
  const url = resp.url().replace('http://localhost:8880','');
  if (url.includes('/api/overview/') || url.includes('/api/utm-incidents')) {
    try {
      const body = await resp.json().catch(() => null);
      if (body) apiData[url.split('?')[0]] = JSON.stringify(body).slice(0,200);
    } catch(e) {}
  }
});

await page.goto('http://localhost:8880/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(4000);

// Check if dashboard overview is actually rendered
const cards = await page.$$('.card, app-kpi, .kpi-card');
const charts = await page.$$('canvas');
const hasContent = await page.evaluate(() => {
  const content = document.querySelector('.app-content');
  const kpi = document.querySelector('app-kpi-strip');
  return {
    contentLen: content?.innerHTML?.length ?? 0,
    hasKpi: !!kpi,
    kpiText: kpi?.textContent?.slice(0,100) ?? ''
  };
});

console.log('Cards:', cards.length, 'Charts:', charts.length);
console.log('Has KPI strip:', hasContent.hasKpi);
console.log('Content length:', hasContent.contentLen);
console.log('KPI text:', hasContent.kpiText);
console.log('API data:', JSON.stringify(Object.keys(apiData)));

await page.screenshot({ path: '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/dashboard.png', fullPage: true });
console.log('Screenshot saved');
await b.close();
