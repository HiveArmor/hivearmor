import { test, expect } from '@playwright/test';

test.describe('Alert Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'localdev123!');
    await page.click('[type="submit"]');
    await page.waitForURL(/.*command/);
  });

  test('navigates to alerts list', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.locator('h1, [data-testid="page-title"]')).toContainText(/Alert/i);
  });

  test('alerts list shows data grid', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.locator('.ag-root, [role="grid"]')).toBeVisible({ timeout: 10000 });
  });
});
