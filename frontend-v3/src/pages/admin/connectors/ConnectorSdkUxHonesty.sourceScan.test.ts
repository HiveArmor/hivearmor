import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONNECTOR_SDK_JOB_SENTENCE } from './ConnectorSdkPage';

describe('Connector SDK UX honesty (Prompt 38)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/connectors/ConnectorSdkPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/connectors/ConnectorSdkPage.css'),
    'utf8',
  );
  const service = readFileSync(join(process.cwd(), 'src/services/connectorService.ts'), 'utf8');
  const capabilities = readFileSync(
    join(process.cwd(), 'src/services/connector.capabilities.ts'),
    'utf8',
  );

  it('states connector SDK job sentence distinct from Integrations and Response Library', () => {
    expect(CONNECTOR_SDK_JOB_SENTENCE).toMatch(/Typed connector SDK/i);
    expect(CONNECTOR_SDK_JOB_SENTENCE).toMatch(/Integrations/i);
    expect(CONNECTOR_SDK_JOB_SENTENCE).toMatch(/Response Library/i);
    expect(CONNECTOR_SDK_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('CONNECTOR_SDK_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('connectors-empty-honesty');
    expect(page).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(page).toContain('ROUTES.RESPONSE_LIBRARY');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/admin\/integrations/);
    expect(page).not.toMatch(/href="\/response\/library/);
  });

  it('uses canonical /ha-connectors APIs and honest projection note', () => {
    expect(service).toContain('/ha-connectors/catalog');
    expect(service).toContain('/ha-connectors/instances');
    expect(service).toContain('/ha-connectors/staged-alerts');
    expect(page).toContain('cnx-page__projection-note');
    expect(page).toContain('connector-promoted');
    expect(page).toMatch(/not correlated SIEM alert/i);
  });

  it('documents vendor live deferral and admin-only promote gates', () => {
    expect(capabilities).toContain('CONNECTOR_VENDOR_LIVE_VERIFIED = false');
    expect(capabilities).toContain('CONNECTOR_PROMOTE_ADMIN_ONLY = true');
    expect(page).toContain('CONNECTOR_VENDOR_LIVE_VERIFIED');
    expect(page).toContain('CONNECTOR_PROMOTE_DENIED_TITLE');
    expect(page).toContain('Required permission: Platform Administrator');
  });

  it('uses connector workspace with summary stats and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.cnx-summary');
    expect(styles).toContain('.connectors-empty-honesty');
    expect(styles).toContain('.cnx-header__badge');
  });

  it('keeps StatusDock historical for connector inventory snapshot', () => {
    expect(page).toMatch(/mode=["']historical["']/);
    expect(page).not.toMatch(/mode=\{.*fixtureMode.*'live'/);
  });
});
