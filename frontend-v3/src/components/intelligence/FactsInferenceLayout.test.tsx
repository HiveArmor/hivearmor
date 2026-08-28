import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FactsInferenceLayout } from '@/components/intelligence/FactsInferenceLayout';
import type { IntelligenceFindingDTO } from '@/types/intelligenceFinding.types';

const finding: IntelligenceFindingDTO = {
  facts: [{ text: 'IP observed in feed X' }],
  inferences: [{ text: 'Possible C2 activity' }],
  contradictions: [],
  missingEvidence: ['Endpoint telemetry'],
  confidence: 0.6,
  sources: ['feed-x'],
};

describe('FactsInferenceLayout', () => {
  it('renders separate Facts and Inference sections', () => {
    render(<FactsInferenceLayout finding={finding} />);
    expect(screen.getByRole('region', { name: 'Observed facts' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Inferences' })).toBeVisible();
    expect(screen.getByText('IP observed in feed X')).toBeVisible();
    expect(screen.getByText('Possible C2 activity')).toBeVisible();
    expect(screen.getByText('Endpoint telemetry')).toBeVisible();
  });
});
