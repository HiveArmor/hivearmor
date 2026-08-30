import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_IDENTITIES_JOB_SENTENCE } from './IdentitiesPage';

describe('Posture identities UX honesty (Prompt 24)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/identities/IdentitiesPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/identities/IdentitiesPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/posture/identities/identity.service.ts'), 'utf8');

  it('states inventory-first job sentence distinct from entities and assets', () => {
    expect(POSTURE_IDENTITIES_JOB_SENTENCE).toMatch(/Identity posture inventory/i);
    expect(POSTURE_IDENTITIES_JOB_SENTENCE).toMatch(/risk scores|privilege signals|control gaps/i);
    expect(POSTURE_IDENTITIES_JOB_SENTENCE).toMatch(/Entities|Assets/i);
    expect(POSTURE_IDENTITIES_JOB_SENTENCE).not.toMatch(/Entity inventory/i);
    expect(page).toContain('POSTURE_IDENTITIES_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('identities-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.ACTIVE_DIRECTORY');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('uses canonical /ha-entities API only — no dead risk path', () => {
    expect(service).toContain('/ha-entities');
    expect(service).not.toContain('fetchIdentityRiskDetail');
    expect(service).not.toContain('/ha-entities/${id}/risk');
    expect(page).toContain('idp-page__projection-note');
    expect(page).not.toContain('idp-summary');
  });

  it('uses inventory workspace with compact inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.idp-inventory');
    expect(styles).toContain('.idp-inline-stats');
    expect(styles).not.toContain('.idp-summary');
  });

  it('drawer pivots use Link + ROUTES for dossier, hunt, and intelligence', () => {
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('ROUTES.INTELLIGENCE');
  });

  it('keeps partial contract honest — null summary fields not fabricated', () => {
    expect(service).toContain('privileged: null');
    expect(service).toContain('nonHuman: null');
    expect(service).toContain('controlGaps: null');
    expect(service).toContain('stale: null');
    expect(service).toContain("contractState: 'partial'");
  });
});
