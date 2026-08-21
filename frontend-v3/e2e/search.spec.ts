import { test, expect } from '@playwright/test';

test.describe('Search & Hunt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'localdev123!');
    await page.click('[type="submit"]');
    await page.waitForURL(/.*command/);
  });

  test('navigates to search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL('/search');
    await expect(page.locator('body')).not.toContainText('404');
  });
});
