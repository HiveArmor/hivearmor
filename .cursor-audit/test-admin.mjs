import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000); // wait for auth state to settle

const errors = [], api200 = [], api4xx = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', resp => {
  if (resp.url().includes('/api/')) {
    if (resp.status() >= 400) api4xx.push(`${resp.status()} ${resp.url().replace('http://localhost:8880','')}`);
    else if (resp.status() === 200) api200.push(resp.url().replace('http://localhost:8880',''));
  }
});

await page.goto('http://localhost:8880/management/users', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

const hasTable = await page.$('table') !== null;
const hasUsers = await page.$$('table tbody tr');

console.log('Admin /management/users:');
console.log('  Has table:', hasTable);
console.log('  User rows:', hasUsers.length);
console.log('  200 API calls:', api200.filter(u => u.includes('/api/user')).join(', ') || 'none');
console.log('  4xx errors:', api4xx.join(', ') || 'NONE ✅');
console.log('  Console errors:', errors.length === 0 ? 'NONE ✅' : errors.slice(0,3).join(' | '));

await b.close();
