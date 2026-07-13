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
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const runResps = [], consoleErrors = [];

  page.on('response', async res => {
    if (res.url().includes('utm-visualizations/run')) {
      let body = ''; try { body = (await res.text()).slice(0, 600); } catch {}
      runResps.push({ status: res.status(), body });
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 400)));

  await page.goto(`${BASE}/creator/builder/chart-builder?chart=BAR_CHART`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitApp(page);
  if (await page.evaluate(() => !!document.querySelector('input[type="password"]'))) {
    await page.fill('input[formcontrolname="username"]', process.env.UTM_USER || '');
    await page.fill('input[type="password"]', process.env.UTM_PASS || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/creator/builder/chart-builder?chart=BAR_CHART`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);
  }

  await page.waitForTimeout(2000);

  // Click Run
  try {
    await page.locator('button:has-text("Run"), .cb-run-btn').first().click({ timeout: 8000 });
    await page.waitForTimeout(4000);
  } catch (e) { console.error('Run click failed:', e.message); }

  // Deep DOM inspection after run
  const inspection = await page.evaluate(() => {
    const chartView = document.querySelector('app-chart-view');
    const echartsDiv = document.querySelector('[echarts]');
    const noDataChart = document.querySelector('app-no-data-chart');

    // Check echarts canvas and size
    const canvas = document.querySelector('.ec-chart canvas, canvas');
    const canvasRect = canvas ? (() => {
      const r = canvas.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })() : null;

    // The critical condition in chart-view.html:
    // *ngIf="!loadingOption && data && echartOption && data.length>0"
    // Inspect via ng-reflect what the template sees
    const echartsNgIf = echartsDiv ? echartsDiv.closest('[ng-reflect-ng-if]') : null;
    const echartsVisible = echartsDiv ? getComputedStyle(echartsDiv).display !== 'none' : false;

    // Check if there are any hidden elements wrapping it
    let hiddenParent = null;
    let node = echartsDiv;
    for (let i = 0; i < 10 && node; i++) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
        hiddenParent = { tag: node.tagName, cls: node.className, display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
        break;
      }
      node = node.parentElement;
    }

    // Check the options object passed
    const optAttrib = echartsDiv ? echartsDiv.getAttribute('ng-reflect-options') : null;
    const autoResizeAttr = echartsDiv ? echartsDiv.getAttribute('ng-reflect-auto-resize') : null;
    const heightStyle = echartsDiv ? echartsDiv.style.height : null;
    const widthStyle = echartsDiv ? echartsDiv.style.width : null;

    // Check parent sizing
    const previewPanel = document.querySelector('.cb-preview-panel');
    const previewRect = previewPanel ? (() => {
      const r = previewPanel.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })() : null;

    // Check the *ngIf comment nodes around echarts div to understand data$ state
    const chartBody = document.querySelector('.card-body.chart-container');
    const bindingComments = [];
    if (chartBody) {
      chartBody.childNodes.forEach(n => {
        if (n.nodeType === 8) bindingComments.push(n.textContent.trim().slice(0, 120));
      });
    }

    return {
      canvasFound: !!canvas,
      canvasRect,
      echartsVisible,
      hiddenParent,
      heightStyle,
      widthStyle,
      optAttrib: optAttrib ? optAttrib.slice(0, 60) : null,
      autoResizeAttr,
      previewRect,
      bindingComments,
      noDataChartFound: !!noDataChart,
      chartViewHTML_snippet: chartView ? chartView.innerHTML.slice(300, 700) : null,
    };
  });

  // Take a screenshot for visual confirmation
  try {
    const previewPanel = await page.locator('.cb-preview-panel, .data-visualization').first().boundingBox();
    if (previewPanel) {
      await page.screenshot({
        path: 'chart-render-after-run.png',
        clip: { x: Math.max(0, previewPanel.x - 4), y: Math.max(0, previewPanel.y - 4),
                width: previewPanel.width + 8, height: previewPanel.height + 8 }
      });
    }
  } catch {}

  console.log(JSON.stringify({ runResps, inspection, consoleErrors: consoleErrors.slice(0, 8) }, null, 2));
  await browser.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
