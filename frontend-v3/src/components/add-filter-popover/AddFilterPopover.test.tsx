/**
 * AddFilterPopover tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { AddFilterPopover } from './AddFilterPopover';

describe('AddFilterPopover', () => {
  it('should render the Add filter button', () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    expect(screen.getByRole('button', { name: 'Add filter' })).toBeDefined();
  });

  it('should open popover when button clicked', () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    const button = screen.getByLabelText('Add filter');
    fireEvent.click(button);

    expect(screen.getByLabelText('Field')).toBeDefined();
  });

  it('should show operator and value inputs after selecting field', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    const fieldSelect = screen.getByLabelText('Field');
    fireEvent.change(fieldSelect, { target: { value: 'severity' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Operator')).toBeDefined();
      expect(screen.getByLabelText('Value')).toBeDefined();
    });
  });

  it('should show enum dropdown for severity field', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    const fieldSelect = screen.getByLabelText('Field');
    fireEvent.change(fieldSelect, { target: { value: 'severity' } });

    await waitFor(() => {
      const valueSelect = screen.getByLabelText('Value') as HTMLSelectElement;
      expect(valueSelect.tagName).toBe('SELECT');
    });
  });

  it('should show text input for text field', async () => {
    const onAddFilter = vi.fn();
    render(<AddFilterPopover onAddFilter={onAddFilter} />);

    fireEvent.click(screen.getByLabelText('Add filter'));

    const fieldSelect = screen.getByLabelText('Field');
    fireEvent.change(fieldSelect, { target: { value: 'title' } });

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

    // Select field
    const fieldSelect = screen.getByLabelText('Field');
    fireEvent.change(fieldSelect, { target: { value: 'severity' } });

    // Wait for value field to appear and select value
    await waitFor(() => {
      const valueSelect = screen.getByLabelText('Value');
      fireEvent.change(valueSelect, { target: { value: 'critical' } });
    });

    // Click Add button
    const addButton = screen.getByRole('button', { name: 'Add condition' });
    fireEvent.click(addButton);

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
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'status' } });
    fireEvent.change(await screen.findByLabelText('Value'), { target: { value: 'in_review' } });
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
      expect(screen.getByLabelText('Field')).toBeDefined();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByLabelText('Field')).toBeNull();
    });
  });
});
