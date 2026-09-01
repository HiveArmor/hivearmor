import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Wave C3 MSSP honesty', () => {
  it('C3-01: MSSP routes nest under AppLayout AuthGuard (not top-level)', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).not.toMatch(/^\s*msspRoutes,/m);
    expect(router).toContain("path: 'mssp'");
    expect(router).toContain('<MsspPortalOutlet />');
    expect(router).toContain('<AuthGuard>');
  });

  it('C3-02: MSSP APIs use msspFetch Bearer helper', () => {
    const tenant = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspTenantApi.ts'), 'utf8');
    const overview = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspOverviewApi.ts'), 'utf8');
    const membership = readFileSync(join(process.cwd(), 'src/features/mssp/api/msspMembershipApi.ts'), 'utf8');
    expect(tenant).toContain('msspFetch');
    expect(overview).toContain('msspFetch');
    expect(membership).toContain('msspFetch');
    expect(tenant).not.toContain('credentials: "include"');
    expect(overview).not.toContain('credentials: "include"');
  });

  it('C3-03: post-create navigates to UI tenant path only', () => {
    const wizard = readFileSync(join(process.cwd(), 'src/features/mssp/wizard/NewTenantWizard.tsx'), 'utf8');
    expect(wizard).toContain('navigate(`/mssp/tenants/${created.id}`)');
    expect(wizard).not.toContain('locationHeader');
  });

  it('C3-05: tenant detail maps 401/403 separately from 404', () => {
    const page = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantDetailPage.tsx'), 'utf8');
    expect(page).toContain('tenant-detail-error');
    expect(page).toContain('MSSP access restricted');
    expect(page).not.toContain('is404 || (isError && !data)');
  });

  it('C3-05b: tenant users maps 401/403 separately from 404', () => {
    const page = readFileSync(join(process.cwd(), 'src/features/mssp/pages/TenantUsersPage.tsx'), 'utf8');
    expect(page).toContain('tenant-users-error');
    expect(page).toContain('tenant-users-notfound');
    expect(page).toContain('MSSP access restricted');
    expect(page).not.toContain('is404 || (isError && !data)');
  });

  it('C3-06: AccessDenied uses MSSP Administrator human label', () => {
    const guard = readFileSync(join(process.cwd(), 'src/features/mssp/guards/MsspAdminGuard.tsx'), 'utf8');
    expect(guard).toContain('requiredPermission="MSSP Administrator"');
  });

  it('C3-07: masthead does not hardcode Production', () => {
    const masthead = readFileSync(join(process.cwd(), 'src/components/ha-masthead/HaMasthead.tsx'), 'utf8');
    expect(masthead).not.toContain('>Production<');
    expect(masthead).toContain('environmentLabel');
    expect(masthead).toContain('useMastheadTenants');
    expect(masthead).not.toContain('local-dev placeholder');
    expect(masthead).not.toContain('KNOWN_TENANTS');
  });
});
