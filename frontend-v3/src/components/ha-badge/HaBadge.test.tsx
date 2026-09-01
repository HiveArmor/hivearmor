import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { HaBadge } from './HaBadge';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaBadge — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'HaBadge.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaBadge.css'))).toBe(true);
    expect(typeof HaBadge).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaBadge.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaBadge.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('HaBadge — render', () => {
  it('renders label and icon', () => {
    render(<HaBadge icon={<i data-testid="ico" />}>HOST-1000</HaBadge>);
    expect(screen.getByText('HOST-1000')).toBeInTheDocument();
    expect(screen.getByTestId('ico')).toBeInTheDocument();
  });

  it('is a button and fires onClick when interactive', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<HaBadge onClick={onClick}>Click me</HaBadge>);
    const badge = screen.getByRole('button', { name: 'Click me' });
    await user.click(badge);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is not a button when non-interactive', () => {
    render(<HaBadge>Static</HaBadge>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies pill and mono modifiers', () => {
    const { container } = render(<HaBadge pill mono>10.0.0.1</HaBadge>);
    expect(container.querySelector('.ha-badge--pill')).not.toBeNull();
    expect(container.querySelector('.ha-badge--mono')).not.toBeNull();
  });
});
