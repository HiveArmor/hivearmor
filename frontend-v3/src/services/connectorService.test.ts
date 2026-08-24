import { describe, expect, it, vi } from 'vitest';

import { connectorService } from '@/services/connectorService';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '@/lib/apiClient';

describe('connectorService', () => {
  it('lists catalog from /ha-connectors/catalog', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    await connectorService.listCatalog();
    expect(apiClient.get).toHaveBeenCalledWith('/ha-connectors/catalog', expect.any(Object));
  });

  it('posts instance create without reading secrets back', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      id: 1,
      secretFieldsConfigured: ['client_secret'],
      configPublic: { base_url: 'https://api.crowdstrike.com' },
    });
    const created = await connectorService.create({
      connectorId: 'crowdstrike',
      name: 'CS prod',
      config: { client_id: 'a', client_secret: 'b', base_url: 'https://api.crowdstrike.com' },
    });
    expect(apiClient.post).toHaveBeenCalledWith('/ha-connectors/instances', expect.any(Object));
    expect(created).not.toHaveProperty('client_secret');
  });
});
