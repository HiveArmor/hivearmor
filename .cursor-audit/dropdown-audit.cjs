const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4200';

const ROUTES = [
  '/dashboard/overview',
  '/dashboard/log-sources',
  '/discover/log-analyzer',
  '/data/alert/view',
  '/data/file/view',
  '/data-sources/sources',
  '/data-sources/collectors',
  '/management/user',
  '/app-management/settings/connection-key',
  '/app-management/settings/application-config',
  '/app-management/settings/providers',
  '/app-management/settings/index-pattern',
  '/app-management/settings/notifications',
  '/app-management/settings/menu-management',
  '/integrations/explore',
  '/compliance/templates',
  '/compliance/management',
  '/compliance/schedule',
  '/data-parsing/pipelines',
  '/soar/flows',
  '/soar/create-flow',
  '/incident/view',
  '/alerting-rules/rules',
  '/variables/list',
  '/threat-intelligence',
  '/creator/visualization/list',
  '/creator/builder/dashboard/list',
];

const AUDIT_SCRIPT = `(function auditPageDropdowns() {
  function parseRgb(str) {
    if (!str) return null;
    const el = document.createElement('span');
    el.style.color = str;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
  }
  function lum(c) {
    const a = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(fg, bg) {
    if (!fg || !bg) return 99;
    const l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function getSolidBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg && bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (m && (!m[4] || parseFloat(m[4]) > 0.1)) return { r: +m[1], g: +m[2], b: +m[3] };
      node = node.parentElement;
    }
    return { r: 11, g: 13, b: 20 };
  }
  const issues = [];
  document.querySelectorAll('ng-select').forEach((sel, idx) => {
    const label = sel.querySelector('.ng-value-label, .ng-placeholder');
    const container = sel.querySelector('.ng-select-container');
    if (!label || !container) return;
    const fg = parseRgb(getComputedStyle(label).color);
    const bg = getSolidBg(container);
    const cr = contrast(fg, bg);
    if (cr < 4.5) issues.push({ kind: 'ng-select-closed', idx, text: (label.textContent||'').trim().slice(0,40), contrast: +cr.toFixed(2), color: getComputedStyle(label).color, bg: getComputedStyle(container).backgroundColor });
  });
  document.querySelectorAll('select, .form-select').forEach((sel, idx) => {
    const cs = getComputedStyle(sel);
    const fg = parseRgb(cs.color);
    const bg = parseRgb(cs.backgroundColor) || getSolidBg(sel);
    const cr = contrast(fg, bg);
    if (cr < 4.5) issues.push({ kind: 'native-select', idx, contrast: +cr.toFixed(2), color: cs.color, bg: cs.backgroundColor });
  });
  const result = { url: location.pathname, ngSelects: document.querySelectorAll('ng-select').length, selects: document.querySelectorAll('select, .form-select').length, issues };
  const audit = JSON.parse(sessionStorage.getItem('dropdownAudit') || '[]');
  audit.push(result);
  sessionStorage.setItem('dropdownAudit', JSON.stringify(audit));
  return result;
})()`;

const OPEN_OPTION_AUDIT = `(function auditOpenOption() {
  function parseRgb(str) {
    if (!str) return null;
    const el = document.createElement('span');
    el.style.color = str;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
  }
  function lum(c) {
    const a = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(fg, bg) {
    if (!fg || !bg) return 99;
    const l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function getSolidBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg && bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (m && (!m[4] || parseFloat(m[4]) > 0.1)) return { r: +m[1], g: +m[2], b: +m[3] };
      node = node.parentElement;
    }
    return { r: 11, g: 13, b: 20 };
  }
  const opt = document.querySelector('.ng-option-selected');
  if (!opt) return null;
  const fg = parseRgb(getComputedStyle(opt).color);
  const bg = getSolidBg(opt);
  const cr = contrast(fg, bg);
  const issue = { kind: 'ng-option-selected-open', idx: 0, text: (opt.textContent||'').trim().slice(0,40), contrast: +cr.toFixed(2), color: getComputedStyle(opt).color, bg: getComputedStyle(opt).backgroundColor };
  if (cr < 4.5) {
    const audit = JSON.parse(sessionStorage.getItem('dropdownAudit') || '[]');
    if (audit.length) audit[audit.length - 1].issues.push(issue);
    sessionStorage.setItem('dropdownAudit', JSON.stringify(audit));
  }
  return issue;
})()`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const onLogin = await page.evaluate(() => !!document.querySelector('input[formControlName="username"]'));
  if (!onLogin) return true;
  await page.type('input[formControlName="username"]', 'admin', { delay: 20 });
  await page.type('input[formControlName="password"]', 'admin', { delay: 20 });
  await page.click('button.utm-button-primary');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      hasLogin: !!document.querySelector('input[formControlName="username"]'),
      preparing: (document.body?.innerText || '').includes('Preparing your workspace'),
      loadingModules: (document.body?.innerText || '').includes('Loading modules'),
    }));
    if (!state.hasLogin && !state.preparing && !state.loadingModules) return true;
    await sleep(500);
  }
  return false;
}

async function waitForPageLoad(page) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    if (!text.includes('Preparing your workspace')) break;
    await sleep(400);
  }
  await sleep(800);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const loggedIn = await login(page);
  if (!loggedIn) {
    console.error('Login failed');
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(() => sessionStorage.setItem('dropdownAudit', '[]'));

  for (const route of ROUTES) {
    process.stderr.write(`Auditing ${route}...\n`);
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForPageLoad(page);

      const notFound = await page.evaluate(() =>
        document.body.innerText.includes('Page Not Found') ||
        (document.body.innerText.includes('404') && document.title.includes('404'))
      );
      if (notFound) {
        process.stderr.write(`  -> page-not-found\n`);
        continue;
      }

      const result = await page.evaluate(AUDIT_SCRIPT);
      process.stderr.write(`  -> ng-selects: ${result.ngSelects}, selects: ${result.selects}, issues: ${result.issues.length}\n`);

      if (result.ngSelects > 0) {
        const container = await page.$('ng-select .ng-select-container');
        if (container) {
          try {
            await container.click();
            await sleep(500);
            await page.evaluate(OPEN_OPTION_AUDIT);
            await page.keyboard.press('Escape');
            await sleep(200);
          } catch (e) {
            process.stderr.write(`  -> open audit error: ${e.message}\n`);
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  -> error: ${e.message}\n`);
    }
  }

  const fullAudit = await page.evaluate(() => sessionStorage.getItem('dropdownAudit'));
  await browser.close();
  console.log(fullAudit);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
