import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { THREAT_INTEL_ADMIN_JOB_SENTENCE } from './threatIntelAdmin.honesty';

describe('Threat intel admin UX honesty (Wave C2 leftovers)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/threat-intel/ThreatIntelAdminPage.tsx'),
    'utf8',
  );
  const layout = readFileSync(
    join(process.cwd(), 'src/pages/admin/threat-intel/ThreatIntelAdminHonestyLayout.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/threat-intel/threatIntelAdmin.honesty.ts'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/threat-intel/ThreatIntelAdminPage.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/services/threatIntel.service.ts'),
    'utf8',
  );
  const capabilities = readFileSync(
    join(process.cwd(), 'src/services/threatIntel.capabilities.ts'),
    'utf8',
  );
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('states threat intel admin job sentence distinct from Hive Intelligence workbench', () => {
    expect(THREAT_INTEL_ADMIN_JOB_SENTENCE).toMatch(/Threat intelligence source administration/i);
    expect(THREAT_INTEL_ADMIN_JOB_SENTENCE).toMatch(/Hive Intelligence/i);
    expect(THREAT_INTEL_ADMIN_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(THREAT_INTEL_ADMIN_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('ThreatIntelAdminHonestyLayout');
    expect(layout).toContain('THREAT_INTEL_ADMIN_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(layout).toContain('STAGING CANDIDATE');
    expect(layout).toContain('threat-intel-empty-honesty');
    expect(layout).toContain('ROUTES.INTELLIGENCE');
    expect(layout).toContain('ROUTES.ADMIN_AUDIT');
    expect(layout).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(layout).toContain('Platform Administrator');
    expect(layout).not.toMatch(/href="\/intelligence/);
    expect(page).not.toMatch(/requires an administrator role/i);
    expect(router).toContain('ThreatIntelAdminPage');
  });

  it('uses ha-threat-intel APIs and honest projection note', () => {
    expect(service).toContain('/ha-threat-intel/taxii-feeds');
    expect(service).toContain('/ha-threat-intel/misp-feeds');
    expect(service).toContain('/ha-threat-intel/stats');
    expect(service).not.toMatch(/apiClient\.[^(]*\(['"]\/v1\/threat-intel/);
    expect(layout).toContain('ti-page__projection-note');
    expect(layout).toContain('ThreatFeedSyncReceipt');
    expect(honesty).toContain('TI-001');
    expect(honesty).toContain('TI-003');
  });

  it('documents scheduled sync fail-closed gates and TI-004 receipt honesty', () => {
    expect(capabilities).toContain('TI_004_SYNC_RECEIPT = true');
    expect(layout).toContain('threat-intel-scheduled-sync-fail-closed-banner');
    expect(layout).toContain('THREAT_INTEL_SCHEDULED_SYNC_FAIL_CLOSED_TITLE');
    expect(layout).toContain('zero-IOC success is never inferred');
  });

  it('uses threat intel workspace with empty honesty and min-height 50vh', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.threat-intel-empty-honesty');
    expect(styles).toContain('.ti-header__badge');
    expect(layout).toContain('data-threat-intel-honesty');
  });

  it('keeps StatusDock historical for threat intel inventory snapshot', () => {
    expect(layout).toMatch(/mode=["']historical["']/);
  });
});
