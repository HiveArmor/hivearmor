import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_ASSETS_JOB_SENTENCE } from './AssetsPage';

describe('Posture assets UX honesty (Prompt 23)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/assets/AssetsPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/assets/AssetsPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/posture/posture.service.ts'), 'utf8');

  it('states inventory-first job sentence distinct from entities and sensors', () => {
    expect(POSTURE_ASSETS_JOB_SENTENCE).toMatch(/Posture asset inventory/i);
    expect(POSTURE_ASSETS_JOB_SENTENCE).toMatch(/risk scores|exposure|sensor coverage/i);
    expect(POSTURE_ASSETS_JOB_SENTENCE).toMatch(/Entities|Sensors/i);
    expect(POSTURE_ASSETS_JOB_SENTENCE).not.toMatch(/Entity inventory/i);
    expect(page).toContain('POSTURE_ASSETS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('assets-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.SENSORS');
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.IDENTITIES');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('uses canonical /ha-assets API only — no legacy paths', () => {
    expect(service).toContain('/ha-assets');
    expect(service).not.toContain('/ha-clients');
    expect(service).not.toContain('/ha-network-scans');
    expect(page).toContain('ast-page__projection-note');
    expect(page).not.toContain('ast-summary');
  });

  it('uses inventory workspace with compact inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.ast-inventory');
    expect(styles).toContain('.ast-inline-stats');
    expect(styles).not.toContain('.ast-summary');
  });

  it('drawer pivots use Link + ROUTES for vulnerabilities and exposure', () => {
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).toContain('ROUTES.SEARCH');
  });
});
