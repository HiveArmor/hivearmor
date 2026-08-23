import { describe, it, expect, vi, beforeEach } from 'vitest';

import { enrichAlertWithAi } from './alertInvestigation.service';

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

describe('enrichAlertWithAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to /ha-soc-ai/enrich-alert with the alert id', async () => {
    const { apiClient } = await import('@/lib/apiClient');
    vi.mocked(apiClient.post).mockResolvedValue({
      summary: 'Suspicious process chain on finance host.',
      tactics: ['Execution'],
      recommendedActions: ['Isolate host'],
    });

    const result = await enrichAlertWithAi('alert-123');

    expect(apiClient.post).toHaveBeenCalledWith('/ha-soc-ai/enrich-alert', { alertId: 'alert-123' });
    expect(result.summary).toContain('Suspicious process');
  });
});
