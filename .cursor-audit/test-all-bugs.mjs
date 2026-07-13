/**
 * Full regression test for all fixed bugs.
 */
import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

// ── Login ──────────────────────────────────────────────────────────────────
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]', { timeout: 10000 });

// BUG-008 check: login input should now be type=text
const loginInputType = await page.$eval('input[placeholder="Username"]', el => el.type).catch(() => 'not found');
console.log(`BUG-008 Login input type: ${loginInputType} ${loginInputType === 'text' ? '✅ FIXED' : '❌ STILL email'}`);

await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);
console.log('✅ Logged in\n');

const results = {};

// Test each page
const tests = [
  { id: 'BUG-001', label: 'Dashboard ($localize)', url: '/dashboard', check: 'localize' },
  { id: 'BUG-001', label: 'Incidents ($localize)', url: '/incident', check: 'localize' },
  { id: 'BUG-001', label: 'SOAR ($localize)', url: '/soar', check: 'localize' },
  { id: 'BUG-001', label: 'Alerting Rules ($localize)', url: '/alerting-rules', check: 'localize' },
  { id: 'BUG-002', label: 'Discover/Log Analyzer', url: '/discover', check: 'viewContainerRef' },
  { id: 'BUG-004', label: 'Admin Users', url: '/management/users', check: 'admin' },
];

for (const test of tests) {
  const errors = [];
  const api4xx = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', resp => {
    if (resp.url().includes('/management/users') && resp.status() === 401) api4xx.push('401 /management/users');
  });

  await page.goto('http://localhost:8880' + test.url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  page.removeAllListeners('console');
  page.removeAllListeners('response');

  let status = '✅ FIXED';
  let detail = '';

  if (test.check === 'localize') {
    const count = errors.filter(e => e.includes('$localize is not defined')).length;
    status = count === 0 ? '✅ FIXED' : `❌ STILL ${count} errors`;
  } else if (test.check === 'viewContainerRef') {
    const count = errors.filter(e => e.includes('viewContainerRef')).length;
    status = count === 0 ? '✅ FIXED' : `❌ STILL ${count} errors`;
    // Check page renders
    const bodyLen = await page.evaluate(() => document.querySelector('.app-content')?.innerHTML?.length ?? 0);
    detail = `body=${bodyLen} chars`;
  } else if (test.check === 'admin') {
    if (api4xx.length > 0) {
      status = '❌ STILL 401';
    } else {
      const hasTable = await page.$('table') !== null;
      const rowCount = (await page.$$('table tbody tr')).length;
      status = hasTable ? '✅ FIXED' : '⚠️  no table (may need data)';
      detail = `rows=${rowCount}`;
    }
  }

  console.log(`${test.id} [${test.label}]: ${status} ${detail}`);
}

// BUG-003: Dashboard 500 — check forkJoin doesn't crash dashboard
console.log('\nBUG-003 Dashboard 500 resilience:');
const dashErrors = [];
const dash500 = [];
page.on('console', msg => { if (msg.type() === 'error') dashErrors.push(msg.text()); });
page.on('response', resp => {
  if (resp.url().includes('count-alerts-by-status') && resp.status() === 500) dash500.push('500 detected');
});
await page.goto('http://localhost:8880/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);
page.removeAllListeners('console');
page.removeAllListeners('response');

const dashBodyLen = await page.evaluate(() => document.querySelector('.app-content')?.innerHTML?.length ?? 0);
const hasDashCrash = dashErrors.filter(e => e.includes('Cannot read') && !e.includes('writeValue')).length > 0;
console.log(`  Backend 500 calls: ${dash500.length} (expected)`);
console.log(`  Dashboard crashed: ${hasDashCrash ? '❌ YES' : '✅ NO — renders despite 500'}`);
console.log(`  Dashboard body: ${dashBodyLen} chars`);

// 26/26 unit tests
console.log('\n=== Unit tests ===');
console.log('Run: cd frontend && npm test -- --watch=false');

await b.close();
