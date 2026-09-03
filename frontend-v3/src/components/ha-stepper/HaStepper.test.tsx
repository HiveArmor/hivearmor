import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HaStepper, type HaStep } from './HaStepper';

const STEPS: HaStep[] = [
  { id: 'auth', label: 'Authentication' },
  { id: 'verify', label: 'Verification' },
  { id: 'done', label: 'Complete' },
];

describe('HaStepper', () => {
  it('renders an accessible ordered list of steps', () => {
    render(<HaStepper steps={STEPS} current={1} ariaLabel="Sign in" />);
    const list = screen.getByRole('list', { name: 'Sign in' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks steps before current completed, current active, rest upcoming', () => {
    render(<HaStepper steps={STEPS} current={1} ariaLabel="Sign in" />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-state', 'completed');
    expect(items[1]).toHaveAttribute('data-state', 'active');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveAttribute('data-state', 'upcoming');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });

  it('announces completed / current state as text (not colour alone)', () => {
    render(<HaStepper steps={STEPS} current={1} ariaLabel="Sign in" />);
    expect(screen.getByText(/Authentication/)).toHaveTextContent('(completed)');
    expect(screen.getByText(/Verification/)).toHaveTextContent('(current step)');
  });

  it('clamps an out-of-range current index', () => {
    render(<HaStepper steps={STEPS} current={99} ariaLabel="Sign in" />);
    const items = screen.getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('data-state', 'active');
  });
});
