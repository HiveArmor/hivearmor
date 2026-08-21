import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const baseUrl = process.env.HA_INCIDENT_BASE ?? 'http://127.0.0.1:4176';
const outputDir = resolve(process.cwd(), '../docs/screenshots/hivearmor-incident-workbench');
await mkdir(outputDir, { recursive: true });

const account = {
  id: 41,
  login: 'maya.chen',
  firstName: 'Maya',
  lastName: 'Chen',
  email: 'maya.chen@example.test',
  activated: true,
  langKey: 'en',
  authorities: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER'],
};

async function configure(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/account') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account) });
    }
    if (path.endsWith('/system-info')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ airGapMode: false }) });
    }
    if (request.headers().accept?.includes('text/event-stream')) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"eps":1840000,"timestamp":"2026-08-02T08:00:00Z"}\n\n' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('hivearmor_auth_token', 'visual-validation-token'));
  const page = await context.newPage();
  await configure(page);
  return { context, page };
}

async function capture(name, viewport, tab = 'overview', expanded = false) {
  const { context, page } = await newPage(viewport);
  await page.goto(`${baseUrl}/incidents/4821?tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Suspicious privileged-account access from a new geography' }).waitFor();
  if (expanded) await page.getByRole('navigation', { name: 'Primary navigation' }).hover();
  if (tab === 'evidence') await page.getByRole('heading', { name: 'Privileged VPN authentication correlation' }).waitFor();
  if (tab === 'alerts') await page.getByText('3 linked alerts · newest first').waitFor();
  await page.screenshot({ path: resolve(outputDir, name), fullPage: true });
  await context.close();
}

const browser = await chromium.launch({ headless: true });

await capture('incident-overview-1920x1080.png', { width: 1920, height: 1080 });
await capture('incident-overview-1440x900.png', { width: 1440, height: 900 });
await capture('incident-overview-1024x768.png', { width: 1024, height: 768 });
await capture('incident-overview-390x844.png', { width: 390, height: 844 });
await capture('incident-overview-nav-expanded-1440x900.png', { width: 1440, height: 900 }, 'overview', true);
await capture('incident-evidence-1440x900.png', { width: 1440, height: 900 }, 'evidence');
await capture('incident-alerts-1440x900.png', { width: 1440, height: 900 }, 'alerts');

const { context, page } = await newPage({ width: 1440, height: 900 });
await page.goto(`${baseUrl}/incidents/4821?tab=overview`, { waitUntil: 'domcontentloaded' });
await page.locator('h1').waitFor();
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  .analyze();
const accessibility = results.violations.map(({ id, impact, help, nodes }) => ({
  id,
  impact,
  help,
  nodes: nodes.length,
}));
await writeFile(resolve(outputDir, 'accessibility-scan.json'), JSON.stringify(accessibility, null, 2));
await context.close();
await browser.close();

const serious = accessibility.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
console.log(JSON.stringify({ screenshots: 7, accessibility, seriousCount: serious.length }, null, 2));
if (serious.length) process.exitCode = 1;
