import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CIS_MUTATION_AVAILABLE,
  VULN_REMEDIATION_EXECUTE_AVAILABLE,
} from './posture.capabilities';

describe('Wave B2 Posture & compliance honesty', () => {
  it('keeps vuln/CIS mutation CTAs fail-closed', () => {
    expect(VULN_REMEDIATION_EXECUTE_AVAILABLE).toBe(false);
    expect(CIS_MUTATION_AVAILABLE).toBe(false);
  });

  it('B2-AST-01 / B2-ID-01 / B2-EXP-01 / B2-CMP-01: posture nav roles are gated', () => {
    const nav = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    expect(nav).toContain("route: '/posture/assets', roles: ['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(nav).toContain("route: '/posture/identities', roles: ['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(nav).toContain("route: '/posture/exposure', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(nav).toContain("route: '/compliance', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
  });

  it('B2-ID-02: dead identity risk helper is gone', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/posture/posture.service.ts'), 'utf8');
    expect(source).not.toContain('fetchIdentityRiskDetail');
    expect(source).not.toContain('/ha-entities/${id}/risk');
    expect(source).not.toContain('fetchIdentities');
  });

  it('B2-COV-01: MitreCoverageResource has method-level PreAuthorize', () => {
    const source = readFileSync(
      join(process.cwd(), '../backend/src/main/java/com/hivearmor/web/rest/MitreCoverageResource.java'),
      'utf8',
    );
    expect(source).toContain('@PreAuthorize(MITRE_READ_AUTH)');
    expect(source).toContain("ROLE_ANALYST");
  });

  it('B2-AD-01: AD compatibility empties are removed', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/active-directory.service.ts'), 'utf8');
    expect(source).not.toContain('getAdReportSummary');
    expect(source).not.toContain('getAdDomainSummary');
  });

  it('B2-AST-02 (Prompt 23): assets page uses honesty chrome and canonical /ha-assets only', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/posture/assets/AssetsPage.tsx'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'src/pages/posture/posture.service.ts'), 'utf8');
    expect(page).toContain('POSTURE_ASSETS_JOB_SENTENCE');
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('assets-empty-honesty');
    expect(page).toContain('ROUTES.SENSORS');
    expect(page).toContain('ROUTES.ENTITIES');
    expect(page).not.toContain('ast-summary');
    expect(page).not.toMatch(/href="\/posture\//);
    expect(service).toContain('/ha-assets');
    expect(service).not.toContain('/ha-clients');
    expect(service).not.toContain('/ha-network-scans');
  });
});
