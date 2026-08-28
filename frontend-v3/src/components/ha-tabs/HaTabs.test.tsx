import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { HaTabs } from './HaTabs';

describe('HaTabs', () => {
  it('switches visible panel when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(
      <HaTabs
        activeKey="lookup"
        onSelect={onSelect}
        tabs={[
          { key: 'lookup', title: 'Look up', content: <div>Lookup panel</div> },
          { key: 'feeds', title: 'Feeds', content: <div>Feeds panel</div> },
        ]}
      />
    );

    expect(screen.getByText('Lookup panel')).toBeVisible();
    expect(screen.getByText('Feeds panel')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Feeds' }));
    expect(onSelect).toHaveBeenCalledWith('feeds');
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <HaTabs
        activeKey="feeds"
        tabs={[
          { key: 'lookup', title: 'Look up', content: <div>Lookup</div> },
          { key: 'feeds', title: 'Feeds', content: <div>Feeds</div> },
        ]}
      />
    );

    expect(screen.getByRole('tab', { name: 'Look up' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Feeds' })).toHaveAttribute('aria-selected', 'true');
    const feedsPanel = document.getElementById('ha-tabpanel-feeds');
    expect(within(feedsPanel as HTMLElement).getByText('Feeds')).toBeVisible();
  });
});
