import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_FLEET_REPORT_JOB_SENTENCE } from './FleetPosturePage';

describe('Fleet Posture Report UX honesty (SPEC-PT-6)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/posture/fleet-report/FleetPosturePage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/posture/fleet-report/FleetPosturePage.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/services/postureReport.service.ts'),
    'utf8',
  );

  it('states a cross-fleet job sentence distinct from per-host and framework assurance', () => {
    expect(POSTURE_FLEET_REPORT_JOB_SENTENCE).toMatch(/fleet/i);
    expect(POSTURE_FLEET_REPORT_JOB_SENTENCE).toMatch(/drift|over time/i);
    expect(POSTURE_FLEET_REPORT_JOB_SENTENCE).toMatch(/per-host|endpoint/i);
    expect(POSTURE_FLEET_REPORT_JOB_SENTENCE).toMatch(/Compliance/);
    expect(page).toContain('POSTURE_FLEET_REPORT_JOB_SENTENCE');
  });

  it('calls the real PT-6 aggregate endpoints — no invented APIs', () => {
    expect(service).toContain('/ha-posture-report/overview');
    expect(service).toContain('/ha-posture-report/cis');
    expect(service).toContain('/ha-posture-report/trend');
    expect(service).toContain('/ha-posture-report/export/');
    // Does NOT rebuild the per-host surfaces nor invent a parallel store.
    expect(service).not.toMatch(/\/ha-cis-scan\/results\/agent/);
    expect(service).not.toMatch(/\/api\/ha-posture-fake|mock|stub/i);
  });

  it('renders honest not-covered / empty states, never a fabricated score', () => {
    // A null fleet score or scanned=false host is "not covered", not 100%.
    expect(page).toContain('fpr-cis-not-covered');
    expect(page).toContain('fpr-vuln-empty');
    expect(page).toContain('fpr-trend-empty');
    expect(page).toContain('fpr-hosts-empty');
    expect(page).toContain('Not covered');
    expect(page).toMatch(/not proof of/i);
    expect(page).toMatch(/will not invent/i);
    // Drift honesty: a single scan cannot establish a trend.
    expect(page).toMatch(/single scan cannot establish a trend/i);
  });

  it('uses router Link + ROUTES, never a bare posture href', () => {
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('uses Hive Carbon tokens only — no raw hex in the stylesheet', () => {
    // No 3- or 6-digit hex color literals (foundation tokens only).
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(styles).toContain('var(--ha-surface-app)');
    expect(styles).toContain('font-variant-numeric: tabular-nums');
  });

  it('resolves chart tokens at render time — never passes var() into ECharts', () => {
    expect(page).toContain('useHaThemeTokens');
    // ECharts option colors must come from resolved tokens, not literal var() strings.
    expect(page).not.toMatch(/itemStyle:\s*\{\s*color:\s*'var\(--ha/);
  });
});
