import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_ACTIVE_DIRECTORY_JOB_SENTENCE } from './ActiveDirectoryPage';

describe('Posture Active Directory UX honesty (Prompt 25)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/active-directory/ActiveDirectoryPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/active-directory/ActiveDirectoryPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/active-directory.service.ts'), 'utf8');

  it('states AD domain posture job sentence distinct from identities and assets', () => {
    expect(POSTURE_ACTIVE_DIRECTORY_JOB_SENTENCE).toMatch(/Active Directory posture/i);
    expect(POSTURE_ACTIVE_DIRECTORY_JOB_SENTENCE).toMatch(/domain assessments|trust relationships|privileged changes/i);
    expect(POSTURE_ACTIVE_DIRECTORY_JOB_SENTENCE).toMatch(/Identities|Assets/i);
    expect(page).toContain('POSTURE_ACTIVE_DIRECTORY_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('ad-contract-missing-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.IDENTITIES');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('preserves missing-contract honesty — no fake KPI tiles or legacy empties', () => {
    expect(service).toContain("contractState: 'missing'");
    expect(service).not.toContain('getAdReportSummary');
    expect(service).not.toContain('getAdDomainSummary');
    expect(page).toContain('adp-page__projection-note');
    expect(page).not.toContain('adp-summary');
    expect(styles).not.toContain('.adp-summary');
  });

  it('uses inventory workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.adp-inventory');
    expect(styles).toContain('.adp-inline-stats');
  });

  it('drawer pivots use Link + ROUTES for hunt, response, and exposure', () => {
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('ROUTES.EXPOSURE');
  });
});
