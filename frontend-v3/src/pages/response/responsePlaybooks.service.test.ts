import { describe, expect, it } from 'vitest';

import { STARTER_PLAYBOOK_TEMPLATES } from './playbookStarterTemplates';
import { adaptCanonicalPlaybookListItem } from './responsePlaybooks.service';

describe('adaptCanonicalPlaybookListItem', () => {
  it('maps compact backend DTO into library projection', () => {
    const item = adaptCanonicalPlaybookListItem({
      id: 7,
      name: 'Endpoint Isolation Response',
      description: 'Isolate host',
      triggerType: 'alert-triggered',
      active: true,
      runCount: 3,
      lastRunAt: '2026-08-24T10:00:00Z',
      lastRunStatus: 'success',
      steps: [{ stepType: 'action', label: 'Isolate host via EDR' }],
    });

    expect(item.id).toBe('7');
    expect(item.status).toBe('ACTIVE');
    expect(item.triggerType).toBe('AUTOMATIC');
    expect(item.category).toBe('EDR');
    expect(item.runCount).toBe(3);
    expect(item.lastRunStatus).toBe('success');
  });

  it('defaults missing fields safely', () => {
    const item = adaptCanonicalPlaybookListItem({ id: 'x' });
    expect(item.name).toBe('Playbook x');
    expect(item.status).toBe('INACTIVE');
    expect(item.triggerType).toBe('MANUAL');
    expect(item.category).toBe('Multi-step');
  });
});

describe('STARTER_PLAYBOOK_TEMPLATES', () => {
  it('ships SOC starter playbooks with ordered steps', () => {
    expect(STARTER_PLAYBOOK_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const template of STARTER_PLAYBOOK_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(3);
      expect(template.steps.length).toBeGreaterThan(0);
      template.steps.forEach((step, index) => {
        expect(step.stepIndex).toBe(index);
      });
    }
  });
});
