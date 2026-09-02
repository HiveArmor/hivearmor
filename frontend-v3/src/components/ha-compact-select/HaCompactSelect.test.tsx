import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HaCompactSelect } from './HaCompactSelect';

const OPTIONS = [
  { value: 'all', label: 'All ownership' },
  { value: 'mine', label: 'Assigned to me' },
];

describe('HaCompactSelect', () => {
  it('renders a token-styled trigger (not a native select) showing the selected label', () => {
    render(
      <HaCompactSelect ariaLabel="Ownership" label="Ownership" value="all" options={OPTIONS} onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole('button', { name: 'Ownership' });
    expect(trigger).toBeInTheDocument();
    // No native <select> is rendered anymore.
    expect(document.querySelector('select')).toBeNull();
    expect(trigger).toHaveTextContent('All ownership');
  });

  it('opens a listbox and returns the selected typed value on click', () => {
    const onChange = vi.fn();
    render(
      <HaCompactSelect ariaLabel="Ownership" value="all" options={OPTIONS} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ownership' }));
    const listbox = screen.getByRole('listbox', { name: 'Ownership' });
    expect(listbox).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Assigned to me' }));
    expect(onChange).toHaveBeenCalledWith('mine');
  });

  it('marks the current value as the selected option', () => {
    render(
      <HaCompactSelect ariaLabel="Ownership" value="mine" options={OPTIONS} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ownership' }));
    expect(screen.getByRole('option', { name: 'Assigned to me' })).toHaveAttribute('aria-selected', 'true');
  });

  it('supports arrow-key navigation and Enter to select', () => {
    const onChange = vi.fn();
    render(
      <HaCompactSelect ariaLabel="Ownership" value="all" options={OPTIONS} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ownership' }));
    const listbox = screen.getByRole('listbox', { name: 'Ownership' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('mine');
  });
});
