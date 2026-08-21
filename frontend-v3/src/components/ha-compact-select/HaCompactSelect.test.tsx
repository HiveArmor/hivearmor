import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HaCompactSelect } from './HaCompactSelect';

describe('HaCompactSelect', () => {
  it('keeps native keyboard semantics and returns the selected typed value', () => {
    const onChange = vi.fn();
    render(
      <HaCompactSelect
        ariaLabel="Ownership"
        label="Ownership"
        value="all"
        options={[
          { value: 'all', label: 'All ownership' },
          { value: 'mine', label: 'Assigned to me' },
        ]}
        onChange={onChange}
      />,
    );

    const select = screen.getByLabelText('Ownership');
    expect(select).toHaveValue('all');
    expect(screen.getByText('Ownership')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'mine' } });
    expect(onChange).toHaveBeenCalledWith('mine');
  });
});
