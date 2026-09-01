import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { HaToolbar } from './HaToolbar';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaToolbar — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'HaToolbar.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaToolbar.css'))).toBe(true);
    expect(typeof HaToolbar).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaToolbar.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaToolbar.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });

  it('sticky strip pins under the masthead via the token', () => {
    const css = readFileSync(join(__dirname, 'HaToolbar.css'), 'utf-8');
    expect(css).toMatch(/top:\s*var\(--ha-masthead-height\)/);
    expect(css).toMatch(/z-index:\s*var\(--ha-z-sticky\)/);
  });
});

describe('HaToolbar — render', () => {
  it('renders left/right slots', () => {
    render(<HaToolbar left={<span>Filters</span>} right={<span>Density</span>} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Density')).toBeInTheDocument();
  });

  it('renders removable filter chips and fires onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<HaToolbar activeFilters={[{ label: 'Severity: Critical', onRemove }]} />);
    expect(screen.getByText('Severity: Critical')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Severity: Critical' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('fires onClearAllFilters', async () => {
    const user = userEvent.setup();
    const onClearAllFilters = vi.fn();
    render(
      <HaToolbar
        activeFilters={[{ label: 'Status: Open', onRemove: vi.fn() }]}
        onClearAllFilters={onClearAllFilters}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAllFilters).toHaveBeenCalledOnce();
  });

  it('is sticky by default, and not when sticky=false', () => {
    const { container, rerender } = render(<HaToolbar left="x" />);
    expect(container.querySelector('.ha-toolbar--sticky')).not.toBeNull();
    rerender(<HaToolbar left="x" sticky={false} />);
    expect(container.querySelector('.ha-toolbar--sticky')).toBeNull();
  });
});
