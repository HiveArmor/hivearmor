import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: { status: number; message?: string; error?: string },
      message?: string,
    ) {
      super(message ?? body.message ?? `HTTP ${status}`);
      this.name = 'ApiError';
    }
  },
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    delete: vi.fn(),
  },
}));

describe('executeSearch keyword timeline', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue([
      {
        id: 'evt-1',
        timestamp: '2026-08-18T12:00:00Z',
        eventType: 'powershell',
        severity: null,
        dataType: 'powershell',
      },
    ]);
  });

  it('calls GET /ha-search/timeline instead of nl-query', async () => {
    const { executeSearch } = await import('./searchHunt.service');
    const result = await executeSearch({
      query: 'EncodedCommand',
      timeRange: { type: 'absolute', from: '2026-08-18T00:00:00.000Z', to: '2026-08-18T23:59:59.000Z' },
      from: 0,
      size: 50,
    });
    expect(get).toHaveBeenCalledWith('/ha-search/timeline', {
      params: {
        query: 'EncodedCommand',
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-18T23:59:59.000Z',
      },
    });
    expect(result.hits[0]?.id).toBe('evt-1');
    expect(result.total).toBe(1);
  });
});

describe('executeHuntAction promotion contract', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('previews then executes create_evidence when approval is not required', async () => {
    post
      .mockResolvedValueOnce({
        previewToken: 'tok-1',
        preview: { title: 'Hunt evidence', description: '', entities: [] },
        action: 'create_evidence',
        eventCount: 1,
        warnings: [],
        approvalRequired: false,
      })
      .mockResolvedValueOnce({
        actionId: 'aud-9',
        resultType: 'evidence',
        resultId: 'EV-42',
        status: 'created',
        url: '/incidents/1/evidence/EV-42',
      });

    const { executeHuntAction } = await import('./searchHunt.service');
    const result = await executeHuntAction({
      type: 'add_evidence',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
      incidentId: 'INC-1',
      title: 'Evidence pack',
      reason: 'Corroborating authentication failures',
    });

    expect(post).toHaveBeenNthCalledWith(1, '/ha-hunts/actions/preview', {
      action: 'create_evidence',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/ha-hunts/actions', {
      action: 'create_evidence',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
      title: 'Evidence pack',
      description: 'Corroborating authentication failures',
      previewToken: 'tok-1',
      parameters: { incidentId: 'INC-1' },
    });
    expect(result).toEqual({
      outcome: 'created',
      targetId: 'EV-42',
      auditId: 'aud-9',
    });
  });

  it('requests approval instead of execute when escalate requires approval', async () => {
    post
      .mockResolvedValueOnce({
        previewToken: 'tok-esc',
        preview: { title: 'Hunt incident', description: '', entities: [] },
        action: 'escalate_incident',
        eventCount: 1,
        warnings: ['Manager approval is required before execute (approvalId)'],
        approvalRequired: true,
        approvalRequestPath: '/api/ha-hunts/approvals',
      })
      .mockResolvedValueOnce({
        approvalId: 'apr-77',
        searchId: 'HUNT-1',
        action: 'escalate_incident',
        status: 'PENDING',
        requester: 'analyst',
        tenantKey: 'authorized',
        requestRationale: 'Repeated authentication failures',
      });

    const { executeHuntAction } = await import('./searchHunt.service');
    const result = await executeHuntAction({
      type: 'create_incident',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
      title: 'SSH brute force',
      reason: 'Repeated authentication failures',
    });

    expect(post).toHaveBeenNthCalledWith(1, '/ha-hunts/actions/preview', {
      action: 'escalate_incident',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/ha-hunts/approvals', {
      action: 'escalate_incident',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
      previewToken: 'tok-esc',
      rationale: 'Repeated authentication failures',
    });
    expect(post).not.toHaveBeenCalledWith('/ha-hunts/actions', expect.anything());
    expect(result).toEqual({
      outcome: 'approval_pending',
      targetId: 'apr-77',
      auditId: 'apr-77',
      approvalId: 'apr-77',
    });
  });

  it('requests approval for create_investigation when gated', async () => {
    post
      .mockResolvedValueOnce({
        previewToken: 'tok-inv',
        preview: { title: 'Investigation', description: '', entities: [] },
        action: 'create_investigation',
        eventCount: 2,
        warnings: [],
        approvalRequired: true,
      })
      .mockResolvedValueOnce({
        approvalId: 'apr-inv',
        searchId: 'HUNT-2',
        action: 'create_investigation',
        status: 'PENDING',
        requester: 'analyst',
        tenantKey: 'authorized',
        requestRationale: 'Need deeper review',
      });

    const { executeHuntAction } = await import('./searchHunt.service');
    const result = await executeHuntAction({
      type: 'create_investigation',
      eventIds: ['evt-1', 'evt-2'],
      searchId: 'HUNT-2',
      title: 'Scope review',
      reason: 'Need deeper review',
    });

    expect(result.outcome).toBe('approval_pending');
    expect(result.approvalId).toBe('apr-inv');
    expect(post.mock.calls.some((call) => call[0] === '/ha-hunts/actions')).toBe(false);
  });
});

describe('isHuntApprovalRequiredError', () => {
  it('detects APPROVAL_REQUIRED in ApiError body', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    const { isHuntApprovalRequiredError } = await import('./searchHunt.service');
    const err = new ApiError(400, {
      status: 400,
      message: 'APPROVAL_REQUIRED: this action requires parameters.approvalId',
    });
    expect(isHuntApprovalRequiredError(err)).toBe(true);
    expect(isHuntApprovalRequiredError(new Error('unrelated'))).toBe(false);
  });
});
