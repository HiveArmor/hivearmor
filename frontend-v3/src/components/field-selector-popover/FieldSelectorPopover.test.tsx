/**
 * FieldSelectorPopover tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { ColDef } from 'ag-grid-community';
import { describe, it, expect, vi } from 'vitest';

import { FieldSelectorPopover } from './FieldSelectorPopover';

const mockColumns: ColDef[] = [
  { headerName: 'Source Process', colId: 'adversary.processName' },
  { headerName: 'Tags', colId: 'tags' },
  { headerName: 'Source Hash', colId: 'adversary.hash' },
];

describe('FieldSelectorPopover', () => {
  it('should render "Fields" button', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={mockColumns}
        selectedColIds={[]}
        onToggleColumn={onToggleColumn}
      />
    );

    expect(screen.getByLabelText('Select columns')).toBeDefined();
    expect(screen.getByText('Fields')).toBeDefined();
  });

  it('should open popover when button clicked', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={mockColumns}
        selectedColIds={[]}
        onToggleColumn={onToggleColumn}
      />
    );

    const button = screen.getByLabelText('Select columns');
    fireEvent.click(button);

    expect(screen.getByText('Optional Columns')).toBeDefined();
  });

  it('should render all optional columns as checkboxes', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={mockColumns}
        selectedColIds={[]}
        onToggleColumn={onToggleColumn}
      />
    );

    fireEvent.click(screen.getByLabelText('Select columns'));

    expect(screen.getByText('Source Process')).toBeDefined();
    expect(screen.getByText('Tags')).toBeDefined();
    expect(screen.getByText('Source Hash')).toBeDefined();
  });

  it('should show checked state for selected columns', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={mockColumns}
        selectedColIds={['tags']}
        onToggleColumn={onToggleColumn}
      />
    );

    fireEvent.click(screen.getByLabelText('Select columns'));

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const tagsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Tags');
    });

    expect(tagsCheckbox?.checked).toBe(true);
  });

  it('should call onToggleColumn when checkbox clicked', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={mockColumns}
        selectedColIds={[]}
        onToggleColumn={onToggleColumn}
      />
    );

    fireEvent.click(screen.getByLabelText('Select columns'));

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onToggleColumn).toHaveBeenCalledWith('adversary.processName');
  });

  it('should render empty state when no optional columns', () => {
    const onToggleColumn = vi.fn();
    render(
      <FieldSelectorPopover
        optionalColumns={[]}
        selectedColIds={[]}
        onToggleColumn={onToggleColumn}
      />
    );

    fireEvent.click(screen.getByLabelText('Select columns'));

    expect(screen.getByText('Optional Columns')).toBeDefined();
    expect(screen.queryAllByRole('checkbox').length).toBe(0);
  });
});
