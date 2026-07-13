import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]', { timeout: 15000 });

// dump all inputs
const inputs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('input')).map(i => ({
    type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, className: i.className
  }))
);
console.log('All inputs:', JSON.stringify(inputs, null, 2));

// dump all buttons
const btns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map(b => ({
    type: b.type, text: b.textContent.trim().slice(0,40), className: b.className.slice(0,60)
  }))
);
console.log('All buttons:', JSON.stringify(btns, null, 2));

await page.screenshot({ path: '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/login-probe.png', fullPage: true });
await browser.close();
