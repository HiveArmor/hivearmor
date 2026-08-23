/**
 * Staging UI validation: Search & Hunt shows real Windows event fields.
 * Usage:
 *   HA_ADMIN_PASS='...' HA_BASE_URL='https://72.44.52.187' \
 *     node deploy/staging/validate-hunt-ui.mjs
 * Never prints the password. Writes /tmp/hivearmor-hunt-ui-validation.json
 */
const { chromium } = require('/Users/encryptshell/GIT/HiveArmor-v1/frontend-v3/node_modules/playwright');
const fs = require('fs');

const BASE = process.env.HA_BASE_URL || 'https://72.44.52.187';
const USER = process.env.HA_ADMIN_USER || 'admin';
const PASS = process.env.HA_ADMIN_PASS || '';
const TOKEN_FILE = process.env.HA_TOKEN_FILE || '';
const OUT = process.env.HA_REPORT || '/tmp/hivearmor-hunt-ui-validation.json';

function fail(msg, extra = {}) {
  const report = { status: 'FAIL', error: msg, ...extra, at: new Date().toISOString() };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.error('FAIL:', msg);
  process.exit(1);
}

(async () => {
  const tokenFromFile = TOKEN_FILE && fs.existsSync(TOKEN_FILE)
    ? fs.readFileSync(TOKEN_FILE, 'utf8').trim()
    : '';
  if (!PASS && !tokenFromFile) fail('HA_ADMIN_PASS or HA_TOKEN_FILE required');

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH
      || '/Users/encryptshell/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const checks = {};

  try {
    if (tokenFromFile) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate((token) => {
        localStorage.setItem('hivearmor_auth_token', token);
      }, tokenFromFile);
      checks.login = 'PASS_TOKEN_INJECT';
    } else {
      // Login
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('input[type="password"], input[name="password"], input[name="username"]', { timeout: 30000 });
      const userInput = page.locator('input[name="username"], input[type="text"], input[autocomplete="username"]').first();
      const passInput = page.locator('input[name="password"], input[type="password"]').first();
      await userInput.fill(USER);
      await passInput.fill(PASS);
      await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }).catch(() => {});
      const onLogin = page.url().includes('/login');
      checks.login = onLogin ? 'FAIL' : 'PASS';
      if (onLogin) {
        const err = await page.locator('[role="alert"], .error, .login-error').first().textContent().catch(() => '');
        fail('login did not leave /login', { checks, loginError: (err || '').slice(0, 200) });
      }
    }

    // Search & Hunt
    await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    checks.searchRoute = page.url().includes('/search') ? 'PASS' : 'FAIL';

    // Query editor — Monaco or textarea
    const query = 'dataSource: EC2AMAZ*';
    const monaco = page.locator('.monaco-editor textarea, .monaco-editor .inputarea').first();
    const plain = page.locator('textarea, input[aria-label*="query" i], [contenteditable="true"]').first();
    if (await monaco.count()) {
      await monaco.click({ force: true });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.type(query, { delay: 5 });
    } else if (await plain.count()) {
      await plain.fill(query);
    } else {
      checks.queryEditor = 'FAIL';
      fail('no query editor found', { checks });
    }
    checks.queryEditor = 'PASS';

    // Run search
    const runBtn = page.getByRole('button', { name: /run search|run|search/i }).first();
    await runBtn.click();
    await page.waitForTimeout(4000);

    // Status / count
    const bodyText = await page.locator('body').innerText();
    const countMatch = bodyText.match(/([\d,]+)\s+events?/i);
    checks.resultCountText = countMatch ? countMatch[0] : null;
    checks.hasEventsBanner = /query complete|events/i.test(bodyText) ? 'PASS' : 'FAIL';

    // Grid rows — AG Grid cells
    const grid = page.locator('.ag-center-cols-container .ag-row, [role="row"].ag-row, .hunt-results-grid .ag-row').first();
    await grid.waitFor({ timeout: 30000 });
    checks.gridRows = 'PASS';

    const rowTexts = await page.locator('.ag-center-cols-container .ag-row').allTextContents();
    const joined = rowTexts.slice(0, 12).join(' | ');
    checks.sampleRows = rowTexts.slice(0, 5).map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 160));
    const hasHost = /EC2AMAZ/i.test(joined);
    const hasActionish = /(log on|logon|connect|close|failed|privileges|winevent|event \d+)/i.test(joined);
    const blankActionHostUser = rowTexts.slice(0, 8).every((t) => {
      // crude: only timestamp+severity+source with no action/host words
      return /Info/i.test(t) && /EC2AMAZ/i.test(t) && !/(log on|connect|close|privileges|SYSTEM|ADMIN)/i.test(t);
    });
    checks.hostVisibleInGrid = hasHost ? 'PASS' : 'FAIL';
    checks.actionOrMessageVisibleInGrid = hasActionish ? 'PASS' : 'FAIL';
    checks.notBlankColumnsRegression = blankActionHostUser ? 'FAIL' : 'PASS';

    // Click first data row
    await page.locator('.ag-center-cols-container .ag-row').first().click();
    await page.waitForTimeout(2500);

    // Detail / raw
    const rawTab = page.getByRole('button', { name: /raw json|raw/i }).first();
    if (await rawTab.count()) {
      await rawTab.click();
      await page.waitForTimeout(1500);
      checks.rawTab = 'PASS';
    } else {
      checks.rawTab = 'MISSING';
    }

    const detailText = await page.locator('[class*="flyout"], [class*="drawer"], [class*="detail"], aside, [role="dialog"]').last().innerText().catch(async () => page.locator('body').innerText());
    const rawLooksSparse = /"@timestamp"\s*:/.test(detailText) && /"dataSource"\s*:/.test(detailText)
      && !/"log"\s*:/.test(detailText) && !/"dataType"\s*:/.test(detailText) && !/"raw"\s*:/.test(detailText);
    const rawHasLog = /"log"\s*:|"dataType"\s*:|"eventCode"|eventName/i.test(detailText);
    checks.rawJsonNotSparse = rawLooksSparse ? 'FAIL' : (rawHasLog ? 'PASS' : 'PARTIAL');
    checks.detailSnippet = detailText.replace(/\s+/g, ' ').trim().slice(0, 400);

    // Network: hunt search response shape
    const huntResp = await page.evaluate(async () => {
      const token = localStorage.getItem('hivearmor_auth_token');
      const res = await fetch('/api/ha-hunts/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Tenant-ID': '1',
        },
        body: JSON.stringify({
          query: 'dataSource: EC2AMAZ*',
          language: 'kql',
          timeRange: { from: '2026-08-21T00:00:00.000Z', to: '2026-08-22T00:00:00.000Z' },
          tenantScope: 'authorized',
          fields: [],
          cursor: null,
          limit: 5,
          sort: [{ field: '@timestamp', direction: 'desc' }],
          includeHistogram: false,
        }),
      });
      const json = await res.json();
      const item = (json.items || [])[0] || {};
      return {
        status: res.status,
        total: json.totalApproximate,
        searchId: json.searchId,
        first: {
          action: item.action,
          host: item.host,
          user: item.user,
          message: item.message,
          category: item.category,
          normalizedKeys: Object.keys(item.normalized || {}),
        },
      };
    });
    checks.browserFetchHunt = huntResp;
    checks.browserFetchHasHost = huntResp.first.host ? 'PASS' : 'FAIL';
    checks.browserFetchHasActionOrMessage = (huntResp.first.action || huntResp.first.message) ? 'PASS' : 'FAIL';

    // Optional: detail raw via API from browser context
    if (huntResp.searchId && huntResp.first) {
      const detail = await page.evaluate(async ({ searchId, eventId }) => {
        const token = localStorage.getItem('hivearmor_auth_token');
        // need event id from last search — re-fetch one item id
        const search = await fetch('/api/ha-hunts/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': '1',
          },
          body: JSON.stringify({
            query: 'dataSource: EC2AMAZ*',
            language: 'kql',
            timeRange: { from: '2026-08-21T00:00:00.000Z', to: '2026-08-22T00:00:00.000Z' },
            tenantScope: 'authorized',
            fields: [],
            cursor: null,
            limit: 1,
            sort: [{ field: '@timestamp', direction: 'desc' }],
            includeHistogram: false,
          }),
        }).then((r) => r.json());
        const id = (search.items || [])[0]?.id;
        const sid = search.searchId;
        const res = await fetch(`/api/ha-hunts/events/${id}?searchId=${encodeURIComponent(sid)}&views=normalized,raw`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': '1' },
        });
        const json = await res.json();
        const raw = json.rawRecord || {};
        return {
          status: res.status,
          action: json.action,
          host: json.host,
          rawKeyCount: Object.keys(raw).length,
          hasLog: Object.prototype.hasOwnProperty.call(raw, 'log'),
          hasDataType: Object.prototype.hasOwnProperty.call(raw, 'dataType'),
        };
      }, { searchId: huntResp.searchId, eventId: null });
      checks.browserFetchDetail = detail;
      checks.detailRawFull = (detail.hasLog || detail.rawKeyCount > 5) ? 'PASS' : 'FAIL';
    }

    const hardFails = Object.entries(checks)
      .filter(([, v]) => v === 'FAIL')
      .map(([k]) => k);
    const status = hardFails.length ? 'FAIL' : 'PASS';
    const report = {
      status,
      baseUrl: BASE,
      hardFails,
      checks,
      label: 'STAGING CANDIDATE — UI validation',
      at: new Date().toISOString(),
    };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ status, hardFails, out: OUT, hostVisibleInGrid: checks.hostVisibleInGrid, actionOrMessageVisibleInGrid: checks.actionOrMessageVisibleInGrid, notBlankColumnsRegression: checks.notBlankColumnsRegression, rawJsonNotSparse: checks.rawJsonNotSparse, browserFetchHasHost: checks.browserFetchHasHost, detailRawFull: checks.detailRawFull }, null, 2));
    await browser.close();
    process.exit(hardFails.length ? 1 : 0);
  } catch (err) {
    await browser.close().catch(() => {});
    fail(String(err && err.message ? err.message : err), { checks });
  }
})();
