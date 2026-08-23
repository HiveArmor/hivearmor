import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AssignmentDialog } from './AssignmentDialog';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: { status: number; message?: string; detail?: string };
    constructor(status: number, body: { status: number; message?: string; detail?: string }) {
      super(body.detail ?? body.message ?? `HTTP ${status}`);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/components/toast-stack/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

describe('AssignmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads assignees and executes preview then assign', async () => {
    const { apiClient } = await import('@/lib/apiClient');
    vi.mocked(apiClient.get).mockResolvedValue({
      items: [{ id: 41, displayName: 'Maya Chen', queueLoad: 2, slaRiskLoad: 0 }],
      hasMore: false,
    });
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({
        selected: 1,
        eligible: 1,
        excluded: 0,
        alreadyAssigned: 0,
        previewToken: 'preview-token',
      })
      .mockResolvedValueOnce({});

    const onSuccess = vi.fn();
    render(
      <AssignmentDialog
        alertIds={['alert-1']}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: /Assign 1 alert/ })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Why this owner/), {
      target: { value: 'Hand off for containment review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/ha-alerts/bulk/assignment/preview',
        { alertIds: ['alert-1'], assigneeId: 41 },
      );
    });
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/ha-alerts/bulk/assignment',
        expect.objectContaining({
          alertIds: ['alert-1'],
          assigneeId: 41,
          previewToken: 'preview-token',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
