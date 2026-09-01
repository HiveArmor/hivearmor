import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TENANTS_LIST_JOB_SENTENCE } from './TenantsListPage';

describe('MSSP tenants list UX honesty (Prompt 46 / Wave C3 slice 2)', () => {
  const page = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantsListPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantsListPage.css'), 'utf8');
  const api = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspTenantApi.ts'), 'utf8');

  it('states tenant inventory job sentence distinct from overview and platform tenants', () => {
    expect(TENANTS_LIST_JOB_SENTENCE).toMatch(/MSSP tenant inventory/i);
    expect(TENANTS_LIST_JOB_SENTENCE).toMatch(/Overview|Identity & Tenancy/i);
    expect(TENANTS_LIST_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('TENANTS_LIST_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('tenants-list-empty-honesty');
    expect(page).toContain('tenants-list-trust-banner');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.ADMIN_USERS');
    expect(page).toContain('/mssp/overview');
    expect(page).toContain('/mssp/tenants/new');
    expect(page).toContain('MSSP Administrator');
    expect(page).not.toMatch(/href="\/mssp\/tenants"/);
  });

  it('uses canonical tenant inventory and separates auth errors from generic failures', () => {
    expect(api).toContain('/api/ha-mssp/tenants');
    expect(api).toContain('X-Total-Count');
    expect(api).toContain('msspFetch');
    expect(page).toContain('mssp-tenants-page__projection-note');
    expect(page).toContain('MSSP access restricted');
    expect(page).toContain('IAM-005');
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
  });

  it('uses tenant inventory workspace with empty honesty and min-height 50vh', () => {
    expect(styles).toMatch(/min-height:\s*50vh/);
    expect(styles).toContain('.mssp-tenants-inventory');
    expect(styles).toContain('.mssp-tenants-empty-honesty');
  });
});
