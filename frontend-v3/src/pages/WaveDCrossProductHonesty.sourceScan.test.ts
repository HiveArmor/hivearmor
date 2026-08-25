import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_LABELS, formatAuthorityLabel } from '@/lib/roles';

describe('Wave D Cross-product closure honesty', () => {
  it('D-01: legacy routes redirect instead of mounting live alternate UI', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toContain("path: 'response/playbooks-legacy'");
    expect(router).toContain('Navigate to="/response/playbooks"');
    expect(router).toContain('Navigate to="/admin/tenants"');
    expect(router).toContain('Navigate to="/admin/audit"');
    expect(router).toContain('Navigate to="/admin/settings"');
    expect(router).not.toContain('<PlaybooksPage');
    expect(router).not.toContain('<AdminTenantsPage');
  });

  it('D-05: correlated findings has fixture-disabled vite alias', () => {
    const vite = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(vite).toContain('correlatedFindings.fixture-disabled.ts');
  });

  it('D-04: NodeConfigPanel drops ROLE_INCIDENT_COMMANDER', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/response/components/NodeConfigPanel.tsx'),
      'utf8',
    );
    expect(source).not.toContain('ROLE_INCIDENT_COMMANDER');
  });

  it('D-03/11: human role labels match program vocabulary', () => {
    expect(ROLE_LABELS.ROLE_ADMIN).toBe('Platform Administrator');
    expect(ROLE_LABELS.ROLE_USER).toBe('Standard User');
    expect(formatAuthorityLabel('ROLE_SOC_MANAGER')).toBe('SOC Manager');
    expect(formatAuthorityLabel('MSSP_ADMIN')).toBe('MSSP Administrator');
  });

  it('D-07: rules/:id redirects preserve id', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toContain('RulesEditRedirect');
    expect(router).toContain('RulesTestRedirect');
    expect(router).toContain('/detection-rules/${encodeURIComponent(id)}/edit');
  });

  it('D-08: glassmorphism backdrop-filter removed from incident/finding overlays', () => {
    const header = readFileSync(
      join(process.cwd(), 'src/pages/incidents/components/IncidentHeader.css'),
      'utf8',
    );
    const finding = readFileSync(
      join(process.cwd(), 'src/pages/correlated-findings/FindingPromotionDialog.css'),
      'utf8',
    );
    expect(header).not.toMatch(/backdrop-filter:\s*blur/);
    expect(finding).not.toMatch(/backdrop-filter:\s*blur/);
  });

  it('D-09: theme store consults prefers-color-scheme when unset', () => {
    const source = readFileSync(join(process.cwd(), 'src/store/theme.store.ts'), 'utf8');
    expect(source).toContain('prefers-color-scheme');
  });
});
