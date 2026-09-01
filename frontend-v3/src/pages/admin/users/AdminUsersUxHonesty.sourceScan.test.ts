import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_USERS_JOB_SENTENCE } from './AdminUsersPage';

describe('Admin Users UX honesty (Prompt 36 / Wave C2 slice 1)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/admin/users/AdminUsersPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/admin/users/AdminUsersPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/admin/users/adminUsers.service.ts'), 'utf8');
  const drawer = readFileSync(
    join(process.cwd(), 'src/pages/admin/users/components/UserDrawer.tsx'),
    'utf8',
  );
  const roleBadge = readFileSync(
    join(process.cwd(), 'src/pages/admin/users/components/RoleBadge.tsx'),
    'utf8',
  );

  it('states identity job sentence distinct from posture identities and governance audit', () => {
    expect(ADMIN_USERS_JOB_SENTENCE).toMatch(/Identity & Tenancy/i);
    expect(ADMIN_USERS_JOB_SENTENCE).toMatch(/Identities|Audit|Tenants/i);
    expect(ADMIN_USERS_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('ADMIN_USERS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('admin-users-empty-honesty');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.IDENTITIES');
    expect(page).toContain('ROUTES.ADMIN_AUDIT');
    expect(page).toContain('ROUTES.ADMIN_ENROLLMENT_AUDIT');
    expect(page).toContain('ROUTES.ADMIN_SETTINGS');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toMatch(/href="\/admin\/users/);
    expect(page).toContain('adm-users-page__projection-note');
  });

  it('hides duplicate identity header and keeps workspace body embedded', () => {
    expect(styles).toContain('.adm-users-page__body .iam-header{display:none}');
    expect(page).toContain('IdentityAdministrationPage');
  });

  it('uses apiClient for user mutations and human authority labels in drawer', () => {
    expect(service).toContain("from '@/lib/apiClient'");
    expect(service).not.toContain('VITE_BACKEND_URL');
    expect(service).not.toContain('localhost:8088');
    expect(drawer).toContain('formatAuthorityLabel');
    expect(roleBadge).toContain('formatAuthorityLabel');
  });
});
