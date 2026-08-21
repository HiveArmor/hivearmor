import { test, expect } from '@playwright/test';

test.describe('Detection Rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'localdev123!');
    await page.click('[type="submit"]');
    await page.waitForURL(/.*command/);
  });

  test('navigates to detection rules', async ({ page }) => {
    await page.goto('/detection-rules');
    await expect(page).toHaveURL('/detection-rules');
    await expect(page.locator('body')).not.toContainText('404');
  });
});
