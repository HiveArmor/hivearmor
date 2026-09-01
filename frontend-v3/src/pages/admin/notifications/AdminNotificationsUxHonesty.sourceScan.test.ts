import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NOTIFICATIONS_JOB_SENTENCE } from './adminNotifications.honesty';

describe('Admin notifications UX honesty (Prompt 44)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/notifications/AdminNotificationsPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/notifications/adminNotifications.honesty.ts'),
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
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('states notifications job sentence distinct from integrations, API keys, and pipeline', () => {
    expect(NOTIFICATIONS_JOB_SENTENCE).toMatch(/Notifications operations/i);
    expect(NOTIFICATIONS_JOB_SENTENCE).toMatch(/Integrations/i);
    expect(NOTIFICATIONS_JOB_SENTENCE).toMatch(/API Keys/i);
    expect(NOTIFICATIONS_JOB_SENTENCE).toMatch(/Pipeline Signals/i);
    expect(NOTIFICATIONS_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain("variant: 'notifications'");
    expect(page).toContain('NOTIFICATIONS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(operations).toContain('STAGING CANDIDATE');
    expect(operations).toContain('notifications-empty-honesty');
    expect(operations).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(operations).toContain('ROUTES.SETTINGS_API_KEYS');
    expect(operations).toContain('ROUTES.ADMIN_PIPELINE_SIGNALS');
    expect(operations).toContain('Platform Administrator');
    expect(operations).not.toMatch(/href="\/admin\/integrations/);
    expect(operations).not.toMatch(/requires an administrator role/i);
  });

  it('uses notification-rules API and honest projection note', () => {
    expect(service).toContain('/ha-notification-rules');
    expect(operations).toContain('notifications-delivery-fail-closed-banner');
    expect(honesty).toContain('INO-005');
    expect(honesty).toContain('INO-007');
    expect(honesty).toContain('INO_NOTIFICATION_TEST_MOCK_LIVE = false');
  });

  it('documents delivery fail-closed gates and delivery-view configure semantics', () => {
    expect(honesty).toContain('NOTIFICATIONS_DELIVERY_FAIL_CLOSED_TITLE');
    expect(operations).toContain('notifications-delivery-fail-closed');
    expect(operations).toContain('showNotificationsEmptyHonesty');
  });

  it('uses notifications honesty chrome with empty-state distinction', () => {
    expect(styles).toContain('.notifications-empty-honesty');
    expect(styles).toContain('.int-page__meta');
    expect(styles).toContain('.int-header__badge');
    expect(operations).toContain('data-notifications-honesty');
  });

  it('routes admin/notifications through AdminNotificationsPage with delivery view', () => {
    expect(router).toMatch(/path: 'admin\/notifications'[\s\S]*?AdminNotificationsPage/);
    expect(page).toContain('initialView="delivery"');
  });

  it('keeps StatusDock historical for notification inventory snapshot (C2-LIVE-01)', () => {
    expect(operations).toMatch(/mode=["']historical["']/);
  });
});
