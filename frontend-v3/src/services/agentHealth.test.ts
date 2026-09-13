import { describe, expect, it } from 'vitest';

import {
  computeCompositeHealth,
  computeFreshness,
  extractSparklineSeries,
  HEALTH_THRESHOLDS,
  worseLevel,
} from '@/services/agentHealth';
import type { AgentVitalsSample } from '@/services/telemetryService';

const NOW = Date.parse('2026-09-13T08:00:00Z');

function sample(overrides: Partial<AgentVitalsSample> = {}, agoMs = 0): AgentVitalsSample {
  return {
    cpuPct: 20,
    ramMb: 512,
    queueDepth: 30,
    eventsPerSec: 100,
    droppedTotal: 0,
    lastError: null,
    appliedPolicyId: 1,
    appliedPolicyVersion: 1,
    sampledAt: new Date(NOW - agoMs).toISOString(),
    ...overrides,
  };
}

describe('worseLevel', () => {
  it('ranks red > amber > unknown > green', () => {
    expect(worseLevel('green', 'red')).toBe('red');
    expect(worseLevel('amber', 'unknown')).toBe('amber');
    expect(worseLevel('unknown', 'green')).toBe('unknown');
  });
});

describe('computeCompositeHealth — the RFM trap guard', () => {
  it('is NEVER green when any dimension is red (CPU red → composite red)', () => {
    const h = computeCompositeHealth([sample({ cpuPct: 99 })], NOW);
    expect(h.level).toBe('red');
    expect(h.level).not.toBe('green');
    expect(h.worst?.id).toBe('cpu');
    // The composite reason names the failing dimension — never a bare green light.
    expect(h.reason).toContain('CPU');
  });

  it('is NEVER green when a reported error is present (errors red → composite red)', () => {
    const h = computeCompositeHealth([sample({ lastError: 'disk full' })], NOW);
    expect(h.level).toBe('red');
    expect(h.reason).toContain('disk full');
  });

  it('is amber (not green) when a dimension is only at-risk', () => {
    const h = computeCompositeHealth([sample({ queueDepth: HEALTH_THRESHOLDS.queueAmber + 1 })], NOW);
    expect(h.level).toBe('amber');
    expect(h.worst?.id).toBe('queue');
  });

  it('is green only when every evaluable dimension is green', () => {
    const h = computeCompositeHealth([sample()], NOW);
    expect(h.level).toBe('green');
    expect(h.reason).toMatch(/healthy/i);
  });

  it('red freshness dominates even when CPU/queue are fine', () => {
    const h = computeCompositeHealth(
      [sample({}, HEALTH_THRESHOLDS.offlineAfterMs + 60_000)],
      NOW,
    );
    expect(h.level).toBe('red');
    expect(h.worst?.id).toBe('freshness');
  });

  it('empty samples → unknown + noVitals, NEVER green', () => {
    const h = computeCompositeHealth([], NOW);
    expect(h.level).toBe('unknown');
    expect(h.level).not.toBe('green');
    expect(h.noVitals).toBe(true);
    expect(h.reason).toMatch(/no vitals/i);
  });
});

describe('computeFreshness thresholds', () => {
  it('fresh under the stale threshold', () => {
    expect(computeFreshness([sample({}, 30_000)], NOW).level).toBe('fresh');
  });
  it('stale between stale and offline thresholds', () => {
    expect(computeFreshness([sample({}, HEALTH_THRESHOLDS.staleAfterMs + 1_000)], NOW).level).toBe('stale');
  });
  it('offline past the offline threshold', () => {
    expect(computeFreshness([sample({}, HEALTH_THRESHOLDS.offlineAfterMs + 1_000)], NOW).level).toBe('offline');
  });
  it('unknown with no sample', () => {
    expect(computeFreshness([], NOW).level).toBe('unknown');
  });
});

describe('extractSparklineSeries', () => {
  it('reverses newest-first to chronological and drops null gaps', () => {
    const samples = [
      sample({ cpuPct: 30 }), // newest
      sample({ cpuPct: null }),
      sample({ cpuPct: 10 }), // oldest
    ];
    expect(extractSparklineSeries(samples, 'cpu')).toEqual([10, 30]);
  });
});
