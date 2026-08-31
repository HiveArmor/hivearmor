import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DASHBOARD_GALLERY_JOB_SENTENCE } from './DashboardGalleryPage';

describe('Dashboard gallery UX honesty (Prompt 31)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/dashboards/DashboardGalleryPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/dashboards/DashboardOperations.css'), 'utf8');
  const service = readFileSync(
    join(process.cwd(), 'src/pages/dashboards/dashboardOperations.service.ts'),
    'utf8',
  );

  it('states gallery job sentence distinct from Studio and Scheduled Reports', () => {
    expect(DASHBOARD_GALLERY_JOB_SENTENCE).toMatch(/Dashboard gallery/i);
    expect(DASHBOARD_GALLERY_JOB_SENTENCE).toMatch(/Studio|Scheduled Reports/i);
    expect(DASHBOARD_GALLERY_JOB_SENTENCE).not.toMatch(/report generated/i);
    expect(page).toContain('DASHBOARD_GALLERY_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('dashboards-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.DASHBOARD_STUDIO');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('ROUTES.REPORTS_TEMPLATES');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/dashboards/);
  });

  it('uses canonical /ha-dashboards inventory and honest projection note', () => {
    expect(service).toContain('/ha-dashboards');
    expect(page).toContain('dsh-page__projection-note');
    expect(page).not.toContain('dsh-summary');
  });

  it('uses gallery workspace with compact inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.dsh-inventory');
    expect(styles).toContain('.dsh-inline-stats');
    expect(styles).not.toContain('.dsh-summary');
  });

  it('keeps StatusDock historical for snapshot inventory (C1-LIVE-01)', () => {
    expect(page).toMatch(/mode=["']historical["']/);
    expect(page).not.toMatch(/mode=\{dashboardOperationsService\.fixtureMode\?'historical':'live'\}/);
  });
});
