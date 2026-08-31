/**
 * DashboardViewPage Tests — Prompt 33 / Wave C1 slice 3
 */

import { describe, it, expect } from 'vitest';

import { DASHBOARD_RUNTIME_JOB_SENTENCE, DashboardViewPage } from './DashboardViewPage';

describe('DashboardViewPage', () => {
  it('should export DashboardViewPage component', () => {
    expect(DashboardViewPage).toBeDefined();
    expect(typeof DashboardViewPage).toBe('function');
  });

  it('exports runtime job sentence distinct from gallery, Studio, and reports', () => {
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Dashboard runtime/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Gallery|Dashboards/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Studio/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Reports|reporting/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).not.toMatch(/report generated/i);
  });
});
