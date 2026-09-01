import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TENANT_DETAIL_JOB_SENTENCE } from './TenantDetailPage';

describe('MSSP tenant detail UX honesty (Prompt 48 / Wave C3 slice 4)', () => {
  const page = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantDetailPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantDetailPage.css'), 'utf8');
  const api = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspTenantApi.ts'), 'utf8');

  it('states tenant workspace job sentence distinct from inventory and membership', () => {
    expect(TENANT_DETAIL_JOB_SENTENCE).toMatch(/MSSP tenant workspace/i);
    expect(TENANT_DETAIL_JOB_SENTENCE).toMatch(/Tenants|Users|Identity & Tenancy/i);
    expect(TENANT_DETAIL_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('TENANT_DETAIL_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('tenant-detail-trust-banner');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.ADMIN_USERS');
    expect(page).toContain('/mssp/overview');
    expect(page).toContain('/mssp/tenants');
    expect(page).toContain('MSSP Administrator');
    expect(page).not.toMatch(/href="\/mssp\/tenants\/\$\{/);
  });

  it('uses canonical tenant detail API and separates auth errors from 404', () => {
    expect(api).toContain('/api/ha-mssp/tenants/${id}');
    expect(api).toContain('msspFetch');
    expect(page).toContain('mssp-tenant-detail-page__projection-note');
    expect(page).toContain('tenant-detail-error');
    expect(page).toContain('tenant-detail-notfound');
    expect(page).toContain('MSSP access restricted');
    expect(page).toContain('IAM-005');
    expect(page).not.toContain('is404 || (isError && !data)');
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
  });

  it('uses tenant workspace layout with trust banner and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.mssp-tenant-detail-workspace');
    expect(styles).toContain('.mssp-tenant-detail-trust');
  });
});
