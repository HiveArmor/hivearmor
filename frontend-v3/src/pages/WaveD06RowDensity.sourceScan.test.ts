import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';

describe('Wave D-06 shared row density', () => {
  it('platform ROW_HEIGHTS match design tokens (32 / 40 / 48)', () => {
    expect(ROW_HEIGHTS).toEqual({ compact: 32, standard: 40, comfortable: 48 });
  });

  it('response grid heights alias the platform density contract', () => {
    expect(RESPONSE_GRID_ROW_HEIGHTS).toEqual(ROW_HEIGHTS);
  });

  it('high-volume hubs persist via useRowDensity / ha_row_density', () => {
    const pages = [
      'src/pages/incidents/IncidentListPage.tsx',
      'src/pages/detection-rules/DetectionRulesPage.tsx',
      'src/pages/entities/EntityListPage.tsx',
      'src/pages/response/ResponseActivityPage.tsx',
      'src/pages/response/ResponseAuthorityPage.tsx',
      'src/pages/posture/assets/AssetsPage.tsx',
      'src/pages/search-hunt/SearchHuntPage.tsx',
      'src/pages/edr/FileQuarantinePage.tsx',
      'src/pages/compliance/CompliancePage.tsx',
    ];
    for (const relative of pages) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      expect(source, relative).toContain('useRowDensity');
      expect(source, relative).not.toContain('ha_hunt_density');
    }
  });
});
