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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const out = { steps: [] };

  await page.goto(`${BASE}/discover/log-analyzer`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);

  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/discover/log-analyzer`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
    out.steps.push('logged in');
  }

  // Click "Try SQL"
  try {
    await page.getByText('Try SQL', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    out.steps.push('clicked Try SQL');
  } catch (e) { out.steps.push('Try SQL click failed: ' + e.message); }

  // Focus the Monaco editor
  try {
    await page.locator('.monaco-editor').first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
    out.steps.push('focused editor');
  } catch (e) { out.steps.push('focus editor failed: ' + e.message); }

  out.measure = await page.evaluate(() => {
    const ed = document.querySelector('.monaco-editor');
    const ta = document.querySelector('.monaco-editor textarea') ||
               document.querySelector('.monaco-editor .inputarea');
    const cs = ta ? getComputedStyle(ta) : null;
    const edcs = ed ? getComputedStyle(ed) : null;
    return {
      editorFound: !!ed,
      editorBg: edcs ? edcs.backgroundColor : null,
      textareaFound: !!ta,
      textareaClass: ta ? ta.className : null,
      textareaBoxShadow: cs ? cs.boxShadow : null,
      textareaBorder: cs ? (cs.borderTopWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor) : null,
      textareaOutline: cs ? cs.outline : null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
