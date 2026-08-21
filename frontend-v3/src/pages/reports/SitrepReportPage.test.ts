/**
 * SitrepReportPage — Tests
 */

import { describe, it, expect } from 'vitest';

describe('SitrepReportPage', () => {
  it('exports SitrepReportPage component', async () => {
    const module = await import('./SitrepReportPage');
    expect(module.SitrepReportPage).toBeTruthy();
    expect(typeof module.SitrepReportPage).toBe('function');
  });
});
