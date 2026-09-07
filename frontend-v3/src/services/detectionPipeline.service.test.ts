import { describe, expect, it } from 'vitest';

import {
  formatLatencyMs,
  formatMissRate,
  parseDetectionPipelineHealth,
  parseIngestAlertSlo,
  unavailableIngestAlertSlo,
} from '@/services/detectionPipeline.service';

describe('DET-SLO-001 ingest→alert SLO parse', () => {
  it('keeps p50/p95 null when SLO is not measurable', () => {
    const slo = parseIngestAlertSlo({
      available: false,
      sampleCount: 0,
      p50Ms: 0,
      p95Ms: 0,
      breached: false,
      honesty: 'not measurable yet',
    });
    expect(slo.available).toBe(false);
    expect(slo.p50Ms).toBeNull();
    expect(slo.p95Ms).toBeNull();
    expect(slo.breached).toBeNull();
    expect(formatLatencyMs(slo.p50Ms)).toBe('unavailable');
    expect(formatLatencyMs(slo.p95Ms)).toBe('unavailable');
    expect(slo.honesty).toMatch(/not measurable/);
  });

  it('does not invent zeros from a missing ingestAlertSlo object', () => {
    const health = parseDetectionPipelineHealth({
      available: false,
      mode: 'unavailable',
      status: 'unavailable',
      honesty: 'event-processor unreachable',
      indexPatternConstraint: 'v3-hive-<type>-YYYY.MM.DD',
    });
    expect(health.ingestAlertSlo.available).toBe(false);
    expect(health.ingestAlertSlo.p50Ms).toBeNull();
    expect(health.ingestAlertSlo.p95Ms).toBeNull();
    expect(health.afterEventsMisses).toBeNull();
    expect(health.afterEventsMissRate).toBeNull();
    expect(health.correlationChecks).toBeNull();
    expect(health.indexPatternConstraint).toBe('v3-hive-<type>-YYYY.MM.DD');
  });

  it('surfaces measurable p50/p95 and breach flag', () => {
    const slo = parseIngestAlertSlo({
      available: true,
      sampleCount: 128,
      p50Ms: 840,
      p95Ms: 61_000,
      targetP95Ms: 60_000,
      breached: true,
      skippedUnmeasurable: 2,
      window: 'last_1024_alert_persists',
      honesty: 'live histogram',
    });
    expect(slo.available).toBe(true);
    expect(slo.p50Ms).toBe(840);
    expect(slo.p95Ms).toBe(61_000);
    expect(slo.breached).toBe(true);
    expect(formatLatencyMs(slo.p50Ms)).toBe('840ms');
    expect(formatLatencyMs(slo.p95Ms)).toBe('61.0s');
    expect(formatLatencyMs(slo.targetP95Ms)).toBe('60.0s');
  });

  it('unavailableIngestAlertSlo never reports a green histogram', () => {
    const slo = unavailableIngestAlertSlo();
    expect(slo.available).toBe(false);
    expect(slo.p50Ms).toBeNull();
    expect(slo.breached).toBeNull();
  });
});

describe('DET-INDEX-001b afterEvents miss counters', () => {
  it('surfaces miss rate only when the engine marked it measurable', () => {
    const health = parseDetectionPipelineHealth({
      available: true,
      mode: 'event_processor',
      status: 'ok',
      afterEventsMisses: 18,
      afterEventsErrors: 2,
      correlationChecks: 1284,
      afterEventsMissRate: 18 / 1284,
      afterEventsMissRateAvailable: true,
      ingestAlertSlo: { available: false },
      indexPatternConstraint: 'v3-hive-<type>-YYYY.MM.DD',
    });
    expect(health.afterEventsMisses).toBe(18);
    expect(health.afterEventsErrors).toBe(2);
    expect(health.correlationChecks).toBe(1284);
    expect(health.afterEventsMissRateAvailable).toBe(true);
    expect(health.afterEventsMissRate).toBeCloseTo(18 / 1284);
    expect(formatMissRate(health.afterEventsMissRate, health.afterEventsMissRateAvailable)).toBe('1.40%');
  });

  it('does not treat missing miss-rate as 0%', () => {
    const health = parseDetectionPipelineHealth({
      available: true,
      mode: 'event_processor',
      status: 'ok',
      afterEventsMissRate: 0,
      afterEventsMissRateAvailable: false,
      ingestAlertSlo: { available: false },
    });
    expect(health.afterEventsMissRate).toBeNull();
    expect(formatMissRate(health.afterEventsMissRate, health.afterEventsMissRateAvailable)).toBe('unavailable');
  });

  it('keeps the OpenSearch index pattern constraint unchanged', () => {
    const health = parseDetectionPipelineHealth({
      available: true,
      mode: 'event_processor',
      status: 'ok',
      ingestAlertSlo: { available: false },
    });
    expect(health.indexPatternConstraint).toBe('v3-hive-<type>-YYYY.MM.DD');
  });
});
