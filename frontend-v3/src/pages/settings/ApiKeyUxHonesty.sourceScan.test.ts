import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_KEYS_JOB_SENTENCE } from './apiKeys.honesty';

describe('API Keys UX honesty (Prompt 39)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/settings/ApiKeyPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(join(process.cwd(), 'src/pages/settings/ApiKeyPage.css'), 'utf8');
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/settings/apiKeys.honesty.ts'),
    'utf8',
  );
  const service = readFileSync(join(process.cwd(), 'src/services/apiKeys.service.ts'), 'utf8');
  const capabilities = readFileSync(
    join(process.cwd(), 'src/services/apiKeys.capabilities.ts'),
    'utf8',
  );

  it('states API keys job sentence distinct from integrations, connectors, and enrollment', () => {
    expect(API_KEYS_JOB_SENTENCE).toMatch(/Service access keys/i);
    expect(API_KEYS_JOB_SENTENCE).toMatch(/Integrations/i);
    expect(API_KEYS_JOB_SENTENCE).toMatch(/Connectors/i);
    expect(API_KEYS_JOB_SENTENCE).toMatch(/Enrollment audit/i);
    expect(API_KEYS_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('API_KEYS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('api-keys-empty-honesty');
    expect(page).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(page).toContain('ROUTES.ADMIN_CONNECTORS');
    expect(page).toContain('ROUTES.ADMIN_NOTIFICATIONS');
    expect(page).toContain('ROUTES.ADMIN_PIPELINE_SIGNALS');
    expect(page).toContain('ROUTES.ADMIN_ENROLLMENT_AUDIT');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toMatch(/href="\/admin\/integrations/);
    expect(page).not.toMatch(/requires an administrator role/i);
  });

  it('uses canonical /ha-admin/api-keys APIs and honest projection note', () => {
    expect(service).toContain('/ha-admin/api-keys');
    expect(page).toContain('apk-page__projection-note');
    expect(honesty).toContain('AKM-001');
    expect(page).toContain('Plaintext tokens never render');
  });

  it('documents lifecycle fail-closed gates and access denial copy', () => {
    expect(capabilities).toContain('API_KEY_ROTATION_POLICY_LIVE = false');
    expect(capabilities).toContain('API_KEY_DELEGATION_LIVE = false');
    expect(capabilities).toContain('API_KEY_ISSUANCE_AUDIT_LIVE = false');
    expect(page).toContain('API_KEY_ROTATION_POLICY_LIVE');
    expect(page).toContain('API_KEY_ACCESS_DENIED_TITLE');
    expect(capabilities).toContain('Required permission: Platform Administrator');
  });

  it('uses API keys workspace with summary stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.apk-summary');
    expect(styles).toContain('.api-keys-empty-honesty');
    expect(styles).toContain('.apk-header__badge');
  });

  it('keeps StatusDock historical for key inventory snapshot', () => {
    expect(page).toMatch(/mode=["']historical["']/);
    expect(page).not.toMatch(/mode=\{.*fixtureMode.*'live'/);
  });
});
