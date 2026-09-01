import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_RETENTION_JOB_SENTENCE } from './adminRetention.honesty';

describe('Admin retention UX honesty (Wave C2 leftovers)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/retention/AdminRetentionPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/retention/adminRetention.honesty.ts'),
    'utf8',
  );
  const governance = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/governanceOperations.service.ts'),
    'utf8',
  );
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('states retention job sentence distinct from audit ledger and platform settings', () => {
    expect(ADMIN_RETENTION_JOB_SENTENCE).toMatch(/Data retention governance/i);
    expect(ADMIN_RETENTION_JOB_SENTENCE).toMatch(/Audit/i);
    expect(ADMIN_RETENTION_JOB_SENTENCE).toMatch(/Platform Settings/i);
    expect(ADMIN_RETENTION_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain('ADMIN_RETENTION_JOB_SENTENCE');
    expect(page).toContain('honestyChrome');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(governance).toContain('STAGING CANDIDATE');
    expect(governance).toContain('gov-retention-empty-honesty');
    expect(governance).toContain('ROUTES.ADMIN_USERS');
    expect(governance).toContain('ROUTES.ADMIN_SETTINGS');
    expect(governance).toContain('ROUTES.ADMIN_ENROLLMENT_AUDIT');
    expect(governance).toContain('Platform Administrator');
    expect(governance).not.toMatch(/href="\/admin\/retention/);
    expect(router).toContain('AdminRetentionPage');
  });

  it('uses ha-retention-policies API and honest fail-closed gates', () => {
    expect(service).toContain('/ha-retention-policies');
    expect(honesty).toContain('GOV-005');
    expect(governance).toContain('governance-propose-fail-closed-banner');
    expect(governance).toContain('gov-page__projection-note');
  });

  it('documents empty retention inventory honesty and keeps StatusDock historical', () => {
    expect(styles).toContain('.gov-retention-empty-honesty');
    expect(governance).toContain('data-governance-audit-honesty');
    expect(governance).toMatch(/mode=["']historical["']/);
  });
});
