/**
 * Detection Next-items service + component smoke tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('DET-FP engine enforcement honesty', () => {
  it('RuleTuningPanel copy claims active exceptions are enforced', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/detection-rules/components/RuleTuningPanel.tsx'),
      'utf8',
    );
    expect(source).toContain('enforced by the correlation engine');
    expect(source).toContain('sequence, and graph-offense');
    expect(source).not.toContain('sequence/graph paths not covered');
    expect(source).not.toContain('not yet end-to-end guaranteed');
  });

  it('pipeline health service exposes exception counters', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/detectionPipeline.service.ts'),
      'utf8',
    );
    expect(source).toContain('exceptionsSuppressed');
    expect(source).toContain('activeExceptions');
  });
});
