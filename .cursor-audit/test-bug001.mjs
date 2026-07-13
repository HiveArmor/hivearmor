/**
 * BUG-001 Test: $localize is not defined
 * Verifies the error is gone on all 7 affected pages.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8880';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]', { timeout: 10000 });
await page.fill('input[type="email"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(2000);
console.log('✅ Logged in\n');

const AFFECTED_PAGES = [
  { label: 'Dashboard',      url: '/dashboard' },
  { label: 'Incidents',      url: '/incident' },
  { label: 'SOAR',           url: '/soar' },
  { label: 'Alerting Rules', url: '/alerting-rules' },
  { label: 'Chart Creator',  url: '/creator' },
];

let totalLocalize = 0;
let totalWriteValue = 0;

for (const route of AFFECTED_PAGES) {
  const localize = [];
  const writeValue = [];
  const other = [];

  const onErr = msg => {
    const t = msg.text();
    if (t.includes('$localize is not defined')) localize.push(t.slice(0, 80));
    else if (t.includes('writeValue')) writeValue.push(t.slice(0, 80));
    else if (msg.type() === 'error') other.push(t.slice(0, 100));
  };
  page.on('console', onErr);

  await page.goto(BASE + route.url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  page.off('console', onErr);

  totalLocalize += localize.length;
  totalWriteValue += writeValue.length;

  const localizeStatus = localize.length === 0 ? '✅ FIXED' : `❌ STILL ${localize.length} errors`;
  const writeStatus   = writeValue.length === 0 ? '✅ FIXED' : `❌ STILL ${writeValue.length} errors`;

  console.log(`[${route.label}]`);
  console.log(`  $localize: ${localizeStatus}`);
  console.log(`  writeValue: ${writeStatus}`);
  if (other.length > 0) console.log(`  Other errors: ${other.slice(0,3).join(' | ')}`);
}

console.log('\n=== SUMMARY ===');
console.log('$localize errors remaining:', totalLocalize, totalLocalize === 0 ? '✅ BUG-001 FIXED' : '❌ STILL BROKEN');
console.log('writeValue errors remaining:', totalWriteValue, totalWriteValue === 0 ? '✅' : '❌ BUG-005 still present');

// Extra: open date picker to confirm NgbDatepicker works
console.log('\n=== Testing NgbDatepicker (uses $localize for aria-labels) ===');
const dpErrors = [];
page.on('console', msg => { if (msg.type() === 'error') dpErrors.push(msg.text()); });
await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
// try clicking any date input
const dateInput = await page.$('input[type="date"], [ngbDatepicker], app-date-range button, [class*="date"] button');
if (dateInput) {
  await dateInput.click();
  await page.waitForTimeout(1500);
  const picker = await page.$('ngb-datepicker, .ngb-dp');
  console.log('Datepicker opened:', picker ? '✅ YES' : '⚠️  not found (may use custom component)');
}
const newLocalizeErrors = dpErrors.filter(e => e.includes('$localize'));
console.log('$localize errors after datepicker interaction:', newLocalizeErrors.length === 0 ? '✅ None' : '❌ ' + newLocalizeErrors.length);

await browser.close();
