import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DASHBOARD_STUDIO_JOB_SENTENCE } from './DashboardStudioPage';

describe('Dashboard Studio UX honesty (Prompt 32)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/dashboards/DashboardStudioPage.tsx'), 'utf8');
  const service = readFileSync(
    join(process.cwd(), 'src/pages/dashboards/dashboardOperations.service.ts'),
    'utf8',
  );

  it('states Studio job sentence distinct from gallery discover and report generation', () => {
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Dashboard Studio/i);
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Gallery|Dashboards/i);
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Reports|reporting/i);
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).not.toMatch(/report generated/i);
    expect(page).toContain('DASHBOARD_STUDIO_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('ROUTES.DASHBOARDS');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('ROUTES.REPORTS_TEMPLATES');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/dashboards/);
    expect(page).not.toMatch(/href="\/reports/);
  });

  it('keeps save fail-closed outside fixtures and offers no publish action', () => {
    expect(service).toContain('Canonical versioned dashboard save contract is unavailable');
    expect(page).toContain("data-studio-save={canSaveFixture ? 'fixture' : 'fail-closed'}");
    expect(page).toContain('disabled={save.isPending || !canSaveFixture}');
    expect(page).toContain('SAVE_FAIL_CLOSED_TITLE');
    expect(page).toContain('studio-save-fail-closed');
    expect(page).not.toMatch(/Ready to publish/i);
    expect(page).not.toMatch(/>Publish</);
    expect(page).not.toMatch(/onClick=\{\(\) => .*publish/i);
  });

  it('keeps StatusDock historical for definition authoring (not live inventory)', () => {
    expect(page).toMatch(/mode=["']historical["']/);
    expect(page).not.toMatch(/mode=\{canSaveFixture\?'historical':'live'\}/);
  });
});
