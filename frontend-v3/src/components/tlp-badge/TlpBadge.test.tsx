import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TlpBadge } from './TlpBadge';

/**
 * HiveArmor unit tests for TlpBadge component.
 */
describe('TlpBadge', () => {
  it('renders TLP:WHITE', () => {
    render(<TlpBadge tlp="WHITE" />);
    expect(screen.getByText('TLP:WHITE')).toBeInTheDocument();
  });

  it('renders TLP:GREEN', () => {
    render(<TlpBadge tlp="GREEN" />);
    expect(screen.getByText('TLP:GREEN')).toBeInTheDocument();
  });

  it('renders TLP:AMBER', () => {
    render(<TlpBadge tlp="AMBER" />);
    expect(screen.getByText('TLP:AMBER')).toBeInTheDocument();
  });

  it('renders TLP:RED', () => {
    render(<TlpBadge tlp="RED" />);
    expect(screen.getByText('TLP:RED')).toBeInTheDocument();
  });

  it('applies compact size when size=sm', () => {
    const { container } = render(<TlpBadge tlp="WHITE" size="sm" />);
    // PatternFly compact label adds pf-m-compact class
    expect(container.querySelector('.pf-m-compact')).toBeTruthy();
  });
});
