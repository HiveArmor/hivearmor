import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { STARTER_PLAYBOOK_TEMPLATES } from './playbookStarterTemplates';
import {
  adaptCanonicalPlaybookListItem,
  approveExecution,
  approvePlaybookExecution,
  rejectPlaybookExecution,
} from './responsePlaybooks.service';

import { apiClient } from '@/lib/apiClient';

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

describe('approvePlaybookExecution / rejectPlaybookExecution', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('posts approve to execution-scoped endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: 'exec-42',
      status: 'running',
      approved: true,
      resumeFromStep: 2,
    });

    await approvePlaybookExecution('exec-42');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-playbooks/executions/exec-42/approve'
    );
    expect(apiClient.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/approvals/'),
      expect.anything()
    );
  });

  it('posts reject with optional reason body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: 'exec-99',
      status: 'failure',
      approved: false,
    });

    await rejectPlaybookExecution('exec-99', '  Out of policy  ');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-playbooks/executions/exec-99/reject',
      { reason: 'Out of policy' }
    );
  });

  it('omits reject body when reason is empty', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: 'exec-99',
      status: 'failure',
      approved: false,
    });

    await rejectPlaybookExecution('exec-99', '   ');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-playbooks/executions/exec-99/reject',
      undefined
    );
  });

  it('legacy approveExecution adapter routes to the new endpoints', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: 'exec-1',
      status: 'running',
      approved: true,
    });

    await approveExecution('exec-1', 'APPROVED');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-playbooks/executions/exec-1/approve'
    );

    vi.mocked(apiClient.post).mockClear();
    vi.mocked(apiClient.post).mockResolvedValue({
      executionId: 'exec-1',
      status: 'failure',
      approved: false,
    });

    await approveExecution('exec-1', 'REJECTED', 'denied');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-playbooks/executions/exec-1/reject',
      { reason: 'denied' }
    );
  });
});

describe('STARTER_PLAYBOOK_TEMPLATES', () => {
  it('ships SOC starter playbooks with ordered steps', () => {
    expect(STARTER_PLAYBOOK_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    for (const template of STARTER_PLAYBOOK_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(3);
      expect(template.steps.length).toBeGreaterThan(0);
      template.steps.forEach((step, index) => {
        expect(step.stepIndex).toBe(index);
      });
    }
  });

  it('uses only executable action ids and never hardcodes agentId', () => {
    const allowedActionIds = new Set([
      'send-webhook',
      'isolate_host',
      'kill_process',
      'quarantine_file',
      'create-jira-ticket',
    ]);
    for (const template of STARTER_PLAYBOOK_TEMPLATES) {
      for (const step of template.steps) {
        if (step.stepType !== 'action') continue;
        const actionId = step.config['actionId'];
        expect(typeof actionId).toBe('string');
        expect(allowedActionIds.has(actionId as string)).toBe(true);
        expect(step.config['agentId']).toBeUndefined();
        const params = step.config['params'];
        if (params && typeof params === 'object' && !Array.isArray(params)) {
          expect((params as Record<string, unknown>)['agentId']).toBeUndefined();
        }
        if (
          actionId === 'isolate_host' ||
          actionId === 'kill_process' ||
          actionId === 'quarantine_file'
        ) {
          expect(template.active).toBe(false);
        }
      }
    }
  });
});
