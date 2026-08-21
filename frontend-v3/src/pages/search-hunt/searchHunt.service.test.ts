import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('@/lib/apiClient', () => ({
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
    post
      .mockResolvedValueOnce({
        previewToken: 'tok-1',
        preview: { title: 'Hunt incident', description: '', entities: [] },
        action: 'escalate_incident',
        eventCount: 1,
        warnings: [],
      })
      .mockResolvedValueOnce({
        actionId: 'aud-9',
        resultType: 'incident',
        resultId: '42',
        status: 'created',
        url: '/incidents/42',
      });
  });

  it('previews then executes escalate_incident for create_incident', async () => {
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
    expect(post).toHaveBeenNthCalledWith(2, '/ha-hunts/actions', {
      action: 'escalate_incident',
      eventIds: ['evt-1'],
      searchId: 'HUNT-1',
      title: 'SSH brute force',
      description: 'Repeated authentication failures',
      previewToken: 'tok-1',
      parameters: undefined,
    });
    expect(result).toEqual({ targetId: '42', auditId: 'aud-9' });
  });
});
