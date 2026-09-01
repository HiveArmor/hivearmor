import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TENANT_USERS_JOB_SENTENCE } from './TenantUsersPage';

describe('MSSP tenant users UX honesty (Prompt 49 / Wave C3 slice 5)', () => {
  const page = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantUsersPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantUsersPage.css'), 'utf8');
  const api = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspMembershipApi.ts'), 'utf8');

  it('states tenant membership job sentence distinct from inventory and workspace', () => {
    expect(TENANT_USERS_JOB_SENTENCE).toMatch(/MSSP tenant membership/i);
    expect(TENANT_USERS_JOB_SENTENCE).toMatch(/Tenants|Identity & Tenancy/i);
    expect(TENANT_USERS_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('TENANT_USERS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('tenant-users-empty-honesty');
    expect(page).toContain('tenant-users-trust-banner');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.ADMIN_USERS');
    expect(page).toContain('/mssp/overview');
    expect(page).toContain('/mssp/tenants');
    expect(page).toContain('MSSP Administrator');
    expect(page).toContain('Tenant Admin');
    expect(page).toContain('Tenant Analyst');
    expect(page).toContain('Tenant Viewer');
    expect(page).not.toMatch(/href="\/mssp\/tenants\/\$\{/);
  });

  it('uses canonical membership API and separates auth errors from 404', () => {
    expect(api).toContain('/api/ha-mssp/tenants/${tenantId}/users');
    expect(api).toContain('msspFetch');
    expect(page).toContain('mssp-tenant-users-page__projection-note');
    expect(page).toContain('tenant-users-error');
    expect(page).toContain('tenant-users-notfound');
    expect(page).toContain('MSSP access restricted');
    expect(page).toContain('IAM-005');
    expect(page).not.toContain('is404 || (isError && !data)');
    expect(page).not.toContain('Northwind');
    expect(page).not.toContain('Contoso');
  });

  it('uses tenant membership workspace with trust banner and min-height 50vh', () => {
    expect(styles).toMatch(/min-height:\s*50vh/);
    expect(styles).toContain('.mssp-tenant-users-workspace');
    expect(styles).toContain('.mssp-tenant-users-trust');
    expect(styles).toContain('.mssp-tenant-users-empty-honesty');
  });
});
