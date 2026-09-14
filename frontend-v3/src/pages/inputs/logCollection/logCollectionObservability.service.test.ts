/**
 * logCollectionObservability.service tests (W8 / SPEC-09).
 *
 * The honesty-critical invariant this guards: the detection-consumption count
 * must come from the TRUE rule total (X-Total-Count via countRulesByFilters),
 * NOT the length of a paginated page body — and an unreadable rule query must
 * fail closed to null ("Not reported"), never a fabricated 0. Also verifies
 * that source types no rule declares (agent, kafka) issue NO rule query and
 * carry a note, and that gcp is queried as the real dataType `google`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSources: vi.fn(),
  fetchSensors: vi.fn(),
  countRules: vi.fn(),
}));

vi.mock('@/services/dataSources.service', () => ({
  dataSourcesService: { list: mocks.listSources },
}));
vi.mock('@/services/sensorsService', () => ({
  fetchSensors: mocks.fetchSensors,
}));
vi.mock('@/services/correlation-rules.service', () => ({
  countRulesByFilters: mocks.countRules,
}));

// Force the live path (fixtureMode is import.meta.env-gated → false under vitest).
import { logCollectionObservabilityService } from './logCollectionObservability.service';

function source(id: string, type: string): Record<string, unknown> {
  return {
    id, name: `${id}-name`, type,
    grpcStatus: 'ok', opensearchStatus: 'ok',
    eps: 100, epsHistory: [90, 100, 110], lastEventAt: '2026-09-14T00:00:00Z', enabled: true,
  };
}

describe('logCollectionObservabilityService.load — detection count truthfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSensors.mockResolvedValue({ sensors: [] });
  });

  it('counts detections from the TRUE total, never a capped page length', async () => {
    mocks.listSources.mockResolvedValue([source('src-1', 'aws')]);
    // The endpoint paginates at 20; the true total is 84. A page-length count
    // would read 20. We assert the service surfaces the true total.
    mocks.countRules.mockResolvedValue(84);

    const result = await logCollectionObservabilityService.load();
    const row = result.sources.find((s) => s.id === 'src-1');

    expect(mocks.countRules).toHaveBeenCalledWith({ dataTypes: ['aws'] });
    expect(row?.detection.ruleCount).toBe(84);
    expect(row?.detection.ruleCount).not.toBe(20);
    expect(row?.detection.errored).toBe(false);
  });

  it('queries gcp as the real rule dataType `google`', async () => {
    mocks.listSources.mockResolvedValue([source('src-gcp', 'gcp')]);
    mocks.countRules.mockResolvedValue(49);

    await logCollectionObservabilityService.load();
    expect(mocks.countRules).toHaveBeenCalledWith({ dataTypes: ['google'] });
    expect(mocks.countRules).not.toHaveBeenCalledWith({ dataTypes: ['gcp'] });
  });

  it('fails closed to null (never 0) when the rule query rejects', async () => {
    mocks.listSources.mockResolvedValue([source('src-2', 'azure')]);
    mocks.countRules.mockRejectedValue(new Error('boom'));

    const result = await logCollectionObservabilityService.load();
    const row = result.sources.find((s) => s.id === 'src-2');
    expect(row?.detection.ruleCount).toBeNull();
    expect(row?.detection.errored).toBe(true);
  });

  it('never issues a rule query for transport types no rule declares (agent, kafka)', async () => {
    mocks.listSources.mockResolvedValue([source('src-a', 'agent'), source('src-k', 'kafka')]);

    const result = await logCollectionObservabilityService.load();
    expect(mocks.countRules).not.toHaveBeenCalled();
    for (const row of result.sources) {
      expect(row.detection.ruleCount).toBeNull();
      expect(row.detection.mapping.kind).toBe('not_addressable');
      expect(row.detection.mapping.note).toBeTruthy();
    }
  });

  it('de-dupes the rule query across sources sharing a type', async () => {
    mocks.listSources.mockResolvedValue([source('aws-1', 'aws'), source('aws-2', 'aws')]);
    mocks.countRules.mockResolvedValue(84);

    const result = await logCollectionObservabilityService.load();
    // Two aws sources → one query, both rows carry the same truthful count.
    expect(mocks.countRules).toHaveBeenCalledTimes(1);
    expect(result.sources.every((s) => s.detection.ruleCount === 84)).toBe(true);
  });
});
