import { fireEvent, render, screen } from '@testing-library/react';
import { X } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { HaIconButton } from './HaIconButton';

describe('HaIconButton', () => {
  it('renders an accessible icon-only button', () => {
    render(<HaIconButton icon={<X size={14} />} aria-label="Close" />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveAttribute('data-size', 'md');
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<HaIconButton icon={<X />} aria-label="Close" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects size and active state', () => {
    const { rerender } = render(<HaIconButton icon={<X />} aria-label="Filters" size="lg" active />);
    const btn = screen.getByRole('button', { name: 'Filters' });
    expect(btn).toHaveAttribute('data-size', 'lg');
    expect(btn).toHaveAttribute('data-active', 'true');

    rerender(<HaIconButton icon={<X />} aria-label="Filters" size="lg" />);
    expect(screen.getByRole('button', { name: 'Filters' })).not.toHaveAttribute('data-active');
  });

  it('honours disabled', () => {
    const onClick = vi.fn();
    render(<HaIconButton icon={<X />} aria-label="Close" disabled onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
