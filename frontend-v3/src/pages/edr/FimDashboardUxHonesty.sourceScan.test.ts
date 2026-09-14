import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIM_DASHBOARD_JOB_SENTENCE } from './FimDashboardPage';

describe('FIM dashboard UX honesty (Prompt 22)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/edr/FimDashboardPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/edr/FimDashboardPage.css'), 'utf8');

  it('states analytics-dashboard job sentence distinct from endpoints and sensors', () => {
    expect(FIM_DASHBOARD_JOB_SENTENCE).toMatch(/change trends|top modified paths|suspicious hashes/i);
    expect(FIM_DASHBOARD_JOB_SENTENCE).toMatch(/Endpoints|Sensors/i);
    expect(FIM_DASHBOARD_JOB_SENTENCE).not.toMatch(/fleet enrollment lives on Endpoints/i);
    expect(page).toContain('FIM_DASHBOARD_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('fim-empty-honesty');
    // W4 IA: FIM co-located under Endpoint Security — cross-links point at canonical /endpoints
    // and the co-located FIM Policies route. SPEC-06 W5: the retired Plane B "Agent Policies"
    // link (ROUTES.EDR_POLICIES) is removed; FIM Policies is the single canonical Policies surface.
    expect(page).toContain('ROUTES.ENDPOINTS');
    expect(page).toContain('ROUTES.ENDPOINTS_FIM_POLICIES');
    expect(page).not.toContain('ROUTES.EDR_POLICIES');
    expect(page).toContain('ROUTES.RESPONSE_QUARANTINE');
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/edr\//);
  });

  it('keeps summary-only API and folds agent filter failure into projection note', () => {
    expect(page).toContain('/api/ha-edr/fim/summary');
    expect(page).toContain('fim-page__projection-note');
    expect(page).not.toMatch(/\/api\/ha-edr\/fim\/events/);
    expect(page).not.toContain('Agent filter partial');
  });

  it('uses analytics dashboard workspace with compact inline stats and no hero KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.fim-dashboard');
    expect(styles).toContain('.fim-filter-bar__stats');
    expect(styles).not.toContain('.fim-summary');
    expect(page).not.toContain('fim-summary');
  });

  it('extracts layout styles to FimDashboardPage.css with design tokens only', () => {
    expect(page).toContain("import './FimDashboardPage.css'");
    expect(styles).toContain('var(--ha-background)');
    expect(styles).toContain('var(--ha-primary)');
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
