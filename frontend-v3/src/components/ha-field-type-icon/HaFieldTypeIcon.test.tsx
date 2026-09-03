import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HaFieldTypeIcon } from './HaFieldTypeIcon';

describe('HaFieldTypeIcon', () => {
  it('renders a titled glyph for each known field type', () => {
    const cases: Array<[string, string]> = [
      ['date', 'Date'],
      ['keyword', 'Keyword'],
      ['text', 'Text'],
      ['ip', 'IP address'],
      ['number', 'Number'],
      ['boolean', 'Boolean'],
    ];
    for (const [type, label] of cases) {
      const { unmount } = render(<HaFieldTypeIcon type={type} />);
      const el = screen.getByRole('img', { hidden: true });
      expect(el).toHaveAttribute('title', label);
      expect(el).toHaveAttribute('data-type', type);
      unmount();
    }
  });

  it('falls back to a neutral keyword glyph for an unknown type', () => {
    render(<HaFieldTypeIcon type="geo_point" />);
    const el = screen.getByRole('img', { hidden: true });
    expect(el).toHaveAttribute('title', 'Keyword');
    expect(el).toHaveAttribute('data-type', 'unknown');
  });

  it('exposes an accessible name only when labelled', () => {
    const { rerender } = render(<HaFieldTypeIcon type="ip" />);
    // decorative by default: hidden from the a11y tree
    expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('aria-hidden', 'true');

    rerender(<HaFieldTypeIcon type="ip" labelled />);
    expect(screen.getByRole('img', { name: 'IP address field' })).toBeInTheDocument();
  });
});
