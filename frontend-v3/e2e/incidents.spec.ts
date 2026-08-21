import { test, expect } from '@playwright/test';

test.describe('Incident Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'localdev123!');
    await page.click('[type="submit"]');
    await page.waitForURL(/.*command/);
  });

  test('navigates to incidents list', async ({ page }) => {
    await page.goto('/incidents');
    await expect(page.locator('.ag-root, [role="grid"], h1')).toBeVisible({ timeout: 10000 });
  });
});
