/**
 * Detection Next-items service + component smoke tests.
 */
import { describe, it, expect } from 'vitest';

describe('detectionException.service', () => {
  it('exports preview, list, save, and activate helpers', async () => {
    const module = await import('@/services/detectionException.service');
    expect(typeof module.previewExceptionImpact).toBe('function');
    expect(typeof module.listExceptions).toBe('function');
    expect(typeof module.saveException).toBe('function');
    expect(typeof module.setExceptionActive).toBe('function');
  });
});

describe('detectionPipeline.service', () => {
  it('exports fetchDetectionPipelineHealth', async () => {
    const module = await import('@/services/detectionPipeline.service');
    expect(typeof module.fetchDetectionPipelineHealth).toBe('function');
  });
});

describe('RuleTuningPanel', () => {
  it('exports RuleTuningPanel component', async () => {
    const module = await import('./components/RuleTuningPanel');
    expect(typeof module.RuleTuningPanel).toBe('function');
  });
});

describe('DetectionPipelineHealthStrip', () => {
  it('exports DetectionPipelineHealthStrip component', async () => {
    const module = await import('./components/DetectionPipelineHealthStrip');
    expect(typeof module.DetectionPipelineHealthStrip).toBe('function');
  });
});

describe('detectionRules.capabilities next flags', () => {
  it('enables persist and observability gates', async () => {
    const module = await import('./detectionRules.capabilities');
    expect(module.DET_EXCEPTION_PERSIST).toBe(true);
    expect(module.DET_OBS_PIPELINE_HEALTH).toBe(true);
  });
});
