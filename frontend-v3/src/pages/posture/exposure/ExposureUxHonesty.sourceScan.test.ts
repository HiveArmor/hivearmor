import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_EXPOSURE_JOB_SENTENCE } from './ExposurePage';

describe('Posture Exposure UX honesty (Prompt 26)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/exposure/ExposurePage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/exposure/ExposurePage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/exposure.service.ts'), 'utf8');

  it('states exposure attack-path job sentence distinct from assets and vulnerabilities', () => {
    expect(POSTURE_EXPOSURE_JOB_SENTENCE).toMatch(/Exposure analysis/i);
    expect(POSTURE_EXPOSURE_JOB_SENTENCE).toMatch(/attack paths|choke points|critical assets/i);
    expect(POSTURE_EXPOSURE_JOB_SENTENCE).toMatch(/Assets|Vulnerabilities/i);
    expect(page).toContain('POSTURE_EXPOSURE_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('exposure-contract-missing-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.IDENTITIES');
    expect(page).toContain('ROUTES.ACTIVE_DIRECTORY');
    expect(page).toContain('ROUTES.CONSTELLATION');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('preserves missing-contract honesty — no fake KPI tiles or invented APIs', () => {
    expect(service).toContain("contractState: 'missing'");
    expect(service).not.toMatch(/\/api\/ha-exposure/);
    expect(page).toContain('exp-page__projection-note');
    expect(page).not.toContain('exp-summary');
    expect(styles).not.toContain('.exp-summary');
  });

  it('uses inventory workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.exp-inventory');
    expect(styles).toContain('.exp-inline-stats');
  });

  it('drawer pivots use Link + ROUTES for hunt, constellation, and response', () => {
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('ROUTES.CONSTELLATION');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
  });
});
