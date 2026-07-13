import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const apiCalls = [];

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warn') console.log('[WARN]', msg.text());
  if (msg.text().includes('APP_INITIALIZER') || msg.text().includes('ping') || msg.text().includes('resolve')) {
    console.log('[LOG]', msg.text());
  }
});
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
page.on('request', req => {
  if (req.url().includes('/api/')) apiCalls.push(req.method() + ' ' + req.url());
});

console.log('Loading http://localhost:8880 — waiting 40s for 30s safety timer...');
await page.goto('http://localhost:8880', { waitUntil: 'domcontentloaded', timeout: 15000 });

// Wait 40 seconds — the 30s safety timer should fire
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    appRootLen: document.querySelector('app-root')?.innerHTML?.length ?? 0,
    hasLogin: !!document.querySelector('input[type="password"]'),
    loadingVisible: !!document.getElementById('app-loading'),
  }));
  process.stdout.write(`[${(i+1)*2}s] appRoot=${state.appRootLen} login=${state.hasLogin} loading=${state.loadingVisible} apiCalls=${apiCalls.length}\r`);
  if (state.hasLogin || state.appRootLen > 200) {
    console.log('\n✅ Angular bootstrapped!');
    break;
  }
}

console.log('\n');
console.log('API calls made:', apiCalls);
console.log('Errors:', errors.length === 0 ? 'NONE' : errors);

await page.screenshot({ path: '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/app-state.png' });
await browser.close();
