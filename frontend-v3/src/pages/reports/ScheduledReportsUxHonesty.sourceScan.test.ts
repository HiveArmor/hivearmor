import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCHEDULED_REPORTS_JOB_SENTENCE } from './ScheduledReportsPage';

describe('Scheduled reports UX honesty (Prompt 34)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/reports/ScheduledReportsPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/reports/ScheduledReports.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/reports/reports.service.ts'), 'utf8');

  it('states scheduled reporting job sentence distinct from gallery and Studio', () => {
    expect(SCHEDULED_REPORTS_JOB_SENTENCE).toMatch(/Scheduled reporting/i);
    expect(SCHEDULED_REPORTS_JOB_SENTENCE).toMatch(/Gallery|Dashboards|Studio/i);
    expect(SCHEDULED_REPORTS_JOB_SENTENCE).toMatch(/Templates|template/i);
    expect(SCHEDULED_REPORTS_JOB_SENTENCE).not.toMatch(/report generated/i);
    expect(page).toContain('SCHEDULED_REPORTS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('scheduled-reports-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARDS');
    expect(page).toContain('ROUTES.DASHBOARD_STUDIO');
    expect(page).toContain('ROUTES.REPORTS_TEMPLATES');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/reports/);
  });

  it('uses canonical schedule inventory and REP-004 stamp-only run semantics', () => {
    expect(service).toContain('/ha-reports/scheduled');
    expect(service).toContain('REP-004');
    expect(service).toContain('lastExecutionTime');
    expect(page).toContain('sched-page__projection-note');
    expect(page).toContain('Last-execution stamp recorded');
    expect(page).not.toMatch(/report generated/i);
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
  });

  it('uses schedule workspace with empty honesty and min-height 50vh', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.sched-inventory');
    expect(styles).toContain('.sched-inline-stats');
    expect(styles).toContain('.scheduled-reports-empty-honesty');
  });

  it('keeps StatusDock historical for snapshot inventory (C1-LIVE-01)', () => {
    expect(page).toMatch(/mode=["']historical["']/);
  });
});
