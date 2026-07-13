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

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:8880/soar', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

const wv = errors.filter(e => e.includes('writeValue'));
console.log('writeValue errors:', wv.length);
if (wv.length > 0) {
  console.log('\nFull stack:\n', wv[0]);
}

await b.close();
