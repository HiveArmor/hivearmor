import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTURE_CIS_BENCHMARK_JOB_SENTENCE } from './CisBenchmarkPage';
import { CIS_MUTATION_AVAILABLE } from '../posture.capabilities';

describe('Posture CIS Benchmark UX honesty (Prompt 28)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/posture/cis-benchmark/CisBenchmarkPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/posture/cis-benchmark/CisBenchmarkPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/vulnService.ts'), 'utf8');

  it('states CIS SCA job sentence distinct from CVE findings and compliance', () => {
    expect(POSTURE_CIS_BENCHMARK_JOB_SENTENCE).toMatch(/CIS benchmark posture/i);
    expect(POSTURE_CIS_BENCHMARK_JOB_SENTENCE).toMatch(/SCA|pass\/fail\/error|observed packs/i);
    expect(POSTURE_CIS_BENCHMARK_JOB_SENTENCE).toMatch(/Vulnerabilities|Compliance/i);
    expect(page).toContain('POSTURE_CIS_BENCHMARK_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('cis-empty-honesty');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('ROUTES.ASSETS');
    expect(page).toContain('ROUTES.VULNERABILITIES');
    expect(page).toContain('ROUTES.COMPLIANCE');
    expect(page).toContain('ROUTES.READINESS');
    expect(page).toContain('ROUTES.EXPOSURE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/posture\//);
  });

  it('uses canonical /ha-cis APIs and keeps mutations fail-closed', () => {
    expect(CIS_MUTATION_AVAILABLE).toBe(false);
    expect(service).toContain('/ha-cis/results');
    expect(service).toContain('/ha-cis/results/summary');
    expect(service).toContain('/ha-cis/catalog');
    expect(page).toContain('cis-page__projection-note');
    expect(page).toContain("data-cis-mutation={CIS_MUTATION_AVAILABLE ? 'open' : 'fail-closed'}");
    expect(page).not.toContain('className="cis-summary"');
    expect(page).not.toContain('/ha-vuln/findings');
    expect(page).not.toMatch(/previewAction|Execute/);
  });

  it('uses inventory workspace with inline stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.cis-inventory');
    expect(styles).toContain('.cis-inline-stats');
    expect(styles).not.toMatch(/^\.cis-summary\b/m);
    expect(styles).not.toContain('.cis-summary {');
  });

  it('drawer pivots use Link + ROUTES for assets and hunt', () => {
    expect(page).toContain('ROUTES.SEARCH');
    expect(page).toContain('ROUTES.ASSETS');
  });
});
