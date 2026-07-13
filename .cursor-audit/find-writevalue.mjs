import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(2000);

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto('http://localhost:8880/soar', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

console.log('All errors on /soar:');
errors.forEach((e, i) => console.log(`\n[${i+1}]\n`, e.slice(0, 800)));
await browser.close();
