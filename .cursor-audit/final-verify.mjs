import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://localhost:8880', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForSelector('input[type="password"]', { timeout: 15000 });

const url = page.url();
const title = await page.title();
const hasUsername = await page.$('input[type="text"], input[name="username"]') !== null;
const hasPassword = await page.$('input[type="password"]') !== null;
const hasLoginBtn = await page.$('button[type="submit"], .btn-login, button') !== null;

console.log('✅ Login page reached!');
console.log('URL:', url);
console.log('Title:', title);
console.log('Has username field:', hasUsername);
console.log('Has password field:', hasPassword);
console.log('Has button:', hasLoginBtn);
console.log('Console errors:', errors.length === 0 ? 'NONE ✅' : errors);

await page.screenshot({ path: '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/login-page.png', fullPage: true });
console.log('Screenshot saved: .cursor-audit/login-page.png');

await browser.close();
