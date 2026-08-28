/**
 * intelligenceFinding.service.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/apiClient';
import {
  intelligenceFindingService,
  isUnconfiguredFinding,
} from '@/services/intelligenceFinding.service';

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

describe('intelligenceFinding.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getFinding uses /ha-intelligence/findings/{id}', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      id: 1,
      facts: [],
      inferences: [],
      contradictions: [],
      missingEvidence: [],
      confidence: 0.5,
      sources: [],
    });

    await intelligenceFindingService.getFinding(1);

    expect(apiClient.get).toHaveBeenCalledWith('/ha-intelligence/findings/1', expect.any(Object));
  });

  it('detects unconfigured SOC AI findings', () => {
    expect(
      isUnconfiguredFinding({
        provenance: 'soc-ai-unconfigured',
        facts: [{ text: 'not configured' }],
        inferences: [],
        contradictions: [],
        missingEvidence: [],
        confidence: 0,
        sources: [],
      })
    ).toBe(true);
  });
});
