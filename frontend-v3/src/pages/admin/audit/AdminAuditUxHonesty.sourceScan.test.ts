import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_AUDIT_JOB_SENTENCE } from './adminAudit.honesty';

describe('Admin Audit UX honesty (Prompt 42)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/admin/audit/AdminAuditPage.tsx'), 'utf8');
  const honesty = readFileSync(join(process.cwd(), 'src/pages/admin/audit/adminAudit.honesty.ts'), 'utf8');
  const governance = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.css'),
    'utf8',
  );
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
  const service = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/governanceOperations.service.ts'),
    'utf8',
  );

  it('states governance audit job sentence distinct from identity and enrollment audit', () => {
    expect(ADMIN_AUDIT_JOB_SENTENCE).toMatch(/Governance audit/i);
    expect(ADMIN_AUDIT_JOB_SENTENCE).toMatch(/Identity|Enrollment|Retention|Settings/i);
    expect(ADMIN_AUDIT_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('ADMIN_AUDIT_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(governance).toContain('STAGING CANDIDATE');
    expect(governance).toContain('gov-audit-empty-honesty');
    expect(governance).toContain('ROUTES.ADMIN_USERS');
    expect(governance).toContain('ROUTES.ADMIN_SETTINGS');
    expect(governance).toContain('ROUTES.ADMIN_ENROLLMENT_AUDIT');
    expect(governance).toContain('Platform Administrator');
    expect(governance).not.toMatch(/href="\/admin\/audit/);
    expect(governance).toContain('gov-page__projection-note');
    expect(router).toContain('AdminAuditPage');
  });

  it('uses ha-audit-log API and honest fail-closed gates', () => {
    expect(service).toContain('/ha-audit-log');
    expect(honesty).toContain('GOV-003');
    expect(honesty).toContain('GOV-005');
    expect(governance).toContain('governance-propose-fail-closed-banner');
    expect(governance).toContain('Omitted from UI');
  });

  it('documents empty ledger honesty and keeps StatusDock historical', () => {
    expect(styles).toContain('.gov-audit-empty-honesty');
    expect(governance).toContain('data-governance-audit-honesty');
    expect(governance).toMatch(/mode=["']historical["']/);
  });
});
