/**
 * Theme fix verification — checks for white/light backgrounds after CSS fix
 */
import { chromium } from 'playwright';
import fs from 'fs';

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

// Login
await page.goto('http://localhost:8880', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[placeholder="Username"]', 'admin');
await page.fill('input[type="password"]', 'localdev123!');
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.toString().includes('login'), { timeout: 15000 });
await page.waitForTimeout(3000);
console.log('✅ Logged in\n');

const routes = [
  { label: 'dashboard-overview',   url: '/dashboard' },
  { label: 'custom-dashboards',    url: '/dashboard' },
  { label: 'alerts-list',          url: '/data/alerts' },
  { label: 'alerting-rules',       url: '/alerting-rules' },
  { label: 'integrations',         url: '/integrations' },
  { label: 'data-sources',         url: '/data-sources' },
  { label: 'admin-users',          url: '/management/users' },
  { label: 'chart-creator',        url: '/creator' },
  { label: 'compliance',           url: '/compliance' },
  { label: 'soar',                 url: '/soar' },
];

const SCREENSHOT_DIR = '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/screenshots/theme-fix';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];

for (const route of routes) {
  await page.goto('http://localhost:8880' + route.url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2500);

  // Sample pixel colors at table body areas to check for white backgrounds
  const colorCheck = await page.evaluate(() => {
    const issues = [];

    // Find all table rows and check their background
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    if (rows.length > 0) {
      const style = window.getComputedStyle(rows[0]);
      const bg = style.backgroundColor;
      // Parse RGB
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        // White or near-white = all channels > 200
        if (r > 200 && g > 200 && b > 200) {
          issues.push(`TABLE ROW BACKGROUND IS LIGHT: ${bg} (r=${r},g=${g},b=${b})`);
        }
      }
    }

    // Check card bodies
    const cards = Array.from(document.querySelectorAll('.card-body'));
    cards.slice(0, 3).forEach(card => {
      const bg = window.getComputedStyle(card).backgroundColor;
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        if (r > 200 && g > 200 && b > 200) {
          issues.push(`CARD-BODY BACKGROUND IS LIGHT: ${bg}`);
        }
      }
    });

    // Check .app-content direct background
    const appContent = document.querySelector('.app-content');
    if (appContent) {
      const bg = window.getComputedStyle(appContent).backgroundColor;
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        if (r > 200 && g > 200 && b > 200) {
          issues.push(`APP-CONTENT BACKGROUND IS LIGHT: ${bg}`);
        }
      }
    }

    return {
      tableRowCount: rows.length,
      firstRowBg: rows.length > 0 ? window.getComputedStyle(rows[0]).backgroundColor : 'N/A',
      issues
    };
  });

  const screenshot = `${SCREENSHOT_DIR}/${route.label}.png`;
  await page.screenshot({ path: screenshot, fullPage: false }); // viewport only for speed

  const status = colorCheck.issues.length === 0 ? '✅ DARK' : '❌ LIGHT BACKGROUND';
  console.log(`[${route.label}] ${status}`);
  if (colorCheck.tableRowCount > 0) {
    console.log(`  Table rows: ${colorCheck.tableRowCount}, first row bg: ${colorCheck.firstRowBg}`);
  }
  if (colorCheck.issues.length > 0) {
    colorCheck.issues.forEach(i => console.log(`  ⚠️  ${i}`));
  }

  results.push({ ...route, ...colorCheck });
}

const allDark = results.every(r => r.issues.length === 0);
console.log(`\n${ allDark ? '✅ ALL PAGES DARK — white section bug FIXED' : '❌ Some pages still have light backgrounds'}`);
console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);

await b.close();
