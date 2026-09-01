import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INTEGRATIONS_JOB_SENTENCE } from './adminIntegrations.honesty';

describe('Admin integrations UX honesty (Prompt 37)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/integrations/AdminIntegrationsPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/integrations/adminIntegrations.honesty.ts'),
    'utf8',
  );
  const operations = readFileSync(
    join(process.cwd(), 'src/pages/admin/integration-operations/IntegrationOperationsPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/integration-operations/IntegrationOperations.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/pages/admin/integration-operations/integrationOperations.service.ts'),
    'utf8',
  );

  it('states integrations job sentence distinct from notifications, API keys, and pipeline', () => {
    expect(INTEGRATIONS_JOB_SENTENCE).toMatch(/Integrations operations/i);
    expect(INTEGRATIONS_JOB_SENTENCE).toMatch(/Notifications/i);
    expect(INTEGRATIONS_JOB_SENTENCE).toMatch(/API Keys/i);
    expect(INTEGRATIONS_JOB_SENTENCE).toMatch(/Pipeline Signals/i);
    expect(INTEGRATIONS_JOB_SENTENCE).not.toMatch(/identity directory/i);
    expect(page).toContain('INTEGRATIONS_JOB_SENTENCE');
    expect(page).toContain('honestyChrome');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(operations).toContain('STAGING CANDIDATE');
    expect(operations).toContain('integrations-empty-honesty');
    expect(operations).toContain('ROUTES.ADMIN_NOTIFICATIONS');
    expect(operations).toContain('ROUTES.SETTINGS_API_KEYS');
    expect(operations).toContain('ROUTES.ADMIN_PIPELINE_SIGNALS');
    expect(operations).toContain('ROUTES.ADMIN_CONNECTORS');
    expect(operations).toContain('Platform Administrator');
    expect(operations).not.toMatch(/href="\/admin\/notifications/);
    expect(operations).not.toMatch(/requires an administrator role/i);
  });

  it('uses legacy integration inventory and fail-closed configure semantics', () => {
    expect(service).toContain('/ha-integrations');
    expect(service).toContain('/ha-notification-rules');
    expect(service).toContain('/ha-admin/api-keys');
    expect(operations).toContain('int-page__projection-note');
    expect(operations).toContain('integrations-configure-fail-closed');
    expect(operations).toContain('integrations-configure-fail-closed-banner');
    expect(honesty).toContain('INTEGRATIONS_CONFIGURE_FAIL_CLOSED_TITLE');
    expect(honesty).toContain('INO-001');
  });

  it('uses integrations honesty chrome with empty-state distinction and min-height workspace', () => {
    expect(styles).toContain('.integrations-empty-honesty');
    expect(styles).toContain('.int-page__meta');
    expect(styles).toContain('.int-header__badge');
    expect(operations).toContain('showIntegrationsEmptyHonesty');
    expect(operations).toContain('data-integrations-honesty');
  });

  it('keeps StatusDock historical for integration inventory snapshot (C2-LIVE-01)', () => {
    expect(operations).toMatch(/mode=["']historical["']/);
  });
});
