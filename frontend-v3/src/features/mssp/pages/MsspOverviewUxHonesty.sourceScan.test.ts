import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MSSP_OVERVIEW_JOB_SENTENCE } from './msspOverview.honesty';

describe('MSSP overview UX honesty (Prompt 45 / Wave C3)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/features/mssp/pages/MsspOverviewPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/features/mssp/pages/msspOverview.honesty.ts'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/features/mssp/pages/MsspOverviewPage.css'),
    'utf8',
  );
  const api = readFileSync(
    join(process.cwd(), 'src/features/mssp/api/msspOverviewApi.ts'),
    'utf8',
  );

  it('states overview job sentence distinct from tenants list and platform tenancy', () => {
    expect(MSSP_OVERVIEW_JOB_SENTENCE).toMatch(/MSSP Overview/i);
    expect(MSSP_OVERVIEW_JOB_SENTENCE).toMatch(/Tenants|Identity & Tenancy/i);
    expect(MSSP_OVERVIEW_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('MSSP_OVERVIEW_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('mssp-overview-empty-honesty');
    expect(page).toContain('MSSP_ROUTES.TENANTS');
    expect(page).toContain('MSSP_ROUTES.NEW_TENANT');
    expect(page).toContain('ROUTES.ADMIN_TENANTS');
    expect(page).toContain('ROUTES.DASHBOARD');
    expect(page).toContain('MSSP Administrator');
    expect(page).not.toMatch(/href="\/mssp\/tenants/);
    expect(page).toContain('mssp-overview-page__projection-note');
    expect(page).toContain('data-mssp-overview-honesty');
  });

  it('uses ha-mssp overview API and honest empty-vs-error distinction', () => {
    expect(api).toContain('/ha-mssp/overview');
    expect(api).toContain('msspFetch');
    expect(page).toContain('mssp-overview-error');
    expect(page).toContain('mssp-overview-empty');
    expect(page).not.toContain('is404 || (isError && !data)');
    expect(honesty).toContain('MSSP_OVERVIEW_AGGREGATE_FAIL_CLOSED_TITLE');
  });

  it('uses overview honesty chrome with compact header layout', () => {
    expect(styles).toContain('.mssp-overview-empty-honesty');
    expect(styles).toContain('.mssp-overview-page__meta');
    expect(styles).toContain('.mssp-overview-header__badge');
    expect(styles).toContain('min-height:0');
  });
});
