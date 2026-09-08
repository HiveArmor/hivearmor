import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PivotTemplatesMenu } from './PivotTemplatesMenu';
import type { HuntFieldDefinition } from '../searchHunt.types';

const fullSchema: HuntFieldDefinition[] = [
  { name: 'user.name', label: 'User', type: 'keyword', category: 'identity', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'host.name', label: 'Host', type: 'keyword', category: 'host', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'event.action', label: 'Action', type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'event.category', label: 'Category', type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'event.outcome', label: 'Outcome', type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'process.name', label: 'Process', type: 'keyword', category: 'process', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'source.geo.country_name', label: 'Country', type: 'keyword', category: 'network', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'destination.port', label: 'Dest port', type: 'number', category: 'network', description: '', operators: [':'], coverage: 100 },
  { name: 'data_stream.dataset', label: 'Dataset', type: 'keyword', category: 'source', description: '', operators: [':', '!='], coverage: 100 },
  { name: '@timestamp', label: 'Timestamp', type: 'date', category: 'event', description: '', operators: [':', '>', '<'], coverage: 100 },
];

describe('PivotTemplatesMenu', () => {
  it('opens the menu and applies a template', () => {
    const onApply = vi.fn();
    render(<PivotTemplatesMenu fields={fullSchema} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /templates/i }));
    const item = screen.getByRole('menuitem', { name: /auth failures by user × host/i });
    fireEvent.click(item);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].id).toBe('auth-user-host');
  });

  it('disables a template when no axis field exists in the current schema', () => {
    // Minimal schema: only host.name exists → templates needing other fields are still applicable if
    // ONE axis matches, but a template with neither axis present is disabled.
    const minimal: HuntFieldDefinition[] = [
      { name: 'host.name', label: 'Host', type: 'keyword', category: 'host', description: '', operators: [':', '!='], coverage: 100 },
    ];
    render(<PivotTemplatesMenu fields={minimal} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /templates/i }));
    // "Traffic by source country × destination port" needs neither host.name axis → disabled.
    const traffic = screen.getByRole('menuitem', { name: /traffic by source country/i });
    expect(traffic).toBeDisabled();
    // "Process activity by host × process" has host.name as an axis → still enabled.
    const process = screen.getByRole('menuitem', { name: /process activity by host/i });
    expect(process).not.toBeDisabled();
  });
});
