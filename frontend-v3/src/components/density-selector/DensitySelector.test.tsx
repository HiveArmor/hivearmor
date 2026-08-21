import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { DensitySelector } from './DensitySelector';

describe('DensitySelector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders three density buttons', () => {
    render(<DensitySelector />);
    expect(screen.getByTitle('Compact row density')).toBeTruthy();
    expect(screen.getByTitle('Standard row density')).toBeTruthy();
    expect(screen.getByTitle('Comfortable row density')).toBeTruthy();
  });

  it('defaults to compact as active', () => {
    render(<DensitySelector />);
    const compactBtn = screen.getByTitle('Compact row density');
    expect(compactBtn.style.color).toBe('var(--ha-primary)');
  });

  it('switches density on click and persists to localStorage', () => {
    render(<DensitySelector />);
    const standardBtn = screen.getByTitle('Standard row density');
    fireEvent.click(standardBtn);
    expect(localStorage.getItem('ha_row_density')).toBe('standard');
  });
});
