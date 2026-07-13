/**
 * NilaChakra rebranding verification test
 * Checks all brand touchpoints after the rebranding implementation.
 */
import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

console.log('=== NilaChakra Rebranding Verification ===\n');

// ── 1. Login page ──────────────────────────────────────────────────────
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]', { timeout: 10000 });

const loginChecks = await page.evaluate(() => {
  const title = document.title;
  const h1 = document.querySelector('h1.login-title')?.textContent?.trim();
  const subtitle = document.querySelector('p.login-subtitle')?.textContent?.trim();
  const logoImg = document.querySelector('.login-logo img');
  const logoSrc = logoImg?.getAttribute('src') || '';
  const logoAlt = logoImg?.getAttribute('alt') || '';
  const loadingText = document.querySelector('#app-loading .loading-text')?.textContent?.trim();
  // Check for old UTMStack references
  const bodyText = document.body.innerHTML;
  const hasOldBrand = bodyText.includes('"UTMStack"') || bodyText.includes('>UTMSTACK<');
  return { title, h1, subtitle, logoSrc, logoAlt, loadingText, hasOldBrand };
});

console.log('LOGIN PAGE:');
console.log(`  Browser title:  "${loginChecks.title}" ${loginChecks.title === 'NilaChakra' ? '✅' : '❌ expected NilaChakra'}`);
console.log(`  H1 heading:     "${loginChecks.h1}" ${loginChecks.h1 === 'NilaChakra' ? '✅' : '❌ expected NilaChakra'}`);
console.log(`  Tagline:        "${loginChecks.subtitle}" ${loginChecks.subtitle?.includes('SIEM') ? '✅' : '⚠️'}`);
console.log(`  Logo src:       "${loginChecks.logoSrc}" ${loginChecks.logoSrc.includes('logo-full') ? '✅' : '❌ expected logo-full.svg'}`);
console.log(`  Logo alt:       "${loginChecks.logoAlt}" ${loginChecks.logoAlt === 'NilaChakra' ? '✅' : '❌ expected NilaChakra'}`);
console.log(`  Loading text:   "${loginChecks.loadingText}" ${loginChecks.loadingText?.includes('NilaChakra') ? '✅' : '❌'}`);
console.log(`  No old "UTMSTACK" visible: ${!loginChecks.hasOldBrand ? '✅' : '❌ old brand still found'}`);

// ── 2. Log in and check header ────────────────────────────────────────
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);

const headerChecks = await page.evaluate(() => {
  const brandText = document.querySelector('.header-brand-text')?.textContent?.trim();
  const ariaLabel = document.querySelector('.header-brand-link')?.getAttribute('aria-label');
  const logoImg = document.querySelector('.header-brand-logo');
  return { brandText, ariaLabel, hasLogo: !!logoImg };
});

console.log('\nHEADER:');
console.log(`  Aria label:     "${headerChecks.ariaLabel}" ${headerChecks.ariaLabel === 'NilaChakra home' ? '✅' : '❌'}`);
if (!headerChecks.hasLogo) {
  console.log(`  Fallback text:  "${headerChecks.brandText}" ${headerChecks.brandText === 'NilaChakra' ? '✅' : '❌'}`);
} else {
  console.log(`  Logo displayed: ✅`);
}

// ── 3. Check placeholder SVG logos exist ─────────────────────────────
const logoChecks = await Promise.all([
  page.request.get('http://localhost:8880/assets/img/logo-full.svg'),
  page.request.get('http://localhost:8880/assets/img/logo-icon.svg'),
  page.request.get('http://localhost:8880/assets/img/logo-white-full.svg'),
  page.request.get('http://localhost:8880/assets/img/logo-white-icon.svg'),
]);

console.log('\nPLACEHOLDER LOGOS:');
const logoNames = ['logo-full.svg', 'logo-icon.svg', 'logo-white-full.svg', 'logo-white-icon.svg'];
logoChecks.forEach((r, i) => {
  console.log(`  ${logoNames[i]}: HTTP ${r.status()} ${r.status() === 200 ? '✅' : '❌'}`);
});

// ── 4. Check no UTMStack in page HTML (key pages) ─────────────────────
const pagesToCheck = [
  { label: 'Dashboard', url: '/dashboard' },
  { label: 'Alerts', url: '/data/alerts' },
  { label: 'SOAR', url: '/soar' },
];

console.log('\nNO "UTMSTACK" IN UI TEXT:');
for (const p of pagesToCheck) {
  await page.goto('http://localhost:8880' + p.url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  const hasOld = await page.evaluate(() => {
    // Check visible text only (not comments or data attributes)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('UTMSTACK') || node.textContent.includes('UTMStack')) {
        return node.textContent.trim();
      }
    }
    return null;
  });
  console.log(`  ${p.label}: ${hasOld ? `❌ Found: "${hasOld.slice(0,50)}"` : '✅ No UTMStack'}`);
}

// ── 5. Console errors ─────────────────────────────────────────────────
console.log('\nCONSOLE ERRORS:');
const brandErrors = errors.filter(e => !e.includes('500') && !e.includes('writeValue'));
if (brandErrors.length === 0) {
  console.log('  NONE ✅');
} else {
  brandErrors.slice(0, 3).forEach(e => console.log(`  ❌ ${e.slice(0, 120)}`));
}

// ── 6. Screenshot ─────────────────────────────────────────────────────
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForSelector('input[type="password"]');
await page.screenshot({ path: '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/screenshots/nilachakra-login.png' });
console.log('\nScreenshot saved: .cursor-audit/screenshots/nilachakra-login.png');

await b.close();
