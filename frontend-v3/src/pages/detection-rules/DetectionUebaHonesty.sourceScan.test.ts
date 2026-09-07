import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DETECTION_UEBA_JOB_SENTENCE } from './components/DetectionUebaPanel';

import { UEBA_MODEL_HONESTY } from '@/services/ueba.capabilities';

describe('Detection Engineering UEBA honesty', () => {
  const panel = readFileSync(join(process.cwd(), 'src/pages/detection-rules/components/DetectionUebaPanel.tsx'), 'utf8');
  const coverage = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionCoverageView.tsx'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/ueba.service.ts'), 'utf8');

  it('states detection-path assist without claiming a trained EP model', () => {
    expect(DETECTION_UEBA_JOB_SENTENCE).toMatch(/z-score/i);
    expect(DETECTION_UEBA_JOB_SENTENCE).toMatch(/Not a trained model/i);
    expect(UEBA_MODEL_HONESTY).toMatch(/SOC AI is assist/i);
    expect(panel).toContain('DETECTION_UEBA_JOB_SENTENCE');
    expect(panel).toContain('detection-ueba-honesty');
  });

  it('does not invent ML confidence scores or call legacy /api/uba', () => {
    expect(panel).not.toMatch(/mlScore|confidenceScore|modelConfidence/i);
    expect(service).not.toContain('/api/uba');
    expect(coverage).toContain('coverage-ueba-link');
    expect(coverage).toContain('UEBA baselines');
  });
});
