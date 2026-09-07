import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('ueba.service fixture fallback', () => {
  const service = readFileSync(join(process.cwd(), 'src/services/ueba.service.ts'), 'utf8');

  it('gates fixtures to DEV + VITE_USE_FOUNDATION_FIXTURES', () => {
    expect(service).toContain("import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true'");
    expect(service).toContain('uebaFixtureMode');
  });

  it('calls only ha-ueba live paths and never legacy /api/uba', () => {
    expect(service).toContain('/ha-ueba/deviations');
    expect(service).toContain('/ha-ueba/risk-scores');
    expect(service).toContain('/ha-ueba/entity-timeline');
    expect(service).toContain('/ha-ueba/peer-groups');
    expect(service).toContain('/ha-ueba/risk-trend');
    expect(service).toContain('/ha-ueba/anomaly-counts');
    expect(service).not.toContain('/uba/');
    expect(service).not.toContain('/api/uba');
  });
});
