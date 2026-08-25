/**
 * Vitest tests for EntityTimelineRoutePage deep-link honesty.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EntityTimelineRoutePage } from '../EntityTimelineRoutePage';

vi.mock('@/pages/ueba/entity-timeline/EntityTimelinePage', () => ({
  EntityTimelinePage: (props: { userId: string }) => (
    <div data-testid="entity-timeline-page" data-user-id={props.userId}>
      EntityTimelinePage for {props.userId}
    </div>
  ),
}));

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ueba/entity-timeline" element={<EntityTimelineRoutePage />} />
        <Route path="/ueba/risk" element={<div data-testid="risk-dashboard">Risk</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntityTimelineRoutePage', () => {
  it('renders EntityTimelinePage when userId query is present', () => {
    renderAt('/ueba/entity-timeline?userId=user-alpha');
    const timeline = screen.getByTestId('entity-timeline-page');
    expect(timeline).toHaveAttribute('data-user-id', 'user-alpha');
    expect(screen.getByText('Entity Timeline')).toBeVisible();
  });

  it('redirects to UEBA Risk when userId is missing', () => {
    renderAt('/ueba/entity-timeline');
    expect(screen.getByTestId('risk-dashboard')).toBeVisible();
    expect(screen.queryByTestId('entity-timeline-page')).not.toBeInTheDocument();
  });

  it('does not expose ROLE_ constants in page copy', () => {
    renderAt('/ueba/entity-timeline?userId=user-alpha');
    expect(document.body.textContent).not.toMatch(/ROLE_/);
  });
});
