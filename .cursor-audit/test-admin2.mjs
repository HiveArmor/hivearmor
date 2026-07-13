import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);

// Capture ALL responses including the 401
const allResponses = [];
page.on('response', resp => {
  allResponses.push(`${resp.status()} ${resp.request().method()} ${resp.url().replace('http://localhost:8880','')}`);
});

await page.goto('http://localhost:8880/management/users', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

console.log('All API calls on /management/users:');
allResponses.filter(r => r.includes('/api/') || r.includes('/management/')).forEach(r => console.log(' ', r));
