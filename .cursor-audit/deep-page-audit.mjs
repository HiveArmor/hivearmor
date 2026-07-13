/**
 * Deep single-page audit — waits for real content to render,
 * then captures full DOM state, console errors, network calls.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = 'http://localhost:8880';
const SCREENSHOT_DIR = '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// ── LOGIN ─────────────────────────────────────────────────────────────────────
const apiCalls = [];
const allErrors = [];
page.on('pageerror', e => allErrors.push('PAGEERROR: ' + e.message.slice(0, 200)));
page.on('request', r => { if (r.url().includes('/api/')) apiCalls.push(r.method() + ' ' + r.url().split('?')[0]); });

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(1500);

// Fill login form
const pwdInput = await page.$('input[type="password"]');
if (pwdInput) {
  const allInputs = await page.$$('input[type="text"], input:not([type="password"]):not([type="hidden"])');
  if (allInputs.length > 0) await allInputs[0].fill('admin');
  await pwdInput.fill('admin');
  await page.click('button[type="submit"], button');
  await page.waitForTimeout(4000);
}
console.log('After login URL:', page.url());

// ── DEEP AUDIT EACH PAGE ──────────────────────────────────────────────────────
const ROUTES = [
  { path: '/dashboard', label: 'Dashboard', wait: 5000 },
  { path: '/data/alerts', label: 'Alerts', wait: 5000 },
  { path: '/discover', label: 'Log Analyzer', wait: 5000 },
  { path: '/incident', label: 'Incidents', wait: 4000 },
  { path: '/soar', label: 'SOAR', wait: 4000 },
  { path: '/compliance', label: 'Compliance', wait: 4000 },
  { path: '/alerting-rules', label: 'Alerting Rules', wait: 4000 },
  { path: '/data-sources', label: 'Data Sources', wait: 4000 },
  { path: '/integrations', label: 'Integrations', wait: 4000 },
  { path: '/app-management', label: 'App Management', wait: 4000 },
  { path: '/data-parsing', label: 'Data Parsing', wait: 4000 },
  { path: '/management', label: 'Admin', wait: 4000 },
  { path: '/management/users', label: 'Admin - Users', wait: 4000 },
  { path: '/profile', label: 'Profile', wait: 3000 },
];

const results = [];

for (const route of ROUTES) {
  const pageErrors = [];
  const pageConsoleErrors = [];
  const pageNetworkErrors = [];

  const consoleHandler = msg => {
    if (msg.type() === 'error') pageConsoleErrors.push(msg.text().slice(0, 300));
  };
  const responseHandler = resp => {
    if (resp.status() >= 400 && resp.url().includes('/api/')) {
      pageNetworkErrors.push(`${resp.status()} ${resp.url().split('?')[0]}`);
    }
  };
  const errorHandler = err => pageErrors.push(err.message.slice(0, 200));

  page.on('console', consoleHandler);
  page.on('response', responseHandler);
  page.on('pageerror', errorHandler);

  console.log(`\n=== ${route.label} (${route.path}) ===`);

  try {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(route.wait);

    // Wait for spinner to disappear
    await page.waitForFunction(() => {
      const s = document.querySelector('ngx-spinner .overlay, .ngx-overlay.loading-foreground');
      return !s || s.offsetParent === null;
    }, { timeout: 8000 }).catch(() => {});

    const state = await page.evaluate(() => {
      const q = sel => !!document.querySelector(sel);
      const qAll = sel => [...document.querySelectorAll(sel)];
      const qCount = sel => document.querySelectorAll(sel).length;

      // Get all visible text in main content
      const mainEl = document.querySelector('main, .app-main, router-outlet + *, .content, .page-content');
      const mainText = mainEl ? mainEl.innerText?.slice(0, 800).replace(/\n{3,}/g, '\n\n') : document.body?.innerText?.slice(0, 800);

      // Tables
      const tables = qAll('table');
      const tableInfo = tables.map(t => ({
        rows: t.querySelectorAll('tbody tr').length,
        cols: t.querySelectorAll('thead th').length,
        headers: [...t.querySelectorAll('thead th')].map(th => th.innerText.trim()).join(' | ')
      }));

      // Buttons
      const btns = qAll('button:not([disabled])').filter(b => b.offsetParent !== null);
      const btnTexts = btns.map(b => b.innerText.trim().slice(0, 30)).filter(Boolean);

      // Charts
      const charts = qCount('canvas') + qCount('[_echarts_instance_]') + qCount('.echarts');

      // Form elements
      const inputs = qAll('input:not([type=hidden])').filter(i => i.offsetParent !== null);
      const selects = qAll('select, ng-select').filter(i => i.offsetParent !== null);

      // Cards / KPIs
      const cards = qCount('.card, .kpi-card, .utm-card, [class*="card"]');

      // Errors
      const errorEls = qAll('.alert-danger, .text-danger, [class*="error"]').filter(e => e.offsetParent !== null);
      const errorTexts = errorEls.map(e => e.innerText.trim().slice(0, 100)).filter(Boolean);

      // Overflow
      const overflows = qAll('*').filter(el => el.scrollWidth > el.clientWidth + 5 && el.offsetWidth > 50).map(el => el.tagName + '.' + el.className.slice(0,40)).slice(0, 5);

      return {
        url: window.location.href,
        title: document.title,
        mainText: mainText?.slice(0, 600),
        tables: tableInfo,
        tableCount: tableInfo.length,
        visibleButtons: btnTexts,
        chartCount: charts,
        inputCount: inputs.length,
        selectCount: selects.length,
        cardCount: cards,
        errorTexts,
        hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
        overflowElements: overflows,
        hasEmptyState: q('[class*="no-data"], [class*="no-result"], app-no-data-found, .empty-state'),
        hasLoadingSpinner: q('.ngx-overlay, ngx-spinner .overlay, [class*="spinner"]:not([class*="disabled"])'),
        isLoginPage: window.location.href.includes('/login'),
        appRootLen: document.querySelector('app-root')?.innerHTML?.length ?? 0,
      };
    });

    // Print summary
    console.log(`  URL: ${state.url}`);
    console.log(`  appRoot: ${state.appRootLen} chars, tables: ${state.tableCount}, charts: ${state.chartCount}, buttons: ${state.visibleButtons.length}, cards: ${state.cardCount}`);
    if (state.visibleButtons.length) console.log(`  Buttons: [${state.visibleButtons.slice(0,8).join('] [')}]`);
    if (state.tables.length) state.tables.forEach((t,i) => console.log(`  Table${i}: ${t.rows} rows, ${t.cols} cols — ${t.headers}`));
    if (state.errorTexts.length) console.log(`  ⚠️  Errors on page: ${state.errorTexts.join(' | ')}`);
    if (state.overflowElements.length) console.log(`  📐 Overflow: ${state.overflowElements.join(', ')}`);
    if (pageConsoleErrors.length) pageConsoleErrors.forEach(e => console.log(`  🔴 Console: ${e.slice(0,150)}`));
    if (pageNetworkErrors.length) pageNetworkErrors.forEach(e => console.log(`  🌐 Net err: ${e}`));
    if (state.isLoginPage) console.log(`  ❌ REDIRECTED TO LOGIN — auth broken for this route`);
    if (state.mainText) console.log(`  📝 Content preview: "${state.mainText.slice(0,200).replace(/\n/g,' ')}"`);

    // Screenshot
    const fname = `${SCREENSHOT_DIR}/${route.label.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.png`;
    await page.screenshot({ path: fname, fullPage: false });

    results.push({
      label: route.label,
      path: route.path,
      ...state,
      consoleErrors: pageConsoleErrors,
      networkErrors: pageNetworkErrors,
      jsErrors: pageErrors,
      screenshotFile: fname,
    });

  } catch (e) {
    console.log(`  ❌ Exception: ${e.message.slice(0,120)}`);
    results.push({ label: route.label, path: route.path, exception: e.message.slice(0,200) });
  }

  page.removeAllListeners('console');
  page.removeAllListeners('response');
  page.removeAllListeners('pageerror');
}

fs.writeFileSync('/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/deep-audit-raw.json', JSON.stringify(results, null, 2));
console.log('\n✅ Deep audit saved to deep-audit-raw.json');

await browser.close();
