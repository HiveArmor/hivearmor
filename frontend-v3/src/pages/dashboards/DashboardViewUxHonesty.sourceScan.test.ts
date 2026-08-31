import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GAP_SEC_06_RESOLVED } from './dashboards.service';
import { DASHBOARD_RUNTIME_JOB_SENTENCE } from './DashboardViewPage';

describe('Dashboard runtime UX honesty (Prompt 33)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/dashboards/DashboardViewPage.tsx'), 'utf8');
  const renderer = readFileSync(
    join(process.cwd(), 'src/pages/dashboards/DashboardPanelRenderer.tsx'),
    'utf8',
  );

  it('states runtime job sentence distinct from Studio authoring and report generation', () => {
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Dashboard runtime/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Gallery|Dashboards/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Studio/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).toMatch(/Reports|reporting/i);
    expect(DASHBOARD_RUNTIME_JOB_SENTENCE).not.toMatch(/report generated/i);
    expect(page).toContain('DASHBOARD_RUNTIME_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('ROUTES.DASHBOARDS');
    expect(page).toContain('ROUTES.DASHBOARD_STUDIO');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('ROUTES.REPORTS_TEMPLATES');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/dashboards/);
    expect(page).not.toMatch(/href="\/reports/);
  });

  it('keeps SEC-06 panel run gated and contract_unavailable honest', () => {
    expect(GAP_SEC_06_RESOLVED).toBe(true);
    expect(page).toContain('SEC-06');
    expect(page).toContain('contract_unavailable');
    expect(page).toContain('Tenant scope not applied');
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
    expect(page).not.toMatch(/tenant bound/i);
    expect(renderer).toContain('canExecuteDashboardPanels');
    expect(renderer).toContain('ContractUnavailable');
    expect(renderer).toContain('Required permission: Analyst, SOC Manager, or Platform Administrator');
  });

  it('keeps StatusDock live for runtime panels outside fixtures', () => {
    expect(page).toMatch(/mode=\{dashboardOperationsService\.fixtureMode \? 'historical' : 'live'\}/);
  });
});
