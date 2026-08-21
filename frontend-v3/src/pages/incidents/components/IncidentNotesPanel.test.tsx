import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./ActivityFeed', () => ({
  ActivityFeed: ({ incidentId, initialTypes }: { incidentId: string; initialTypes?: string[] }) => (
    <div data-testid="activity-feed">{incidentId}:{initialTypes?.join(',') ?? ''}</div>
  ),
}));

import { IncidentNotesPanel } from './IncidentNotesPanel';

describe('IncidentNotesPanel', () => {
  it('renders the activity feed filtered to notes', () => {
    render(<IncidentNotesPanel incidentId="inc-12" />);
    expect(screen.getByTestId('activity-feed')).toHaveTextContent('inc-12:note');
  });
});
