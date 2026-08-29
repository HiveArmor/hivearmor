import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PLAYBOOK_MANAGE_DENIED_TITLE,
  RESPONSE_PLAYBOOKS_JOB_SENTENCE,
} from './ResponsePlaybooksPage';

describe('response playbooks UX honesty (Prompt 17)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/response/ResponsePlaybooksPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/response/ResponsePlaybooksPage.css'), 'utf8');

  it('states inventory-first job sentence distinct from detection and triage', () => {
    expect(RESPONSE_PLAYBOOKS_JOB_SENTENCE).toMatch(/SOAR|playbook inventory/i);
    expect(RESPONSE_PLAYBOOKS_JOB_SENTENCE).toMatch(/Detection Rules|Response Activity/i);
    expect(RESPONSE_PLAYBOOKS_JOB_SENTENCE).not.toMatch(/alert triage lives on Analyst Queue/i);
    expect(page).toContain('RESPONSE_PLAYBOOKS_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('playbook-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.DETECTION_RULES');
    expect(page).toContain('ROUTES.RESPONSE_ACTIVITY');
    expect(page).toContain('/response/authority');
    expect(page).toContain('ROUTES.INCIDENTS');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toContain('resp-metrics-strip');
  });

  it('gates create, toggle, and execute behind canManage with human labels', () => {
    expect(page).toContain('canManage');
    expect(page).toContain('PLAYBOOK_MANAGE_DENIED_TITLE');
    expect(PLAYBOOK_MANAGE_DENIED_TITLE).toContain('Platform Administrator');
  });

  it('keeps playbook grid primary with compact filters and no fake KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.resp-inventory');
    expect(styles).not.toContain('.resp-metrics-strip');
    expect(page).not.toContain('fetchPlaybookMetrics');
  });

  it('documents governed execute honesty for approval-required playbooks', () => {
    expect(page).toContain('Run with approval');
    expect(page).toContain('Response Approvals');
    expect(page).toContain('projection only');
  });
});
