import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.goto('http://localhost:8880/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

const bodyLen = await page.evaluate(() => document.querySelector('.app-content')?.innerHTML?.length ?? 0);
const crashErrors = errors.filter(e => !e.includes('writeValue') && !e.includes('500 (Internal') && e.includes('Cannot read'));
console.log('Body len:', bodyLen);
console.log('Crash errors:', crashErrors.length);
crashErrors.forEach(e => console.log(e.slice(0, 300)));
console.log('All errors (non-writeValue, non-500):', errors.filter(e => !e.includes('writeValue') && !e.includes('500 (Internal')).map(e => e.slice(0,150)));
await b.close();
