import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_SETTINGS_JOB_SENTENCE } from './adminSettings.honesty';

describe('Admin Settings UX honesty (Prompt 43)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/settings/AdminSettingsPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/settings/adminSettings.honesty.ts'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/settings/AdminSettingsPage.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/governanceOperations.service.ts'),
    'utf8',
  );
  const governance = readFileSync(
    join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.tsx'),
    'utf8',
  );
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('states platform settings job sentence distinct from audit ledger and integrations ops', () => {
    expect(ADMIN_SETTINGS_JOB_SENTENCE).toMatch(/Platform Settings/i);
    expect(ADMIN_SETTINGS_JOB_SENTENCE).toMatch(/Audit|Retention/i);
    expect(ADMIN_SETTINGS_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(ADMIN_SETTINGS_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('ADMIN_SETTINGS_JOB_SENTENCE');
    expect(page).toContain('GovernanceOperationsPage');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('admin-settings-empty-honesty');
    expect(page).toContain('ROUTES.ADMIN_AUDIT');
    expect(page).toContain('ROUTES.SETTINGS_API_KEYS');
    expect(page).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toMatch(/href="\/admin\/audit/);
    expect(page).not.toMatch(/requires an administrator role/i);
  });

  it('uses ha-admin/settings API and honest projection note', () => {
    expect(service).toContain('/ha-admin/settings');
    expect(page).toContain('adm-settings-page__projection-note');
    expect(honesty).toContain('GOV-007');
    expect(honesty).toContain('GOV-008');
    expect(honesty).toContain('GOV_SETTINGS_CHANGE_CONTROL_LIVE = false');
  });

  it('documents propose fail-closed gates and hides duplicate governance header', () => {
    expect(honesty).toContain('ADMIN_SETTINGS_PROPOSE_FAIL_CLOSED_TITLE');
    expect(page).toContain('admin-settings-propose-fail-closed-banner');
    expect(styles).toContain('.adm-settings-page__body .gov-header{display:none}');
    expect(page).toContain('data-admin-settings-honesty');
  });

  it('routes admin/settings through AdminSettingsPage with configuration view', () => {
    expect(router).toMatch(
      /path: 'admin\/settings'[\s\S]*?AdminSettingsPage/,
    );
    expect(page).toContain('initialView="configuration"');
  });

  it('keeps audit payload omitted in governance drawer (C2-10 alignment)', () => {
    expect(governance).not.toContain('JSON.stringify(value.payload');
    expect(governance).toContain('Omitted from UI');
  });

  it('keeps StatusDock historical via embedded governance workspace', () => {
    expect(governance).toMatch(/mode=["']historical["']/);
  });
});
