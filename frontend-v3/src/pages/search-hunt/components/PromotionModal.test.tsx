/**
 * PromotionModal — approval-gated honesty (HNT-007 / F09).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PromotionModal } from './PromotionModal';

const previewPromotion = vi.fn();
const executePromotion = vi.fn();
const requestHuntPromotionApproval = vi.fn();

vi.mock('../searchHunt.service', () => ({
  previewPromotion: (...args: unknown[]) => previewPromotion(...args),
  executePromotion: (...args: unknown[]) => executePromotion(...args),
  requestHuntPromotionApproval: (...args: unknown[]) => requestHuntPromotionApproval(...args),
  isHuntApprovalRequiredError: () => false,
}));

function renderModal(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PromotionModal
        selectedEventIds={['evt-1']}
        searchId="HUNT-1"
        initialAction="escalate_incident"
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('PromotionModal approval honesty', () => {
  beforeEach(() => {
    previewPromotion.mockReset();
    executePromotion.mockReset();
    requestHuntPromotionApproval.mockReset();
  });

  it('requests approval and never claims success when approvalRequired', async () => {
    const user = userEvent.setup();
    previewPromotion.mockResolvedValue({
      action: 'escalate_incident',
      eventCount: 1,
      previewToken: 'tok-1',
      warnings: ['Manager approval is required before execute (approvalId)'],
      approvalRequired: true,
      preview: {
        title: 'Escalate authentication failures',
        description: 'Selected hunt events',
        entities: ['host:FIN-WKS-044'],
      },
    });
    requestHuntPromotionApproval.mockResolvedValue({
      approvalId: 'apr-9',
      searchId: 'HUNT-1',
      action: 'escalate_incident',
      status: 'PENDING',
      requester: 'analyst',
      tenantKey: 'authorized',
      requestRationale: 'Selected hunt events',
    });

    renderModal();

    await screen.findByText(/Manager approval required/i);
    expect(screen.getByRole('button', { name: /Request approval/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Request approval/i }));

    await waitFor(() => {
      expect(requestHuntPromotionApproval).toHaveBeenCalledWith({
        action: 'escalate_incident',
        eventIds: ['evt-1'],
        searchId: 'HUNT-1',
        previewToken: 'tok-1',
        rationale: 'Selected hunt events',
      });
    });
    expect(executePromotion).not.toHaveBeenCalled();
    expect(await screen.findByText(/Approval requested/i)).toBeInTheDocument();
    expect(screen.getByText(/No incident, investigation, or evidence was created/i)).toBeInTheDocument();
    expect(screen.queryByText(/Promotion Successful/i)).not.toBeInTheDocument();
  });

  it('executes directly when approval is not required', async () => {
    const user = userEvent.setup();
    previewPromotion.mockResolvedValue({
      action: 'create_evidence',
      eventCount: 1,
      previewToken: 'tok-ev',
      warnings: [],
      approvalRequired: false,
      preview: {
        title: 'Evidence pack',
        description: 'Attach events',
        entities: [],
      },
    });
    executePromotion.mockResolvedValue({
      actionId: 'aud-1',
      resultType: 'evidence',
      resultId: 'EV-1',
      status: 'created',
      url: '/incidents/1',
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PromotionModal
          selectedEventIds={['evt-1']}
          searchId="HUNT-1"
          initialAction="create_evidence"
          onSuccess={vi.fn()}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await screen.findByDisplayValue('Evidence pack');
    await user.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(executePromotion).toHaveBeenCalled();
    });
    expect(requestHuntPromotionApproval).not.toHaveBeenCalled();
    expect(await screen.findByText(/Promotion Successful/i)).toBeInTheDocument();
  });
});
