import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_MUTATE_DENIED_TITLE,
  RESPONSE_ACTIVITY_JOB_SENTENCE,
} from './ResponseActivityPage';

describe('response activity UX honesty (Prompt 18)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/response/ResponseActivityPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/response/ResponseActivityPage.css'), 'utf8');

  it('states execution-ledger job sentence distinct from playbooks and authority', () => {
    expect(RESPONSE_ACTIVITY_JOB_SENTENCE).toMatch(/execution ledger|run history/i);
    expect(RESPONSE_ACTIVITY_JOB_SENTENCE).toMatch(/Response Playbooks|Response Approvals/i);
    expect(RESPONSE_ACTIVITY_JOB_SENTENCE).not.toMatch(/SOAR playbook inventory/i);
    expect(page).toContain('RESPONSE_ACTIVITY_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('activity-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('/response/authority');
    expect(page).toContain('ROUTES.DETECTION_RULES');
    expect(page).toContain('ROUTES.INCIDENTS');
    expect(page).toContain('Analyst · SOC Manager · Platform Administrator');
    expect(page).toContain('ROLE_USER');
  });

  it('gates cancel and approve/reject behind Platform Administrator', () => {
    expect(page).toContain('canAdmin');
    expect(page).toContain('ACTIVITY_MUTATE_DENIED_TITLE');
    expect(page).toContain('approvePlaybookExecution');
    expect(page).toContain('rejectPlaybookExecution');
    expect(ACTIVITY_MUTATE_DENIED_TITLE).toContain('Platform Administrator');
  });

  it('keeps execution grid primary with compact inline stats and no hero KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.act-inventory');
    expect(styles).toContain('.act-inline-stats');
    expect(styles).not.toContain('.act-summary');
    expect(page).not.toContain('act-summary');
  });

  it('folds trace honesty into identity chrome instead of a stacked RESP-018 banner', () => {
    expect(page).toContain('act-page__trace-note');
    expect(page).toContain('steps_log');
    expect(page).not.toContain('RESP_018_INVENTORY_TITLE');
  });

  it('keeps production export disabled with honest tooltip', () => {
    expect(page).toContain('Authoritative export endpoint required');
    expect(page).toContain('exportFixture');
  });
});
