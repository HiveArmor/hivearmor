import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_VULNERABILITIES_JOB_SENTENCE } from './VulnerabilitiesPage';
import { VULN_REMEDIATION_EXECUTE_AVAILABLE } from '../posture.capabilities';

describe('Posture Vulnerabilities UX honesty (Prompt 27)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/vulnerabilities/VulnerabilitiesPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/vulnerabilities/VulnerabilitiesPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/vulnService.ts'), 'utf8');

  it('states vulnerability findings job sentence distinct from assets and exposure', () => {
    expect(POSTURE_VULNERABILITIES_JOB_SENTENCE).toMatch(/Vulnerability findings inventory/i);
    expect(POSTURE_VULNERABILITIES_JOB_SENTENCE).toMatch(/CVE|CISA KEV|affected assets/i);
    expect(POSTURE_VULNERABILITIES_JOB_SENTENCE).toMatch(/Assets|Exposure/i);
    expect(page).toContain('POSTURE_VULNERABILITIES_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('vulnerabilities-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('ROUTES.IDENTITIES');
    expect(page).toContain('ROUTES.CIS_BENCHMARK');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('uses canonical /ha-vuln APIs and keeps execute fail-closed', () => {
    expect(VULN_REMEDIATION_EXECUTE_AVAILABLE).toBe(false);
    expect(service).toContain('/ha-vuln/findings');
    expect(service).toContain('/ha-vuln/findings/summary');
    expect(service).toContain('/ha-vuln/remediation-connectors');
    expect(service).not.toMatch(/\/api\/v1\/threat-intel/);
    expect(page).toContain('vuln-page__projection-note');
    expect(page).toContain("data-remediation-execute={VULN_REMEDIATION_EXECUTE_AVAILABLE ? 'open' : 'fail-closed'}");
    expect(page).not.toContain('vuln-summary');
    expect(page).not.toContain('Execute');
  });

  it('uses inventory workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.vuln-inventory');
    expect(styles).toContain('.vuln-inline-stats');
    expect(styles).not.toContain('.vuln-summary');
  });

  it('drawer pivots use Link + ROUTES for hunt and assets', () => {
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('ROUTES.ASSETS');
  });
});
