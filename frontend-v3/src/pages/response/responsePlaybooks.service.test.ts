import { describe, expect, it } from 'vitest';

import { adaptCanonicalPlaybookListItem } from './responsePlaybooks.service';

describe('adaptCanonicalPlaybookListItem', () => {
  it('normalizes the current secured backend DTO without undefined semantic fields', () => {
    const item = adaptCanonicalPlaybookListItem({
      id: 42,
      name: 'Host isolation response',
      description: 'Quarantine an endpoint after analyst approval.',
      triggerType: 'alert-triggered',
      active: true,
      runCount: 7,
      lastRunAt: '2026-08-11T10:00:00Z',
      lastRunStatus: 'success',
      steps: [{ stepType: 'approval', config: { approvalRequired: true } }],
    });

    expect(item).toMatchObject({
      id: '42',
      status: 'ACTIVE',
      triggerType: 'AUTOMATIC',
      category: 'EDR',
      approvalRequired: true,
      runCount: 7,
      lastRunStatus: 'success',
      createdBy: 'Not provided',
    });
  });

  it('uses safe inactive and manual defaults for partial compatibility records', () => {
    const item = adaptCanonicalPlaybookListItem({ id: 'legacy-1' });

    expect(item).toMatchObject({
      id: 'legacy-1',
      name: 'Playbook legacy-1',
      status: 'INACTIVE',
      triggerType: 'MANUAL',
      category: 'Multi-step',
      runCount: 0,
      lastRunStatus: null,
      approvalRequired: false,
    });
  });
});
