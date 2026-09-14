/**
 * endpointAiAssessment.service tests (SPEC-08, W7).
 *
 * The load-bearing logic is HONESTY CLASSIFICATION: mapping the real
 * /ha-soc-ai/query response (including its graceful "unavailable" fallback) into
 * one of three outcomes, and NEVER fabricating a verdict. Auth errors (401/403)
 * must propagate so the app's auth handling still fires.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchEndpointAiAssessment } from './endpointAiAssessment.service';

import { ApiError } from '@/lib/apiClient';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/services/socAi.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/socAi.service')>();
  return {
    ...actual, // keep the real isSocAiUnavailableAnswer honesty detector
    socAiService: { query: mocks.query },
  };
});

describe('fetchEndpointAiAssessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a substantive grounded answer as "answered"', async () => {
    mocks.query.mockResolvedValue({
      answer: 'Elevated process-creation activity from an unsigned binary.',
      confidence: 72,
      sources: ['process.create · unsigned binary'],
      durationMs: 1180,
      finding: {} as never,
    });
    const result = await fetchEndpointAiAssessment('host-1');
    expect(result.outcome).toBe('answered');
    expect(result.confidence).toBe(72);
    expect(result.sources).toHaveLength(1);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('classifies the graceful "not configured" fallback as "unavailable" (never a verdict)', async () => {
    mocks.query.mockResolvedValue({
      answer: 'AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.',
      confidence: 0,
      sources: [],
      durationMs: 0,
      finding: {} as never,
    });
    const result = await fetchEndpointAiAssessment('host-1');
    expect(result.outcome).toBe('unavailable');
    expect(result.confidence).toBe(0);
  });

  it('classifies a confident-less / source-less answer as "inconclusive"', async () => {
    mocks.query.mockResolvedValue({
      answer: 'Insufficient recent telemetry to assess this endpoint.',
      confidence: 0,
      sources: [],
      durationMs: 640,
      finding: {} as never,
    });
    // Not the "unavailable" keywords → honest inconclusive, not a fabricated verdict.
    const result = await fetchEndpointAiAssessment('host-1');
    expect(result.outcome).toBe('inconclusive');
  });

  it('maps a network/5xx error to an honest "unavailable" outcome rather than throwing', async () => {
    mocks.query.mockRejectedValue(new Error('network down'));
    const result = await fetchEndpointAiAssessment('host-1');
    expect(result.outcome).toBe('unavailable');
    expect(result.answer).toMatch(/unavailable/i);
  });

  it('re-throws 401/403 so app auth handling still applies', async () => {
    mocks.query.mockRejectedValue(new ApiError(403, { status: 403, message: 'forbidden' }));
    await expect(fetchEndpointAiAssessment('host-1')).rejects.toBeInstanceOf(ApiError);
  });
});
