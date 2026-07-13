import { chromium } from 'playwright';

const BASE = 'http://localhost:4200';

async function waitApp(page) {
  await page.waitForLoadState('domcontentloaded');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const txt = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '');
    if (!txt.includes('Preparing your workspace')) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
}

function dumpSelect() {
  // Runs in the page: snapshot the first ng-select-single control state
  return `(function () {
    const sel = document.querySelector('ng-select');
    if (!sel) return { found: false };
    const container = sel.querySelector('.ng-select-container');
    const valueEl = sel.querySelector('.ng-value-label');
    const placeholderEl = sel.querySelector('.ng-placeholder');
    const inputEl = sel.querySelector('.ng-input input');
    const cs = valueEl ? getComputedStyle(valueEl) : null;
    let topmostTag = null, valueRect = null, coveredBy = null;
    if (valueEl) {
      const r = valueEl.getBoundingClientRect();
      valueRect = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      if (r.width > 0 && r.height > 0) {
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        topmostTag = el ? (el.tagName + '.' + (el.className || '')).slice(0, 60) : null;
        if (el && el !== valueEl && !valueEl.contains(el) && !el.contains(valueEl)) {
          const ecs = getComputedStyle(el);
          coveredBy = { tag: el.tagName, cls: el.className, bg: ecs.backgroundColor, opacity: ecs.opacity };
        }
      }
    }
    return {
      found: true,
      classes: sel.className,
      containerHasValue: container ? container.classList.contains('ng-has-value') : null,
      valueText: valueEl ? valueEl.textContent.trim() : null,
      valueColor: cs ? cs.color : null,
      valueRect,
      topmostAtValueCenter: topmostTag,
      coveredBy,
      placeholderDisplay: placeholderEl ? getComputedStyle(placeholderEl).display : null,
      inputBg: inputEl ? getComputedStyle(inputEl).backgroundColor : null,
      inputColor: inputEl ? getComputedStyle(inputEl).color : null,
      containerShadow: container ? getComputedStyle(container).boxShadow : null,
      containerBorder: container ? getComputedStyle(container).borderColor : null,
      inputShadow: inputEl ? getComputedStyle(inputEl).boxShadow : null,
      inputBorder: inputEl ? getComputedStyle(inputEl).borderColor : null,
    };
  })()`;
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();

  const out = { steps: [] };

  await page.goto(`${BASE}/discover/log-analyzer`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);

  out.url = page.url();
  out.title = await page.title();
  out.onLogin = await page.evaluate(() =>
    !!document.querySelector('input[type="password"]') ||
    location.href.toLowerCase().includes('login'));

  // Programmatic login when credentials are provided via env (UTM_USER / UTM_PASS)
  if (out.onLogin) {
    const user = process.env.UTM_USER;
    const pass = process.env.UTM_PASS;
    if (!user || !pass) {
      out.note = 'Landed on login. Set UTM_USER and UTM_PASS env vars to authenticate.';
      console.log(JSON.stringify(out, null, 2));
      await browser.close();
      return;
    }
    try {
      await page.fill('input[formcontrolname="username"]', user, { timeout: 8000 });
      await page.fill('input[type="password"]', pass, { timeout: 8000 });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);
      await page.goto(`${BASE}/discover/log-analyzer`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitApp(page);
      out.steps.push('logged in, url=' + page.url());
    } catch (e) {
      out.note = 'Login attempt failed: ' + e.message;
      console.log(JSON.stringify(out, null, 2));
      await browser.close();
      return;
    }
  }

  // Open the "Add filter" popover
  try {
    await page.getByText('Add filter', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(800);
    out.steps.push('clicked Add filter');
  } catch (e) {
    out.steps.push('Add filter click failed: ' + e.message);
  }

  // The Field ng-select (first ng-select in the popover)
  const beforeOpen = await page.evaluate(dumpSelect());
  out.beforeOpen = beforeOpen;

  try {
    await page.locator('ng-select .ng-select-container').first().click({ timeout: 8000 });
    await page.waitForTimeout(700);
    out.optionCount = await page.evaluate(() => document.querySelectorAll('.ng-dropdown-panel .ng-option').length);
    out.steps.push('opened Field dropdown, options=' + out.optionCount);
  } catch (e) {
    out.steps.push('open dropdown failed: ' + e.message);
  }

  // Click the first option
  try {
    await page.locator('.ng-dropdown-panel .ng-option').first().click({ timeout: 8000 });
    await page.waitForTimeout(800);
    out.steps.push('clicked first option');
  } catch (e) {
    out.steps.push('click option failed: ' + e.message);
  }

  out.afterSelect = await page.evaluate(dumpSelect());

  // Candidate fix: neutralize the inner input's focus ring/border (the source of
  // the second glowing box) and keep it transparent.
  await page.addStyleTag({ content: `
    .ng-select .ng-input, .ng-select .ng-input > input {
      background: transparent !important;
      background-color: transparent !important;
    }
    .ng-select .ng-input > input,
    .ng-select .ng-input > input:focus {
      box-shadow: none !important;
      border: none !important;
      outline: none !important;
    }
  ` });
  await page.waitForTimeout(300);
  // keep it focused to compare the ring
  await page.locator('ng-select .ng-select-container').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  out.afterFix = await page.evaluate(dumpSelect());

  // Screenshot the control region for visual confirmation
  try {
    const box = await page.locator('ng-select').first().boundingBox();
    if (box) {
      await page.screenshot({
        path: 'field-after-fix.png',
        clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 30), width: box.width + 20, height: box.height + 50 },
      });
      out.screenshot = 'field-after-fix.png';
    }
  } catch (e) { out.steps.push('screenshot failed: ' + e.message); }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
