import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';

describe('Wave D-07 density + theme consistency', () => {
  it('platform ROW_HEIGHTS match design tokens (32 / 40 / 48)', () => {
    expect(ROW_HEIGHTS).toEqual({ compact: 32, standard: 40, comfortable: 48 });
  });

  it('response grid heights alias the platform density contract', () => {
    expect(RESPONSE_GRID_ROW_HEIGHTS).toEqual(ROW_HEIGHTS);
  });

  it('SiemDataGrid follows theme store instead of hardcoded dark-only AG theme', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/siem-data-grid/SiemDataGrid.tsx'),
      'utf8',
    );
    expect(source).toContain('useThemeStore');
    expect(source).toContain('ag-theme-quartz');
    expect(source).toContain('ag-theme-quartz-dark');
    expect(source).not.toMatch(/className=\{`ag-theme-quartz-dark ha-grid/);
  });

  it('AG Grid overrides use theme-agnostic .ha-grid selectors', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/ag-grid-ha.css'), 'utf8');
    expect(css).not.toContain('ag-theme-quartz-dark.ha-grid');
    expect(css).toContain('.ha-grid {');
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
      'src/features/mssp/pages/TenantUsersPage.tsx',
      'src/features/mssp/pages/TenantsListPage.tsx',
      'src/features/mssp/pages/MsspOverviewPage.tsx',
      'src/pages/admin/audit/AuditPage.tsx',
      'src/pages/ueba/risk/UserRiskTable.tsx',
      'src/pages/command-center/components/RecentIncidentsTable.tsx',
      'src/pages/dashboards/studio/renderers/AlertTableRenderer.tsx',
    ];
    for (const relative of pages) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      expect(source, relative).toContain('useRowDensity');
      expect(source, relative).not.toContain('ha_hunt_density');
    }
  });

  it('theme store consults prefers-color-scheme when unset', () => {
    const source = readFileSync(join(process.cwd(), 'src/store/theme.store.ts'), 'utf8');
    expect(source).toContain('prefers-color-scheme');
  });
});
