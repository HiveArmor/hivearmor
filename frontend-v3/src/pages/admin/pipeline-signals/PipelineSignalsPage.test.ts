import { describe, it, expect } from 'vitest';

import type { PipelineSignalsDTO } from './PipelineSignalsPage';

describe('PipelineSignalsDTO contract shape', () => {
  it('accepts measured-only fields without inventing thresholds', () => {
    const sample: PipelineSignalsDTO = {
      recordedAt: '2026-08-21T09:00:00Z',
      backendStatus: 'UP',
      opensearchStatus: 'yellow',
      opensearchUnassignedShards: 0,
      opensearchStoreBytes: 4700000,
      postgresHivearmorBytes: 9000000,
      consumerGroupLags: [{ group: 'eventprocessor', totalLag: 0 }],
      topics: ['hivearmor.raw.events'],
      hostSamplePath: '/var/hivearmor-slo-soak/latest.json',
      hostSampleRecordedAt: '2026-08-21T09:00:00Z',
      hostSampleStatus: 'script-complete',
      soakHistory: [
        {
          recordedAt: '2026-08-21T09:00:00Z',
          opensearchStatus: 'yellow',
          opensearchStoreBytes: 4700000,
          consumerLag: 0,
          sampleFile: 'sample-20260821T090000Z.json',
        },
      ],
      soakSpanHours: 0,
      soakSampleCount: 1,
      limitations: ['Measured signals only — no invented SLO pass/fail thresholds'],
    };
    expect(sample.consumerGroupLags[0]?.totalLag).toBe(0);
    expect(sample.soakSampleCount).toBe(1);
    expect(sample.limitations[0]).toMatch(/no invented SLO/i);
  });
});
