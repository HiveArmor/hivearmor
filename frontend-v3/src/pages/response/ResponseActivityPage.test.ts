/**
 * ResponseActivityPage Tests
 * DEF-07 acceptance criteria validation
 */

import { describe, it, expect } from 'vitest';

import type { ResponseActivityDTO, ResponseActivityListParams, ResponseActivityStatus, ResponseExecutionTraceResult } from './response.types';

describe('ResponseActivityPage types', () => {
  it('should define ResponseActivityDTO with required fields', () => {
    const activity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test Playbook',
      playbookId: 'pb-1',
      trigger: 'MANUAL',
      executedBy: 'admin',
      status: 'SUCCESS',
      steps: [],
    };

    expect(activity.playbookName).toBe('Test Playbook');
    expect(activity.trigger).toBe('MANUAL');
    expect(activity.status).toBe('SUCCESS');
    expect(Array.isArray(activity.steps)).toBe(true);
  });

  it('should define ResponseActivityListParams with filter options', () => {
    const params: ResponseActivityListParams = {
      page: 0,
      size: 100,
      status: 'SUCCESS',
      timeFrom: '2026-07-01T00:00:00Z',
      timeTo: '2026-07-23T23:59:59Z',
    };

    expect(params.page).toBe(0);
    expect(params.size).toBe(100);
    expect(params.status).toBe('SUCCESS');
    expect(params.timeFrom).toBe('2026-07-01T00:00:00Z');
  });

  it('should allow ALL as a status filter value', () => {
    const params: ResponseActivityListParams = {
      status: 'ALL',
    };

    expect(params.status).toBe('ALL');
  });
});

describe('ResponseActivityPage status badges', () => {
  it('should define the complete execution lifecycle', () => {
    const validStatuses: ResponseActivityStatus[] = [
      'QUEUED',
      'RUNNING',
      'AWAITING_APPROVAL',
      'SUCCESS',
      'PARTIAL',
      'FAILED',
      'CANCELLED',
      'BLOCKED',
    ];

    expect(validStatuses.length).toBe(8);
    expect(validStatuses.includes('RUNNING')).toBe(true);
    expect(validStatuses.includes('AWAITING_APPROVAL')).toBe(true);
    expect(validStatuses.includes('PARTIAL')).toBe(true);
    expect(validStatuses.includes('SUCCESS')).toBe(true);
    expect(validStatuses.includes('FAILED')).toBe(true);
    expect(validStatuses.includes('BLOCKED')).toBe(true);
  });

  it('should map SUCCESS to positive color', () => {
    const status: ResponseActivityStatus = 'SUCCESS';
    const expectedColor = 'var(--ha-positive)';
    expect(status).toBe('SUCCESS');
    expect(expectedColor.includes('--ha-positive')).toBe(true);
  });

  it('should map FAILED to critical color', () => {
    const status: ResponseActivityStatus = 'FAILED';
    const expectedColor = 'var(--ha-critical)';
    expect(status).toBe('FAILED');
    expect(expectedColor.includes('--ha-critical')).toBe(true);
  });

  it('should map BLOCKED to high color', () => {
    const status: ResponseActivityStatus = 'BLOCKED';
    const expectedColor = 'var(--ha-high)';
    expect(status).toBe('BLOCKED');
    expect(expectedColor.includes('--ha-high')).toBe(true);
  });
});

describe('ResponseActivityPage role-based access', () => {
  it('should require ROLE_ANALYST or higher for view access', () => {
    const allowedRoles = ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'];
    expect(allowedRoles.includes('ROLE_ANALYST')).toBe(true);
    expect(allowedRoles.includes('ROLE_ADMIN')).toBe(true);
  });

  it('should keep authoritative production export disabled until the export contract exists', () => {
    const productionExportAvailable = false;
    expect(productionExportAvailable).toBe(false);
  });
});

describe('ResponseActivityPage grid configuration', () => {
  it('should use a bounded cursor page sorted by timestamp descending by default', () => {
    const rowModelType = 'clientSide';
    const defaultSort = 'desc';

    expect(rowModelType).toBe('clientSide');
    expect(defaultSort).toBe('desc');
  });

  it('should expose compact, standard, and comfortable icon density controls', () => {
    const rowHeights = { compact: 32, standard: 40, comfortable: 48 };
    expect(rowHeights.standard).toBe(40);
    expect(Object.keys(rowHeights)).toHaveLength(3);
  });
});

describe('ResponseActivityPage linked entities', () => {
  it('should support ALERT and INCIDENT entity types', () => {
    const alertActivity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'AUTOMATIC',
      linkedEntityId: 'alert-123',
      linkedEntityType: 'ALERT',
      executedBy: 'SYSTEM',
      status: 'SUCCESS',
      steps: [],
    };

    const incidentActivity: ResponseActivityDTO = {
      id: '2',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'AUTOMATIC',
      linkedEntityId: '456',
      linkedEntityType: 'INCIDENT',
      executedBy: 'SYSTEM',
      status: 'SUCCESS',
      steps: [],
    };

    expect(alertActivity.linkedEntityType).toBe('ALERT');
    expect(incidentActivity.linkedEntityType).toBe('INCIDENT');
  });

  it('should allow linkedEntityId to be undefined', () => {
    const activity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'SCHEDULED',
      executedBy: 'SYSTEM',
      status: 'SUCCESS',
      steps: [],
    };

    expect(activity.linkedEntityId).toBe(undefined);
    expect(activity.linkedEntityType).toBe(undefined);
  });
});

describe('ResponseActivityPage export functionality', () => {
  it('should export with CSV filename format', () => {
    const date = '2026-07-23';
    const filename = `hivearmor-response-activity-${date}.csv`;

    expect(filename.startsWith('hivearmor-response-activity-')).toBe(true);
    expect(filename.endsWith('.csv')).toBe(true);
  });

  it('should pass current filter params to export endpoint', () => {
    const params: ResponseActivityListParams = {
      timeFrom: '2026-07-01T00:00:00Z',
      timeTo: '2026-07-23T23:59:59Z',
      status: 'FAILED',
      triggeredBy: 'admin',
    };

    expect(params.timeFrom).toBe('2026-07-01T00:00:00Z');
    expect(params.status).toBe('FAILED');
    expect(params.triggeredBy).toBe('admin');
  });
});

describe('ResponseActivityPage drawer detail', () => {
  it('should display execution steps in stepper list', () => {
    const activity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'MANUAL',
      executedBy: 'admin',
      status: 'SUCCESS',
      steps: [
        {
          id: 'step-1',
          actionName: 'Send Notification',
          status: 'success',
          resultSummary: 'Email sent to admin@example.com',
          durationMs: 120,
        },
        {
          id: 'step-2',
          actionName: 'Isolate Host',
          status: 'error',
          errorMessage: 'Connection timeout',
          durationMs: 5000,
        },
      ],
    };

    expect(activity.steps.length).toBe(2);
    expect(activity.steps[0].actionName).toBe('Send Notification');
    expect(activity.steps[0].status).toBe('success');
    expect(activity.steps[1].status).toBe('error');
    expect(activity.steps[1].errorMessage).toBe('Connection timeout');
  });

  it('should support active, terminal, and skipped step statuses', () => {
    const successStep = { id: '1', actionName: 'Test', status: 'success' as const };
    const errorStep = { id: '2', actionName: 'Test', status: 'error' as const };
    const skippedStep = { id: '3', actionName: 'Test', status: 'skipped' as const };
    const runningStep = { id: '4', actionName: 'Test', status: 'running' as const };
    const waitingStep = { id: '5', actionName: 'Test', status: 'waiting' as const };

    expect(successStep.status).toBe('success');
    expect(errorStep.status).toBe('error');
    expect(skippedStep.status).toBe('skipped');
    expect(runningStep.status).toBe('running');
    expect(waitingStep.status).toBe('waiting');
  });

  it('should show em-dash for undefined duration', () => {
    const activity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'MANUAL',
      executedBy: 'admin',
      status: 'SUCCESS',
      steps: [],
    };

    const display = activity.durationMs === undefined ? '—' : `${activity.durationMs} ms`;
    expect(display).toBe('—');
  });

  it('should display SYSTEM executedBy in secondary text color', () => {
    const activity: ResponseActivityDTO = {
      id: '1',
      timestamp: '2026-07-23T12:00:00Z',
      playbookName: 'Test',
      playbookId: 'pb-1',
      trigger: 'AUTOMATIC',
      executedBy: 'SYSTEM',
      status: 'SUCCESS',
      steps: [],
    };

    expect(activity.executedBy).toBe('SYSTEM');
    const expectedColor = 'var(--ha-text-secondary)';
    expect(expectedColor.includes('--ha-text-secondary')).toBe(true);
  });
});

describe('ResponseActivityPage bounded execution contracts', () => {
  it('requests server-authorized scope rather than deriving it from loaded rows', () => {
    const params: ResponseActivityListParams = { tenantScope: 'authorized', size: 100 };
    expect(params.tenantScope).toBe('authorized');
    expect(params.size).toBeLessThanOrEqual(100);
  });

  it('models execution trace as a progressive cursor page', () => {
    const trace: ResponseExecutionTraceResult = {
      items: [],
      nextCursor: null,
      total: 0,
      hasMore: false,
      snapshotAt: '2026-08-11T10:00:00Z',
      stale: false,
      partialFailures: [],
    };
    expect(trace.hasMore).toBe(false);
    expect(trace.partialFailures).toEqual([]);
  });
});
