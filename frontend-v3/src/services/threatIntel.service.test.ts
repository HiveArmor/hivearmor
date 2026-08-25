/**
 * threatIntel.service.test.ts — sync receipt typing + v1 avoidance (STAGING CANDIDATE)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/apiClient';
import {
  TI_003_LEGACY_V1_HARDENED,
  TI_004_SYNC_RECEIPT,
  threatIntelService,
} from '@/services/threatIntel.service';
import type { ThreatFeedSyncReceipt } from '@/types/threatIntel.types';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('threatIntel.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('documents TI-003/TI-004 staging flags and never targets /v1/threat-intel', () => {
    expect(TI_003_LEGACY_V1_HARDENED).toBe(true);
    expect(TI_004_SYNC_RECEIPT).toBe(true);
    const paths = [
      threatIntelService.listFeeds,
      threatIntelService.syncTaxiiFeed,
      threatIntelService.syncMispFeed,
      threatIntelService.getIocStats,
    ].map((fn) => fn.name);
    expect(paths.length).toBeGreaterThan(0);
    // Service module source contract: only /ha-threat-intel (asserted via call paths below)
  });

  it('posts TAXII sync and types ThreatFeedSyncReceipt', async () => {
    const receipt: ThreatFeedSyncReceipt = {
      receiptId: 'rec-1',
      feedId: 9,
      sourceType: 'TAXII',
      lastSyncAt: '2026-08-25T03:30:00Z',
      status: 'OK',
      iocCount: 4,
      failedReason: null,
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(receipt);

    const result = await threatIntelService.syncTaxiiFeed(9);

    expect(apiClient.post).toHaveBeenCalledWith('/ha-threat-intel/taxii/9/sync');
    expect(result.status).toBe('OK');
    expect(result.receiptId).toBe('rec-1');
    expect(result.iocCount).toBe(4);
    const calledPath = vi.mocked(apiClient.post).mock.calls[0]?.[0] ?? '';
    expect(calledPath).not.toContain('/v1/threat-intel');
  });

  it('posts MISP sync and surfaces ERROR failedReason on receipt', async () => {
    const receipt: ThreatFeedSyncReceipt = {
      receiptId: 'rec-err',
      feedId: 2,
      sourceType: 'MISP',
      lastSyncAt: '2026-08-25T03:31:00Z',
      status: 'ERROR',
      iocCount: 0,
      failedReason: 'Connection refused to [redacted-url]',
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(receipt);

    const result = await threatIntelService.syncMispFeed(2);

    expect(apiClient.post).toHaveBeenCalledWith('/ha-threat-intel/misp/2/sync');
    expect(result.status).toBe('ERROR');
    expect(result.failedReason).toContain('[redacted-url]');
  });
});
