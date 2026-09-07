/**
 * Detection exception service + RuleTuningPanel smoke tests.
 */
import { describe, it, expect } from 'vitest';

describe('detectionException.service', () => {
  it('exports previewExceptionImpact', async () => {
    const module = await import('@/services/detectionException.service');
    expect(typeof module.previewExceptionImpact).toBe('function');
  });
});

describe('RuleTuningPanel', () => {
  it('exports RuleTuningPanel component', async () => {
    const module = await import('./components/RuleTuningPanel');
    expect(typeof module.RuleTuningPanel).toBe('function');
  });
});
