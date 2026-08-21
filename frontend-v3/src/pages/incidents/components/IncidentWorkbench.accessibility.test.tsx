import { fireEvent, render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { IncidentEvidencePanel } from './IncidentEvidencePanel';
import { IncidentTimelinePanel } from './IncidentTimelinePanel';
import { foundationEvidence, foundationTimeline } from '../incidentDetail.fixtures';

async function expectNoSeriousViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  const serious = result.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(serious.map(({ id, impact, help }) => ({ id, impact, help }))).toEqual([]);
}

describe('Incident Workbench investigation components', () => {
  it('exposes an accessible selectable evidence index and detail region', async () => {
    const { container, getByRole, getByText } = render(
      <IncidentEvidencePanel
        items={foundationEvidence}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        onAddEvidence={vi.fn()}
        canEdit
      />
    );

    fireEvent.click(getByRole('option', { name: /Unknown device fingerprint/ }));
    expect(getByRole('heading', { name: 'Unknown device fingerprint' })).toBeInTheDocument();
    expect(getByText(/has not been observed for this identity/)).toBeInTheDocument();
    await expectNoSeriousViolations(container);
  });

  it('exposes timeline events as an ordered attack story', async () => {
    const { container, getByRole, getAllByRole } = render(
      <IncidentTimelinePanel
        events={foundationTimeline}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />
    );

    expect(getByRole('region', { name: 'Incident activity timeline' })).toBeInTheDocument();
    expect(getAllByRole('listitem')).toHaveLength(foundationTimeline.length);
    await expectNoSeriousViolations(container);
  });
});
