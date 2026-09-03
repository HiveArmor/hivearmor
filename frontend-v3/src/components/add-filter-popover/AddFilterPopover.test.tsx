/**
 * AddFilterPopover tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { AddFilterPopover } from './AddFilterPopover';

import { selectHaOption } from '@/test/haCompactSelect.testutil';

describe('AddFilterPopover', () => {
  it('should render the Add filter button', () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    expect(screen.getByRole('button', { name: 'Add filter' })).toBeDefined();
  });

  it('should open popover when button clicked', () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    expect(screen.getByRole('button', { name: 'Field' })).toBeDefined();
  });

  it('should show operator and value inputs after selecting field', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));
    selectHaOption('Field', 'Severity');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Operator' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Value' })).toBeDefined();
    });
  });

  it('should show an enum dropdown (listbox) for the severity field value', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));
    selectHaOption('Field', 'Severity');

    await waitFor(() => {
      // Value is now a token-styled dropdown button, not a native <select>.
      const valueTrigger = screen.getByRole('button', { name: 'Value' });
      expect(valueTrigger).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Value' }));
    expect(screen.getByRole('listbox', { name: 'Value' })).toBeInTheDocument();
  });

  it('should show text input for text field', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));
    selectHaOption('Field', 'Alert Title');

    await waitFor(() => {
      const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
      expect(valueInput.tagName).toBe('INPUT');
      expect(valueInput.type).toBe('text');
    });
  });

  it('should call onAddFilter when form submitted', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));
    selectHaOption('Field', 'Severity');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Value' })).toBeDefined();
    });
    selectHaOption('Value', 'Critical');

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));

    expect(onAddFilter).toHaveBeenCalledWith({
      field: 'severity',
      paramKey: 'severity',
      label: 'Severity',
      operator: 'is',
      value: 'critical',
      conjunction: 'AND',
    });
  });

  it('supports joining a new condition with OR', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover hasExistingExpression onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));
    fireEvent.click(screen.getByRole('button', { name: /OR Match either/ }));
    selectHaOption('Field', 'Status');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Value' })).toBeDefined();
    });
    selectHaOption('Value', 'In review');
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));

    expect(onAddFilter).toHaveBeenCalledWith(expect.objectContaining({
      field: 'status',
      value: 'in_review',
      conjunction: 'OR',
    }));
  });

  it('should disable Add button when no field selected', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: 'Add condition' }) as HTMLButtonElement;
      expect(addButton.disabled).toBe(true);
    });
  });

  it('should close popover when Cancel clicked', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Field' })).toBeDefined();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Field' })).toBeNull();
    });
  });
});
