/**
 * socAi.service.test.ts — SOC AI assistive contract
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from '@/lib/apiClient';
import {
  canQuerySocAi,
  formatSocAiHttpHonesty,
  isSocAiUnavailableAnswer,
  socAiService,
} from '@/services/socAi.service';

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  };
});

describe('socAi.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to /ha-soc-ai/query with prompt (not /ha-ai/query)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      answer: 'stub',
      confidence: 0,
      sources: [],
      durationMs: 0,
      finding: {
        facts: [],
        inferences: [],
        contradictions: [],
        missingEvidence: [],
        confidence: 0,
        sources: [],
      },
    });

    await socAiService.query({ prompt: 'What is 8.8.8.8?' });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/ha-soc-ai/query',
      { prompt: 'What is 8.8.8.8?' },
      expect.objectContaining({ signal: undefined })
    );
    const path = vi.mocked(apiClient.post).mock.calls[0]?.[0] as string;
    expect(path).not.toContain('/ha-ai/query');
  });

  it('canQuerySocAi allows Analyst / SOC Manager / Admin only', () => {
    expect(canQuerySocAi(['ROLE_ANALYST'])).toBe(true);
    expect(canQuerySocAi(['ROLE_READ_ONLY'])).toBe(false);
  });

  it('detects unconfigured / unavailable fallback answers', () => {
    expect(
      isSocAiUnavailableAnswer({
        answer: 'AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.',
        confidence: 0,
        sources: [],
        durationMs: 0,
        finding: {
          facts: [{ text: 'AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.' }],
          inferences: [],
          contradictions: [],
          missingEvidence: [],
          confidence: 0,
          sources: [],
          provenance: 'soc-ai-unconfigured',
        },
      })
    ).toBe(true);
    expect(
      isSocAiUnavailableAnswer({
        answer: 'Suspicious IP linked to feed X',
        confidence: 0.8,
        sources: ['feed-x'],
        durationMs: 120,
        finding: {
          facts: [],
          inferences: [{ text: 'Suspicious IP linked to feed X' }],
          contradictions: [],
          missingEvidence: [],
          confidence: 0.8,
          sources: ['feed-x'],
        },
      })
    ).toBe(false);
  });

  it('formats 503 honesty without claiming PRODUCTION READY', () => {
    const message = formatSocAiHttpHonesty(
      new ApiError(503, { status: 503 }, 'Service Unavailable')
    );
    expect(message).toContain('503');
    expect(message).toContain('STAGING CANDIDATE');
  });
});
