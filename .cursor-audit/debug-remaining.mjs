import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);

// BUG-003: What exact error crashes the dashboard?
console.log('=== BUG-003: Dashboard crash errors ===');
const errors003 = [];
page.on('console', msg => { if (msg.type() === 'error') errors003.push(msg.text()); });
await page.goto('http://localhost:8880/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);
page.removeAllListeners('console');
errors003.filter(e => !e.includes('writeValue') && !e.includes('500')).forEach(e => console.log(e.slice(0, 300)));

// BUG-004: What API call gets 401?
console.log('\n=== BUG-004: Admin 401 details ===');
const errors004 = [];
const responses004 = [];
page.on('console', msg => { if (msg.type() === 'error') errors004.push(msg.text()); });
page.on('response', resp => {
  if (resp.status() >= 400) responses004.push(`${resp.status()} ${resp.request().method()} ${resp.url().replace('http://localhost:8880','')}`);
});
await page.goto('http://localhost:8880/management/users', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(4000);
page.removeAllListeners('console');
page.removeAllListeners('response');
console.log('4xx responses:', responses004);
console.log('Errors:', errors004.slice(0, 3).map(e => e.slice(0, 200)));

await b.close();
