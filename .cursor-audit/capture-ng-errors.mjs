import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const consoleLogs = [];

page.on('console', msg => {
  if (msg.type() === 'error') consoleLogs.push(`CONSOLE ERROR: ${msg.text()}`);
});
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

console.log('Loading app and waiting for login page...');
await page.goto('http://localhost:8880', { waitUntil: 'domcontentloaded', timeout: 20000 });

// Wait up to 15 seconds for the URL to change away from /
try {
  await page.waitForFunction(() => window.location.pathname !== '/' || document.querySelector('input[type="password"], input[name="password"], form.login, .login-form'), { timeout: 15000 });
} catch (e) {
  console.log('Still on loading page after 15s - checking state...');
}

const finalUrl = page.url();
const title = await page.title();

const state = await page.evaluate(() => {
  const pwd = document.querySelector('input[type="password"]');
  const username = document.querySelector('input[type="text"], input[name="username"]');
  const spinner = document.querySelector('[class*="spinner"], [class*="loading"]');
  return {
    url: window.location.href,
    hasPasswordInput: !!pwd,
    hasUsernameInput: !!username,
    hasSpinner: !!spinner,
    bodyText: document.body?.innerText?.slice(0, 400) || ''
  };
});

console.log('\n=== FINAL STATE ===');
console.log('URL:', finalUrl);
console.log('Title:', title);
console.log('Has login form:', state.hasPasswordInput && state.hasUsernameInput);
console.log('Has spinner:', state.hasSpinner);
console.log('Body text:', state.bodyText.replace(/\n+/g, ' ').slice(0, 200));

console.log('\n=== ERRORS ===');
if (errors.length + consoleLogs.length === 0) {
  console.log('NONE ✅');
} else {
  [...errors, ...consoleLogs].forEach(l => console.log(l));
}

await browser.close();
