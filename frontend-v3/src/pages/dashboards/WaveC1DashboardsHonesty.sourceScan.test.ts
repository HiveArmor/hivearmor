import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GAP_SEC_06_RESOLVED } from './dashboards.service';

describe('Wave C1 Dashboards & reports honesty', () => {
  it('keeps SEC-06 visualization run gate resolved', () => {
    expect(GAP_SEC_06_RESOLVED).toBe(true);
  });

  it('C1-AUTH-01/02: studio and report AuthGuards match nav roles', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toMatch(
      /path: 'dashboards\/studio'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'\]\}/,
    );
    expect(router).toMatch(
      /path: 'dashboards\/:id\/edit'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'\]\}/,
    );
    expect(router).toMatch(
      /path: 'reports\/scheduled'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'\]\}/,
    );
    expect(router).toMatch(
      /path: 'reports\/templates'[\s\S]*?allowedRoles=\{\['ROLE_SOC_MANAGER', 'ROLE_ADMIN'\]\}/,
    );
  });

  it('C1-API-01: dashboards.service uses relative apiClient, not absolute backend URL', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/dashboards/dashboards.service.ts'), 'utf8');
    expect(source).toContain("from '@/lib/apiClient'");
    expect(source).not.toContain('VITE_BACKEND_URL');
    expect(source).not.toContain('localhost:8088');
  });

  it('C1-FIX-01: vite aliases fixture-disabled for dashboard and reporting fixtures', () => {
    const vite = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(vite).toContain('dashboardOperations.fixture-disabled.ts');
    expect(vite).toContain('reportingOperations.fixture-disabled.ts');
  });

  it('C1-REP-01: schedule run helper documents stamp-only semantics', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/reports/reports.service.ts'), 'utf8');
    expect(source).toContain('REP-004');
    expect(source).toContain('lastExecutionTime');
  });

  it('C1-DSH-02: view page does not offer fictional tenant names', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/dashboards/DashboardViewPage.tsx'), 'utf8');
    expect(source).not.toContain('Northwind');
    expect(source).not.toContain('Contoso');
  });
});
