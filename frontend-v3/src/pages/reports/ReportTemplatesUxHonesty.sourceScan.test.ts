import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPORT_TEMPLATES_JOB_SENTENCE } from './ReportTemplatesPage';

describe('Report templates UX honesty (Prompt 35)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/reports/ReportTemplatesPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/reports/ReportingOperations.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/reports/reportTemplates.service.ts'), 'utf8');

  it('states templates job sentence distinct from Studio authoring and schedule ops', () => {
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Report templates/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Studio|dashboard/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Scheduled Reports|schedule/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).not.toMatch(/report generated/i);
    expect(page).toContain('REPORT_TEMPLATES_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('templates-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARDS');
    expect(page).toContain('ROUTES.DASHBOARD_STUDIO');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('ROUTES.REPORTS_SITREP');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/reports/);
    expect(page).not.toMatch(/href="\/dashboards/);
  });

  it('uses legacy TEMPLATE inventory and fail-closed create/generate', () => {
    expect(service).toContain("fetchReportsByType('TEMPLATE'");
    expect(service).toContain('/ha-reports');
    expect(page).toContain('rpt-page__projection-note');
    expect(page).toContain("data-template-create={reportTemplatesService.fixtureMode ? 'fixture' : 'fail-closed'}");
    expect(page).toContain('templates-create-fail-closed');
    expect(page).toContain('templates-generate-fail-closed');
    expect(page).toContain('CREATE_TEMPLATE_FAIL_CLOSED_TITLE');
    expect(page).toContain('GENERATE_FROM_TEMPLATE_FAIL_CLOSED_TITLE');
    expect(page).not.toMatch(/report generated/i);
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
  });

  it('uses templates inventory with compact inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.rpt-inventory');
    expect(styles).toContain('.rpt-inline-stats');
    expect(styles).toContain('.templates-empty-honesty');
  });

  it('keeps StatusDock historical for template inventory snapshot', () => {
    expect(page).toMatch(/mode=["']historical["']/);
    expect(page).not.toMatch(/mode=\{reportTemplatesService\.fixtureMode\?'historical':'live'\}/);
  });
});
