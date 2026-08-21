import { test } from '@playwright/test';

test('debug: inspect login page inputs', async ({ page }) => {
  await page.goto('/login');
  // Wait for form to actually render
  await page.waitForSelector('input', { timeout: 15000 });
  const title = await page.title();
  console.log('Page title:', title);
  const inputs = await page.locator('input').all();
  for (const inp of inputs) {
    const id = await inp.getAttribute('id');
    const name = await inp.getAttribute('name');
    const type = await inp.getAttribute('type');
    const placeholder = await inp.getAttribute('placeholder');
    console.log(`  input id="${id}" name="${name}" type="${type}" placeholder="${placeholder}"`);
  }
  const url = page.url();
  console.log('URL:', url);
});
