/**
 * ScheduledReportsPage — Tests
 * Session: S35
 * Spec: .plan/frontend-v3-spec/screens/RPT-04-scheduled-reports.md
 */

import { describe, expect, it } from 'vitest';

import * as reportsService from './reports.service';

describe('ScheduledReportsPage', () => {
  it('exports ScheduledReportsPage component', async () => {
    const module = await import('./ScheduledReportsPage.tsx');
    expect(module.ScheduledReportsPage).toBeDefined();
    expect(typeof module.ScheduledReportsPage).toBe('function');
  });
});

describe('reports.service', () => {
  it('exports fetchScheduledReports function', () => {
    expect(reportsService.fetchScheduledReports).toBeDefined();
    expect(typeof reportsService.fetchScheduledReports).toBe('function');
  });

  it('exports createScheduledReport function', () => {
    expect(reportsService.createScheduledReport).toBeDefined();
    expect(typeof reportsService.createScheduledReport).toBe('function');
  });

  it('exports updateScheduledReport function', () => {
    expect(reportsService.updateScheduledReport).toBeDefined();
    expect(typeof reportsService.updateScheduledReport).toBe('function');
  });

  it('exports deleteScheduledReport function', () => {
    expect(reportsService.deleteScheduledReport).toBeDefined();
    expect(typeof reportsService.deleteScheduledReport).toBe('function');
  });

  it('exports runScheduledReport function', () => {
    expect(reportsService.runScheduledReport).toBeDefined();
    expect(typeof reportsService.runScheduledReport).toBe('function');
  });

  it('exports pauseScheduledReport function', () => {
    expect(reportsService.pauseScheduledReport).toBeDefined();
    expect(typeof reportsService.pauseScheduledReport).toBe('function');
  });

  it('exports resumeScheduledReport function', () => {
    expect(reportsService.resumeScheduledReport).toBeDefined();
    expect(typeof reportsService.resumeScheduledReport).toBe('function');
  });
});
