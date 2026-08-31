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
    expect(complianceService).toContain('/compliance/standard-section');
    expect(complianceService).toContain('/compliance/control-config/get-by-section');
    expect(complianceService).toContain('/compliance/control-config/get-by-id/');
    expect(complianceService).toContain('/compliance/control-config/');
    expect(complianceService).toContain('/compliance/controls/');
    expect(complianceService).toContain('parseFrameworkStandardId');
    expect(complianceService).toContain('resolveFrameworkRepresentativeControl');
    expect(complianceService).toContain('getSectionControlsPage');
    expect(complianceService).toContain('CMP_SECTION_CONTROLS_PAGE_SIZE');
    expect(complianceService).toContain('CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE');
    expect(complianceService).toContain('CMP_EXCEPTIONS_READ_AVAILABLE');
    expect(complianceService).toContain('CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE');
    expect(complianceService).toContain('CMP_EXCEPTIONS_WRITE_AVAILABLE');
    expect(complianceService).toContain('CMP_EVALUATION_HISTORY_READ_AVAILABLE');
    expect(complianceService).toContain('CMP_REPORT_SNAPSHOTS_READ_AVAILABLE');
    expect(complianceService).toContain('CMP_SCHEDULED_REPORTS_READ_AVAILABLE');
    expect(complianceService).toContain('CMP_GOVERNANCE_READ_CONTRACTS');
    expect(complianceService).toContain('CMP_DRAWER_READ_CONTRACTS');
    expect(complianceService).toContain('getControlImprovementActions');
    expect(complianceService).toContain('getControlExceptions');
    expect(complianceService).toContain('getFrameworkReportSnapshots');
    expect(complianceService).toContain('getFrameworkScheduledReports');
    expect(complianceService).toContain('getReportSnapshotExportPath');
    expect(page).toContain('cmp-page__projection-note');
    expect(page).toContain('Control and evidence workspace');
    expect(page).toContain('cmp-control-picker');
    expect(page).toContain('cmp-control-workspace');
    expect(page).toContain('cmp-framework-reports');
    expect(page).toContain('cmp-drawer-tabs');
    expect(page).toContain('cmp-workspace-tab-');
    expect(page).toContain('EvaluationHistoryReadPanel');
    expect(page).toContain('FrameworkReportsWorkspace');
    expect(page).toContain('FrameworkScheduledReportsWorkspace');
    expect(page).toContain('GovernanceUnavailablePanel');
    expect(page).toContain('ImprovementActionsPanel');
    expect(page).toContain('ExceptionsPanel');
    expect(page).toContain('canMutateComplianceGovernance');
    expect(page).toContain('Evaluation history is read-only');
    expect(page).toContain('cmp-control-mapping-empty');
    expect(page).toContain('No evidence was returned');
    expect(page).not.toContain('cmp-drawer__card--blocked');
    expect(page).not.toContain('Requires CMP-002 and CMP-003');
    expect(page).not.toContain('CMP_DRAWER_SEED_CONTROL_ID');
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
    expect(page).toContain('CMP governance write mutations live');
  });
});
