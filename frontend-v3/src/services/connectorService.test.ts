import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/apiClient';
import { connectorService } from '@/services/connectorService';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('connectorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('lists staged alerts for an instance', async () => {
    const response = {
      alerts: [
        {
          id: 10,
          connectorInstanceId: 3,
          connectorId: 'crowdstrike',
          externalId: 'det-1',
          title: 'Suspicious exe',
          severity: 'high',
          hostname: null,
          srcIp: null,
          alertCreatedAt: '2026-08-24T12:00:00Z',
          ingestBatchId: 'batch-1',
          ingestedAt: '2026-08-24T12:01:00Z',
          status: 'PENDING',
          destination: 'ha_connector_alert_staging',
        },
      ],
      count: 1,
      destination: 'ha_connector_alert_staging',
      persisted: true,
      note: 'ADR-20260824 staging queue — not customer OpenSearch alert index',
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(response);

    const result = await connectorService.listStagedAlerts(3, { limit: 25 });

    expect(apiClient.get).toHaveBeenCalledWith('/ha-connectors/instances/3/staged-alerts', {
      signal: undefined,
      params: { limit: 25 },
    });
    expect(result.count).toBe(1);
    expect(result.alerts[0]?.status).toBe('PENDING');
    expect(result.destination).toBe('ha_connector_alert_staging');
  });

  it('promotes one staged alert', async () => {
    const promoteResult = {
      promoteBatchId: 'pb-1',
      requested: 1,
      promoted: 1,
      failed: 0,
      skipped: 0,
      destinationIndex: 'v3-hive-connector-promoted-2026.08.24',
      indexType: 'connector-promoted',
      documentKind: 'connector_staging_promoted',
      correlationStatus: 'not_correlated',
      note: 'labeled connector-promoted docs only',
      results: [{ id: 10, status: 'PROMOTED', promotedIndex: 'v3-hive-connector-promoted-2026.08.24' }],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(promoteResult);

    const result = await connectorService.promoteStagedAlert(10);

    expect(apiClient.post).toHaveBeenCalledWith('/ha-connectors/staged-alerts/10/promote', {});
    expect(result.promoted).toBe(1);
    expect(result.indexType).toBe('connector-promoted');
    expect(result.destinationIndex).toContain('connector-promoted');
    expect(result.destinationIndex).not.toContain('v3-hive-alert');
  });

  it('promotes a batch of staged alerts by ids', async () => {
    const promoteResult = {
      promoteBatchId: 'pb-2',
      requested: 2,
      promoted: 1,
      failed: 1,
      skipped: 0,
      destinationIndex: 'v3-hive-connector-promoted-2026.08.24',
      indexType: 'connector-promoted',
      documentKind: 'connector_staging_promoted',
      correlationStatus: 'not_correlated',
      note: 'labeled connector-promoted docs only',
      results: [
        { id: 10, status: 'PROMOTED' },
        { id: 11, status: 'FAILED', error: 'write failed' },
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(promoteResult);

    const result = await connectorService.promoteStagedAlerts([10, 11]);

    expect(apiClient.post).toHaveBeenCalledWith('/ha-connectors/staged-alerts/promote', {
      ids: [10, 11],
    });
    expect(result.requested).toBe(2);
    expect(result.promoted).toBe(1);
    expect(result.failed).toBe(1);
  });
});
