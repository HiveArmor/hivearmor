import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_DETECTION_COVERAGE_JOB_SENTENCE } from './ReadinessMatrixPage';

describe('Posture Detection Coverage UX honesty (Prompt 29)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/posture/readiness/ReadinessMatrixPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/posture/readiness/ReadinessMatrixPage.css'),
    'utf8',
  );
  const service = readFileSync(join(process.cwd(), 'src/services/mitre.service.ts'), 'utf8');

  it('states detection-coverage job sentence distinct from CIS and compliance', () => {
    expect(POSTURE_DETECTION_COVERAGE_JOB_SENTENCE).toMatch(/Detection coverage/i);
    expect(POSTURE_DETECTION_COVERAGE_JOB_SENTENCE).toMatch(/MITRE ATT&CK/i);
    expect(POSTURE_DETECTION_COVERAGE_JOB_SENTENCE).toMatch(
      /Detection Rules|CIS Benchmark|Compliance/i,
    );
    expect(page).toContain('POSTURE_DETECTION_COVERAGE_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('detection-coverage-empty-honesty');
    expect(page).toContain('readiness-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.DETECTION_RULES');
    expect(page).toContain('ROUTES.CIS_BENCHMARK');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
    expect(page).not.toContain('SiemPageHeader');
  });

  it('uses canonical /mitre APIs only and keeps export fail-closed', () => {
    expect(service).toContain('/mitre/coverage');
    expect(service).toContain('/mitre/rules');
    expect(service).toContain('/api/mitre/coverage/export');
    expect(page).toContain('mitreService.getCoverage');
    expect(page).toContain('mitreService.getRulesByTechnique');
    expect(page).toContain('mitreService.exportCoverage');
    expect(page).toContain('HiveArmor will not invent a coverage file');
    expect(page).toMatch(/not proof of full ATT&amp;CK coverage/);
    expect(page).not.toContain('/ha-cis');
    expect(page).not.toContain('/ha-vuln');
    expect(page).not.toMatch(/complete ATT&CK coverage|full enterprise ATT&CK/i);
  });

  it('uses matrix workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.rdn-matrix');
    expect(styles).toContain('.coverage-inventory');
    expect(styles).toContain('.rdn-inline-stats');
    expect(page).toContain('HaDrawer');
    expect(page).not.toMatch(/style=\{\{/);
  });
});
