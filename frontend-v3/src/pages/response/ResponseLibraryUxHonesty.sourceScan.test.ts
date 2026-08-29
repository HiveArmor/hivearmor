import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RESPONSE_LIBRARY_JOB_SENTENCE } from './ResponseLibraryPage';

describe('response library UX honesty (Prompt 21)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/response/ResponseLibraryPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/response/ResponseLibraryPage.css'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/responseActionService.ts'), 'utf8');

  it('states catalog-browse job sentence distinct from playbooks and approvals', () => {
    expect(RESPONSE_LIBRARY_JOB_SENTENCE).toMatch(/action catalog|SOAR primitives/i);
    expect(RESPONSE_LIBRARY_JOB_SENTENCE).toMatch(/Never execute from the catalog/i);
    expect(RESPONSE_LIBRARY_JOB_SENTENCE).toMatch(/Response Playbooks|Response Approvals/i);
    expect(RESPONSE_LIBRARY_JOB_SENTENCE).not.toMatch(/SOAR playbook inventory/i);
    expect(RESPONSE_LIBRARY_JOB_SENTENCE).not.toMatch(/execution ledger/i);
    expect(page).toContain('RESPONSE_LIBRARY_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('library-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.DETECTION_RULES');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('ROUTES.RESPONSE_ACTIVITY');
    expect(page).toContain('ROUTES.RESPONSE_AUTHORITY');
    expect(page).toContain('ROUTES.RESPONSE_QUARANTINE');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/response\//);
  });

  it('forbids direct execution from the catalog', () => {
    expect(page).toContain('Never execute from the catalog');
    expect(page).not.toMatch(/\/execute/);
    expect(page).not.toMatch(/\/preview/);
    expect(page).not.toContain('Run now');
    expect(page).not.toContain('Execute');
    expect(page).toContain('Add to playbook');
  });

  it('keeps catalog grid primary with compact inline stats and no hero KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.ral-inventory');
    expect(styles).toContain('.ral-inline-stats');
    expect(styles).not.toContain('.ral-metrics');
    expect(page).not.toContain('ral-metrics');
    expect(page).not.toContain('Response automation');
    expect(page).not.toContain('Action &amp; Connector Library');
  });

  it('folds side-effect-free and connector-readiness notes into identity chrome', () => {
    expect(page).toContain('ral-page__projection-note');
    expect(page).toContain('side-effect free');
    expect(page).toContain('Connector readiness is advisory');
  });

  it('uses GET /api/response/actions as primary catalog only', () => {
    expect(service).toContain("apiClient.get<ResponseActionCatalogDTO[]>('/response/actions'");
    expect(service).not.toMatch(/apiClient\.get[^;]*\/soar\/actions/);
    expect(service).not.toMatch(/apiClient\.get[^;]*\/ha-response-actions\/library/);
  });
});
