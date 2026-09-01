import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusDock } from './StatusDock';

describe('StatusDock accessibility', () => {
  it('exposes a status landmark with text labels beyond colour', () => {
    render(<StatusDock sseConnected={true} eps={1243} mode="live" />);

    const dock = screen.getByRole('status');
    expect(dock.getAttribute('aria-label')).toBe('Connected, Live mode, 1243 events per second');
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('includes stale warning in the accessible summary', () => {
    const lastUpdated = new Date(Date.now() - 20 * 60 * 1000);
    render(<StatusDock sseConnected={false} eps={0} mode="historical" lastUpdated={lastUpdated} />);

    const dock = screen.getByRole('status');
    expect(dock.getAttribute('aria-label')).toContain('Disconnected');
    expect(dock.getAttribute('aria-label')).toContain('Historical mode');
    expect(dock.getAttribute('aria-label')).toContain('Last updated 20m ago');
  });
});
