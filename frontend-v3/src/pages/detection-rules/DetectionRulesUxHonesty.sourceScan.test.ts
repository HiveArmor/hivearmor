import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DETECTION_RULES_JOB_SENTENCE } from './DetectionRulesPage';

describe('detection rules UX honesty (Prompt 16)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.css'), 'utf8');
  const columns = readFileSync(join(process.cwd(), 'src/pages/detection-rules/columnDefs.tsx'), 'utf8');

  it('states inventory-first job sentence distinct from alert triage', () => {
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/detection content|rule inventory/i);
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/MITRE|coverage|test/i);
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/Alert triage lives on Analyst Queue/i);
    expect(page).toContain('DETECTION_RULES_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('detection-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.ALERTS');
    expect(page).toContain('ROUTES.CORRELATED_FINDINGS');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toContain('detection-kpis');
  });

  it('gates create, test, and activate behind canManage with human labels', () => {
    expect(page).toContain('canManage');
    expect(page).toContain('DETECTION_MANAGE_DENIED_TITLE');
    expect(columns).toContain('MANAGE_DENIED_TITLE');
    expect(columns).toContain('Platform Administrator');
  });

  it('keeps rule grid primary with compact filters and no fake health KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.detection-inventory');
    expect(styles).not.toContain('.detection-kpis');
  });
});
