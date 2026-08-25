import { describe, it, expect, vi, beforeEach } from 'vitest';

import { enrichAlertWithAi, fetchResponseActions, STATIC_SOAR_ACTION_CATALOGUE } from './alertInvestigation.service';

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

describe('fetchResponseActions (A1-AI-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the confirmed /response/actions catalogue when available', async () => {
    const { apiClient } = await import('@/lib/apiClient');
    const live = [
      {
        id: 'isolate_host',
        name: 'Isolate Host',
        description: 'Live',
        category: 'containment',
        targetType: 'host',
        parameters: [],
        integrationStatus: 'healthy',
        riskLevel: 'critical',
        requiredRole: 'ROLE_SOC_MANAGER',
      },
    ];
    vi.mocked(apiClient.get).mockResolvedValue(live);
    await expect(fetchResponseActions()).resolves.toEqual(live);
    expect(apiClient.get).toHaveBeenCalledWith('/response/actions');
  });

  it('fails closed to the static catalogue when the live path errors', async () => {
    const { apiClient } = await import('@/lib/apiClient');
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
    const actions = await fetchResponseActions();
    expect(actions).toEqual(STATIC_SOAR_ACTION_CATALOGUE);
    expect(actions.every((action) => action.integrationStatus === 'unavailable')).toBe(true);
  });
});
