import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(2000);

// Key question: does writeValue error BREAK page rendering, or is it cosmetic?
const results = [];
for (const url of ['/soar', '/alerting-rules', '/creator']) {
  const errors = [], rendered = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('http://localhost:8880' + url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2500);
  
  // Check if page actually rendered content
  const bodyLen = await page.evaluate(() => document.querySelector('.app-content')?.innerHTML?.length ?? 0);
  const hasTable = await page.$('table, .card, .list-group') !== null;
  const hasForm = await page.$('form, ng-select, input') !== null;
  
  results.push({ url, errors: errors.filter(e => e.includes('writeValue')).length, bodyLen, hasTable, hasForm });
  page.removeAllListeners('console');
}

console.log('writeValue impact analysis:');
results.forEach(r => {
  const broken = r.bodyLen < 100;
  console.log(`${r.url}: writeValue errors=${r.errors} bodyLen=${r.bodyLen} hasTable=${r.hasTable} hasForm=${r.hasForm} → ${broken ? '❌ BROKEN' : '⚠️  cosmetic (page renders)'}`);
});
await b.close();
