import { defineConfig, devices } from '@playwright/test';

/**
 * Storybook visual-regression + a11y config — HaUI governance gate (design plan §6, Phase C5).
 *
 * Drives the *served* static Storybook (storybook-static) with a real Chromium via Playwright, so it
 * sidesteps the local browser-mode BUNDLING wall that blocked @storybook/addon-vitest (the storybook
 * node chunk leaked into the browser bundle). Here Playwright just navigates to story iframe URLs.
 *
 * DELIBERATELY SEPARATE from playwright.config.ts (the app e2e suite) — its own testDir and port.
 * Run with `npm run test:storybook`. Baselines are committed as PNGs; regenerate in CI (Linux) to
 * avoid cross-OS font/antialiasing diffs — see the workflow .github/workflows/storybook-visual.yml.
 */
const PORT = 6099;

export default defineConfig({
  testDir: './e2e-storybook',
  // Snapshots are OS/browser-sensitive; key them by platform so Linux (CI) and local don't clash.
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report-storybook', open: 'never' }], ['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // Small tolerance absorbs sub-pixel noise without hiding real regressions.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Serve the pre-built static Storybook. Build it first: `npm run storybook:build`.
  webServer: {
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
