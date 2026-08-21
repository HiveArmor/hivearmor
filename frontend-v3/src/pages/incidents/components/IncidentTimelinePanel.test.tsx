import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IncidentTimelinePanel } from './IncidentTimelinePanel';

describe('IncidentTimelinePanel', () => {
  it('renders timeline events that lack ids without crashing', () => {
    const { container } = render(
      <IncidentTimelinePanel
        events={[
          { id: undefined as unknown as string, timestamp: '2026-08-05T14:03:00Z', actor: 'system', description: 'Opened' },
          { id: undefined as unknown as string, timestamp: '2026-08-05T13:07:00Z', actor: 'system', description: 'Updated' },
        ]}
        isLoading={false}
        isError={false}
        onRetry={() => undefined}
      />,
    );
    expect(container.querySelectorAll('.incident-timeline__event')).toHaveLength(2);
  });
});
