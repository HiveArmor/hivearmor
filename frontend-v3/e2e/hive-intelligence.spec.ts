import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'hive-intelligence');

const INTELLIGENCE_TABS = ['Look up', 'Indicators', 'Feeds', 'Ask Hive', 'Findings'] as const;

function resolveE2ePassword(): string {
  if (process.env.HA_E2E_PASSWORD) {
    return process.env.HA_E2E_PASSWORD;
  }
  const bootstrapPath = path.join(process.env.HOME ?? '', 'hivearmor-staging-ADMIN_BOOTSTRAP.txt');
  if (fs.existsSync(bootstrapPath)) {
    return fs.readFileSync(bootstrapPath, 'utf8').trim().split(/\r?\n/)[0]?.trim() ?? 'localdev123!';
  }
  return 'localdev123!';
}

async function loginAs(page: Page, login: string, password: string): Promise<void> {
  const response = await page.request.post('/api/authenticate', {
    data: { username: login, password, rememberMe: false },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id_token?: string; token?: string };
  const token = body.token ?? body.id_token ?? '';
  expect(token.length).toBeGreaterThan(0);

  await page.addInitScript((tk: string) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('hivearmor_auth_token', tk);
  }, token);
}

test.describe('Hive Intelligence visual smoke', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', resolveE2ePassword());
    const accountResponse = page.waitForResponse(
      (r) => r.url().includes('/api/account') && r.request().method() === 'GET'
    );
    await page.goto('/intelligence', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    expect((await accountResponse).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Hive Intelligence' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('region', { name: 'IOC inventory summary' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('renders shell, stats, and cross-links', async ({ page }) => {
    await expect(page.locator('.hi-page__badge')).toHaveText('STAGING CANDIDATE');
    await expect(page.getByRole('region', { name: 'IOC inventory summary' })).toContainText('Active IOCs:');
    await expect(page.getByRole('link', { name: 'Search & Hunt' })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-shell.png'), fullPage: true });
  });

  for (const tab of INTELLIGENCE_TABS) {
    test(`tab: ${tab} switches and screenshots`, async ({ page }) => {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');

      const slug = tab.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `tab-${slug}.png`),
        fullPage: true,
      });
    });
  }

  test('lookup flow shows result panel', async ({ page }) => {
    await page.getByRole('tab', { name: 'Look up' }).click();
    await page.getByLabel('IOC type').selectOption('domain');
    await page.getByLabel('IOC value').fill('example.com');

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/ha-threat-intel/lookup') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Look up' }).click(),
    ]);
    expect(response.ok()).toBeTruthy();

    await expect(page.getByRole('region', { name: 'IOC lookup result' })).toBeVisible({
      timeout: 10_000,
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'lookup-result.png'), fullPage: true });
  });

  test('feeds filter narrows cards', async ({ page }) => {
    await page.getByRole('tab', { name: 'Feeds' }).click();
    await expect(page.getByRole('region', { name: 'Threat feeds' })).toBeVisible();
    await page.getByLabel('Filter feeds').fill('CISA');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'feeds-filter.png'), fullPage: true });
  });

  test('indicators tab shows feed picker', async ({ page }) => {
    await page.getByRole('tab', { name: 'Indicators' }).click();
    await expect(
      page.getByText(/Select a feed to browse indicators/i)
    ).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'indicators-picker.png'), fullPage: true });
  });

  test('ask hive submits and shows structured honesty', async ({ page }) => {
    await page.getByRole('tab', { name: 'Ask Hive' }).click();
    await page.getByLabel('Ask Hive question').fill('Summarize staging SOC AI readiness.');
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/ha-soc-ai/query') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /Ask Hive/i }).click(),
    ]);

    expect(response.ok()).toBeTruthy();
    await expect(
      page.getByRole('alert').filter({ hasText: /Required permission/i })
    ).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Intelligence finding' })).toBeVisible({
      timeout: 10_000,
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ask-hive-result.png'), fullPage: true });
  });

  test('cross-link navigates to Search & Hunt', async ({ page }) => {
    await page.getByRole('link', { name: 'Search & Hunt' }).click();
    await expect(page).toHaveURL(/\/search/, { timeout: 10_000 });
  });
});
