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

// Build an unminified debug build to get real component name
// Instead use page.evaluate to extract which component is broken
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

for (const url of ['/soar', '/alerting-rules', '/creator', '/integrations']) {
  errors.length = 0;
  await page.goto('http://localhost:8880' + url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  const wv = errors.filter(e => e.includes('writeValue'));
  if (wv.length > 0) {
    console.log('\n=== ' + url + ' ===');
    // Extract the lazy chunk name from the stack trace
    const chunkMatch = wv[0].match(/localhost:8880\/(\d+[^.]*\.js)/g);
    console.log('Stack chunks:', chunkMatch?.join(', ') || 'main only');
    console.log('Stack (trimmed):', wv[0].slice(0, 600));
  }
}
await b.close();
