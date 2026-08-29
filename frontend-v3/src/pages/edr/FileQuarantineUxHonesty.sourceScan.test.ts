import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { QUARANTINE_CONTAINMENT_JOB_SENTENCE } from './FileQuarantinePage';

import {
  QUARANTINE_MUTATE_DENIED_TITLE,
  RESP_021_ISOLATION_INVENTORY,
  RESP_021_ISOLATION_MUTATE,
} from '@/pages/response/response.capabilities';

describe('file quarantine UX honesty (Prompt 20)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/edr/FileQuarantinePage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/edr/FileQuarantinePage.css'), 'utf8');

  it('states containment-inventory job sentence distinct from playbooks and approvals', () => {
    expect(QUARANTINE_CONTAINMENT_JOB_SENTENCE).toMatch(/containment inventory|quarantine/i);
    expect(QUARANTINE_CONTAINMENT_JOB_SENTENCE).toMatch(/Response Playbooks|Response Approvals/i);
    expect(QUARANTINE_CONTAINMENT_JOB_SENTENCE).not.toMatch(/SOAR playbook inventory/i);
    expect(QUARANTINE_CONTAINMENT_JOB_SENTENCE).not.toMatch(/execution ledger/i);
    expect(page).toContain('QUARANTINE_CONTAINMENT_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('quarantine-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('ROUTES.RESPONSE_ACTIVITY');
    expect(page).toContain('ROUTES.RESPONSE_AUTHORITY');
    expect(page).toContain('ROUTES.EDR_ENDPOINTS');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).not.toMatch(/href="\/response\//);
  });

  it('gates file restore/delete behind authorized roles', () => {
    expect(page).toContain('canMutate');
    expect(page).toContain('QUARANTINE_MUTATE_DENIED_TITLE');
    expect(QUARANTINE_MUTATE_DENIED_TITLE).toContain('Analyst');
  });

  it('keeps inventory grid primary with compact inline stats and no hero KPI strip', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.qrn-inventory');
    expect(styles).toContain('.qrn-inline-stats');
    expect(styles).not.toContain('.qrn-summary');
    expect(page).not.toContain('qrn-summary');
    expect(page).not.toContain('Response automation');
  });

  it('folds RESP-021 isolation read-only note into identity chrome', () => {
    expect(page).toContain('qrn-page__projection-note');
    expect(page).toContain('RESP_021_ISOLATION_PROJECTION_TITLE');
    expect(RESP_021_ISOLATION_INVENTORY).toBe(true);
    expect(RESP_021_ISOLATION_MUTATE).toBe(false);
  });

  it('uses ha-edr quarantine and isolation APIs only', () => {
    expect(page).toContain('/api/ha-edr/isolation');
    expect(page).toContain('Legacy /api/edr/isolation is not used');
    expect(page).not.toMatch(/['"]\/api\/edr\/quarantine/);
    expect(page).not.toMatch(/fetch\([^)]*\/api\/edr\//);
  });
});
