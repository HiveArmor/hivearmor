import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NEW_TENANT_JOB_SENTENCE } from './msspTenantCreate.honesty';

describe('MSSP tenant create UX honesty (Prompt 47 / Wave C3 slice 3)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/features/mssp/wizard/NewTenantWizard.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/features/mssp/wizard/msspTenantCreate.honesty.ts'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/features/mssp/wizard/NewTenantWizard.css'),
    'utf8',
  );
  const api = readFileSync(
    join(process.cwd(), 'src/features/mssp/api/msspTenantApi.ts'),
    'utf8',
  );
  const routes = readFileSync(
    join(process.cwd(), 'src/features/mssp/routes/msspRoutes.tsx'),
    'utf8',
  );

  it('states tenant create job sentence distinct from inventory and platform tenancy', () => {
    expect(NEW_TENANT_JOB_SENTENCE).toMatch(/MSSP tenant provisioning/i);
    expect(NEW_TENANT_JOB_SENTENCE).toMatch(/Tenants|Identity & Tenancy/i);
    expect(NEW_TENANT_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('NEW_TENANT_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('new-tenant-create-trust-banner');
    expect(page).toContain('new-tenant-provision-fail-closed-banner');
    expect(page).toContain('MSSP_ROUTES.OVERVIEW');
    expect(page).toContain('MSSP_ROUTES.TENANTS');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.ADMIN_USERS');
    expect(page).toContain('MSSP Administrator');
    expect(page).not.toMatch(/href="\/mssp\/tenants"/);
    expect(page).toContain('data-mssp-tenant-create-honesty');
  });

  it('uses canonical create API and avoids fake provisioning success', () => {
    expect(api).toContain('POST');
    expect(api).toContain('/api/ha-mssp/tenants');
    expect(api).toContain('msspFetch');
    expect(page).toContain('navigate(`/mssp/tenants/${created.id}`)');
    expect(page).not.toContain('locationHeader');
    expect(page).not.toContain('addToast');
    expect(page).not.toContain('Provision tenant');
    expect(page).toContain('Submit provisioning request');
    expect(page).toContain('Provisioning request failed');
    expect(honesty).toContain('NEW_TENANT_PROVISION_FAIL_CLOSED_TITLE');
    expect(honesty).toContain('IAM-005');
    expect(honesty).toContain('MSSP_TENANT_LIFECYCLE_GOVERNANCE_LIVE = false');
  });

  it('maps 401/403 separately and documents lifecycle fail-closed gate', () => {
    expect(page).toContain('MSSP access restricted');
    expect(page).toContain('data-tenant-lifecycle-governance');
    expect(page).toContain("fail-closed");
  });

  it('routes tenants/new through NewTenantWizard with min-height workspace', () => {
    expect(routes).toContain("path: \"tenants/new\"");
    expect(routes).toContain('<NewTenantWizard />');
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.mssp-tenant-new-workspace');
    expect(styles).toContain('.mssp-tenant-new-provision-note');
  });
});
