import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const fixtureBase = process.env.HA_FIXTURE_BASE ?? 'http://127.0.0.1:4174';
const stateBase = process.env.HA_STATE_BASE ?? 'http://127.0.0.1:4175';
const outputDir = resolve(process.cwd(), '../docs/screenshots/hivearmor-foundation');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
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

async function routeCommon(page, state = 'healthy') {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account) });
    if (path.endsWith('/system-info')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ airGapMode: false }) });
    if (path.endsWith('/overview/health')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'UP' }) });
    if (request.headers().accept?.includes('text/event-stream')) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"eps":1840000,"timestamp":"2026-08-02T08:00:00Z"}\n\n' });
    }
    if (state === 'loading' && (path.includes('count-alerts') || path.includes('ha-incidents'))) {
      await new Promise((done) => setTimeout(done, 15000));
    }
    if (state === 'error' && (path.includes('count-alerts') || path.includes('ha-incidents'))) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function newContext(viewport, authenticated = false) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', deviceScaleFactor: 1 });
  if (authenticated) {
    await context.addInitScript(() => localStorage.setItem('hivearmor_auth_token', 'visual-validation-token'));
  }
  return context;
}

async function captureLogin(name, viewport, validate = false) {
  const context = await newContext(viewport);
  const page = await context.newPage();
  await routeCommon(page);
  await page.goto(`${fixtureBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to HiveArmor' }).waitFor();
  if (validate) await page.getByRole('button', { name: 'Sign in' }).click();
  await page.screenshot({ path: resolve(outputDir, name), fullPage: true });
  await context.close();
}

async function captureDashboard(name, viewport, options = {}) {
  const context = await newContext(viewport, true);
  const page = await context.newPage();
  await routeCommon(page, options.state);
  await page.goto(`${options.state ? stateBase : fixtureBase}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Mission Control' }).waitFor();
  if (options.expanded) await page.getByRole('navigation', { name: 'Primary navigation' }).hover();
  if (options.state === 'error') await page.getByText('Operational data could not be loaded. Verify connectivity and try again.').waitFor();
  await page.screenshot({ path: resolve(outputDir, name), fullPage: true });
  await context.close();
}

await captureLogin('login-1440x900-default.png', { width: 1440, height: 900 });
await captureLogin('login-1024x768-default.png', { width: 1024, height: 768 });
await captureLogin('login-390x844-default.png', { width: 390, height: 844 });
await captureLogin('login-1440x900-validation.png', { width: 1440, height: 900 }, true);

await captureDashboard('dashboard-1920x1080-populated.png', { width: 1920, height: 1080 });
await captureDashboard('dashboard-1440x900-populated.png', { width: 1440, height: 900 });
await captureDashboard('dashboard-1280x800-populated.png', { width: 1280, height: 800 });
await captureDashboard('dashboard-1024x768-populated.png', { width: 1024, height: 768 });
await captureDashboard('dashboard-1440x900-nav-expanded.png', { width: 1440, height: 900 }, { expanded: true });
await captureDashboard('dashboard-1440x900-loading.png', { width: 1440, height: 900 }, { state: 'loading' });
await captureDashboard('dashboard-1440x900-error.png', { width: 1440, height: 900 }, { state: 'error' });

const accessibility = {};
for (const [name, url, authenticated] of [
  ['login', `${fixtureBase}/login`, false],
  ['dashboard', `${fixtureBase}/dashboard`, true],
]) {
  const context = await newContext({ width: 1440, height: 900 }, authenticated);
  const page = await context.newPage();
  await routeCommon(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').waitFor();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  accessibility[name] = results.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.length }));
  await context.close();
}
await writeFile(resolve(outputDir, 'accessibility-scan.json'), JSON.stringify(accessibility, null, 2));
await browser.close();

const serious = Object.values(accessibility).flat().filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
if (serious.length) {
  console.error(JSON.stringify({ accessibility, seriousCount: serious.length }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ screenshots: 11, accessibility, seriousCount: 0 }, null, 2));
}
