import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUTHORITY_DECIDE_DENIED_TITLE } from './response.capabilities';
import { RESPONSE_AUTHORITY_JOB_SENTENCE } from './ResponseAuthorityPage';

describe('response authority UX honesty (Prompt 19)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/response/ResponseAuthorityPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/response/ResponseAuthorityPage.css'), 'utf8');

  it('states approval-queue job sentence distinct from playbooks and activity', () => {
    expect(RESPONSE_AUTHORITY_JOB_SENTENCE).toMatch(/approval queue|approve\/reject/i);
    expect(RESPONSE_AUTHORITY_JOB_SENTENCE).toMatch(/Response Activity|policy authoring/i);
    expect(RESPONSE_AUTHORITY_JOB_SENTENCE).not.toMatch(/SOAR playbook inventory/i);
    expect(RESPONSE_AUTHORITY_JOB_SENTENCE).not.toMatch(/execution ledger/i);
    expect(page).toContain('RESPONSE_AUTHORITY_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('authority-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('ROUTES.RESPONSE_ACTIVITY');
    expect(page).toContain('ROUTES.DETECTION_RULES');
    expect(page).toContain('ROUTES.INCIDENTS');
    expect(page).toContain('SOC Manager · Platform Administrator');
    expect(page).toContain('ROLE_ANALYST');
  });

  it('gates approve/reject behind Platform Administrator only', () => {
    expect(page).toContain('canDecide');
    expect(page).toContain('AUTHORITY_DECIDE_DENIED_TITLE');
    expect(AUTHORITY_DECIDE_DENIED_TITLE).toContain('Platform Administrator');
  });

  it('keeps approval queue grid primary with compact inline stats and no hero KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.gov-inventory');
    expect(styles).toContain('.gov-inline-stats');
    expect(styles).not.toContain('.gov-summary');
    expect(page).not.toContain('gov-summary');
  });

  it('folds RESP-020 projection note into identity chrome', () => {
    expect(page).toContain('gov-page__projection-note');
    expect(page).toContain('RESP_020_APPROVAL_PROJECTION_TITLE');
    expect(page).not.toMatch(/Approval projection \(STAGING CANDIDATE\)/);
  });

  it('shows policy tab empty honesty when governance is unavailable', () => {
    expect(page).toContain('Policy and delegation authoring not implemented');
    expect(page).toContain('governanceUnavailable');
  });
});
