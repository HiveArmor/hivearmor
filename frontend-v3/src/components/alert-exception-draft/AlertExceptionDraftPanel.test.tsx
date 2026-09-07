import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertExceptionDraftPanel } from './AlertExceptionDraftPanel';

import { getFoundationAlertDetail } from '@/pages/alerts/alertTriage.fixtures';

const listExceptions = vi.fn();
const saveException = vi.fn();
const setExceptionActive = vi.fn();

vi.mock('@/services/detectionException.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/detectionException.service')>();
  return {
    ...actual,
    listExceptions: (...args: unknown[]) => listExceptions(...args),
    saveException: (...args: unknown[]) => saveException(...args),
    setExceptionActive: (...args: unknown[]) => setExceptionActive(...args),
  };
});

describe('AlertExceptionDraftPanel', () => {
  beforeEach(() => {
    listExceptions.mockReset();
    saveException.mockReset();
    setExceptionActive.mockReset();
    listExceptions.mockResolvedValue([
      {
        id: 9001,
        ruleId: 'RULE-ENDPOINT-184',
        title: 'Approved scanner host',
        reason: 'Weekly scans',
        conditions: [{ field: 'host.name', operator: 'is', value: 'approved-scanner' }],
        active: false,
        status: 'draft',
        createdBy: 'analyst',
        activatedBy: null,
        activatedAt: null,
        createdAt: '2026-09-07T10:00:00Z',
        updatedAt: '2026-09-07T10:00:00Z',
        honesty: 'fixture',
      },
    ]);
    saveException.mockResolvedValue({
      id: 9100,
      ruleId: 'RULE-ENDPOINT-184',
      title: 'Exception · Encoded script with persistence and outbound callback',
      reason: 'Prefill from alert ALT-7F3A91',
      conditions: [{ field: 'host.name', operator: 'is', value: 'FIN-WKS-044' }],
      active: false,
      status: 'draft',
      createdBy: 'fixture-analyst',
      activatedBy: null,
      activatedAt: null,
      createdAt: '2026-09-07T12:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
      honesty: 'fixture',
    });
  });

  it('prefills host and ruleId and saves a draft for Analyst+', async () => {
    const alert = getFoundationAlertDetail('ALT-7F3A91');
    render(
      <AlertExceptionDraftPanel
        alert={alert}
        canDraft
        canActivate={false}
        draftDeniedTitle="Required permission: Analyst or higher"
        activateDeniedTitle="Required permission: SOC Manager or Platform Administrator"
      />,
    );

    expect(await screen.findByDisplayValue('RULE-ENDPOINT-184')).toBeVisible();
    expect(screen.getByLabelText('Exception host.name')).toHaveValue('FIN-WKS-044');
    fireEvent.click(screen.getByTestId('aq-exception-save'));
    await waitFor(() => {
      expect(saveException).toHaveBeenCalledWith(
        'RULE-ENDPOINT-184',
        expect.stringContaining('Exception'),
        expect.stringContaining('ALT-7F3A91'),
        [{ field: 'host.name', operator: 'is', value: 'FIN-WKS-044' }],
      );
    });
    expect(await screen.findByText(/Saved draft exception #9100/)).toBeVisible();
    expect(screen.getByText(/Activate requires SOC Manager/)).toBeVisible();
  });

  it('disables save and activate with human role labels', async () => {
    const alert = getFoundationAlertDetail('ALT-7F3A91');
    render(
      <AlertExceptionDraftPanel
        alert={alert}
        canDraft={false}
        canActivate={false}
        draftDeniedTitle="Required permission: Analyst or higher"
        activateDeniedTitle="Required permission: SOC Manager or Platform Administrator"
      />,
    );

    expect(await screen.findByText('Approved scanner host')).toBeVisible();
    expect(screen.getByTestId('aq-exception-save')).toBeDisabled();
    expect(screen.getByTestId('aq-exception-save')).toHaveAttribute('title', 'Required permission: Analyst or higher');
    expect(screen.getByRole('button', { name: /Enable/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Enable/ })).toHaveAttribute(
      'title',
      'Required permission: SOC Manager or Platform Administrator',
    );
    expect(screen.queryByText(/ROLE_/)).toBeNull();
  });
});

describe('DET-FP-002 surface wiring', () => {
  it('mounts the draft panel in Analyst Queue and alerts triage drawers', () => {
    const queue = readFileSync(
      join(process.cwd(), 'src/pages/analyst-queue/components/QueueDetailDrawer.tsx'),
      'utf8',
    );
    const alerts = readFileSync(join(process.cwd(), 'src/pages/alerts/AlertDetailDrawer.tsx'), 'utf8');
    expect(queue).toContain('AlertExceptionDraftPanel');
    expect(queue).toContain('canActivateException');
    expect(alerts).toContain('AlertExceptionDraftPanel');
    expect(alerts).toContain('canDraftQueueException');
    expect(alerts).not.toContain('/api/uba');
    expect(queue).not.toContain('/api/uba');
  });
});
