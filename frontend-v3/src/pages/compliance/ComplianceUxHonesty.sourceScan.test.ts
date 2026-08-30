import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMPLIANCE_ASSURANCE_JOB_SENTENCE } from './CompliancePage';

describe('Compliance Assurance UX honesty (Prompt 30)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/compliance/CompliancePage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/compliance/CompliancePage.css'),
    'utf8',
  );
  const postureService = readFileSync(join(process.cwd(), 'src/services/posture.service.ts'), 'utf8');
  const complianceService = readFileSync(
    join(process.cwd(), 'src/services/compliance.service.ts'),
    'utf8',
  );

  it('states compliance assurance job sentence distinct from CIS and detection coverage', () => {
    expect(COMPLIANCE_ASSURANCE_JOB_SENTENCE).toMatch(/Compliance assurance/i);
    expect(COMPLIANCE_ASSURANCE_JOB_SENTENCE).toMatch(/framework assessment scores/i);
    expect(COMPLIANCE_ASSURANCE_JOB_SENTENCE).toMatch(
      /not certification or legal attestation|CIS Benchmark|Detection Coverage/i,
    );
    expect(page).toContain('COMPLIANCE_ASSURANCE_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('compliance-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.CIS_BENCHMARK');
    expect(page).toContain('ROUTES.READINESS');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
    expect(page).not.toMatch(/href="\/reports\//);
    expect(page).not.toMatch(/href="\/compliance/);
  });

  it('uses canonical posture APIs for inventory and CMP read contracts in the drawer', () => {
    expect(postureService).toContain('/ha-posture/score');
    expect(postureService).toContain('/ha-posture/frameworks');
    expect(postureService).not.toMatch(/\/api\/compliance\//);
    expect(complianceService).toContain('/compliance/control-config/get-by-id/');
    expect(complianceService).toContain('/compliance/control-config/');
    expect(complianceService).toContain('/compliance/controls/');
    expect(page).toContain('cmp-page__projection-note');
    expect(page).toContain('Control and evidence workspace');
    expect(page).toContain('cmp-control-workspace');
    expect(page).toContain('No control outcomes were returned');
    expect(page).toContain('No evidence was returned');
    expect(page).not.toContain('cmp-drawer__card--blocked');
    expect(page).not.toContain('Requires CMP-002 and CMP-003');
    expect(page).not.toContain('className="cmp-summary"');
    expect(page).not.toContain('cmp-trust-strip');
    expect(page).not.toMatch(/certified|attestation claim|compliant by default/i);
  });

  it('uses inventory workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.cmp-inventory');
    expect(styles).toContain('.cmp-inline-stats');
    expect(styles).not.toMatch(/^\.cmp-summary\b/m);
    expect(styles).not.toContain('.cmp-trust-strip');
    expect(page).toContain('HaDrawer');
  });

  it('drawer and footer pivots use Link + ROUTES', () => {
    expect(page).toContain('ROUTES.CIS_BENCHMARK');
    expect(page).toContain('ROUTES.REPORTS_SCHEDULED');
    expect(page).toContain('CMP read contracts live');
  });
});
