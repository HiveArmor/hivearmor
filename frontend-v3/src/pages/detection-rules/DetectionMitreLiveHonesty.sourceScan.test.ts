import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('DET-COV-002 live MITRE coverage honesty', () => {
  const coverage = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionCoverageView.tsx'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/mitre.service.ts'), 'utf8');

  it('uses live GET /api/mitre/coverage and GET /api/mitre/rules when fixtures are off', () => {
    expect(service).toContain('/mitre/coverage');
    expect(service).toContain('/mitre/rules');
    expect(coverage).toContain("queryKey: ['mitreCoverage']");
    expect(coverage).toContain('queryFn: mitreService.getCoverage');
    expect(coverage).toContain('enabled: !detectionRulesFixtureMode');
    expect(coverage).toContain('queryFn: () => mitreService.getRulesByTechnique(cell.techniqueId)');
    expect(coverage).toContain('enabled: !fixtureMode');
    expect(coverage).toContain('return buildMitreHeatmap(coverageQuery.data ?? []);');
    expect(coverage).not.toContain('fetchCoverage');
    expect(coverage).not.toContain('/ha-detection-rules/coverage');
  });

  it('shows the unused-API banner only in fixture mode and keeps empty live rows empty', () => {
    expect(coverage).toMatch(
      /detectionRulesFixtureMode &&\s*\(\s*<div className="detection-contract-warning"[^>]*data-testid="detection-mitre-api-unused"/,
    );
    expect(coverage).toContain('Live GET /api/mitre/coverage and GET /api/mitre/rules are unused.');
    expect(coverage).toContain('data-testid="detection-mitre-empty-honesty"');
    expect(coverage).toContain('HiveArmor will not invent a rule list');
  });
});
