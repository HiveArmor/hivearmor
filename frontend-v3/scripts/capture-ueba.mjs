import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const base = process.env.HA_UEBA_BASE ?? 'http://127.0.0.1:5188';
const outputDir = resolve(process.cwd(), '../docs/ai-handoff/detection-ui-verify');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 1,
});
await context.addInitScript(() => {
  localStorage.setItem('hivearmor_auth_token', 'foundation-visual-validation-token');
});
const page = await context.newPage();
await page.goto(`${base}/ueba/risk`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'UEBA Risk' }).waitFor({ timeout: 20000 });
await page.getByTestId('ueba-risk-model-honesty').waitFor();
await page.screenshot({ path: resolve(outputDir, 'ueba-risk.png'), fullPage: true });

await page.goto(`${base}/detection-rules`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Detection Engineering' }).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'UEBA', exact: true }).click();
await page.getByTestId('detection-ueba-panel').waitFor({ timeout: 15000 });
await page.screenshot({ path: resolve(outputDir, 'ueba-detection-panel.png'), fullPage: true });
await page.getByTestId('ueba-deviation-table').waitFor();
await page.screenshot({ path: resolve(outputDir, 'ueba-deviations.png'), fullPage: false });

await page.goto(`${base}/detection-rules`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /ATT&CK coverage/ }).click();
await page.getByTestId('coverage-ueba-link').waitFor({ timeout: 15000 });
await page.screenshot({ path: resolve(outputDir, 'ueba-coverage-link.png'), fullPage: false });

await browser.close();
console.log(JSON.stringify({ ok: true, outputDir, files: ['ueba-risk.png', 'ueba-detection-panel.png', 'ueba-deviations.png', 'ueba-coverage-link.png'] }));
