import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { HaPopover } from './HaPopover';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaPopover — conventions', () => {
  it('component + css files exist', () => {
    expect(existsSync(join(__dirname, 'HaPopover.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaPopover.css'))).toBe(true);
  });

  it('exports HaPopover', () => {
    const src = readFileSync(join(__dirname, 'HaPopover.tsx'), 'utf-8');
    expect(
      src.includes('export function HaPopover') || src.includes('export const HaPopover'),
    ).toBe(true);
  });

  it('no hardcoded hex colors in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaPopover.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaPopover.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });

  it('layers on --ha-z-dropdown and honors reduced motion', () => {
    const css = readFileSync(join(__dirname, 'HaPopover.css'), 'utf-8');
    expect(css.includes('var(--ha-z-dropdown)')).toBe(true);
    expect(css.includes('prefers-reduced-motion')).toBe(true);
  });
});

describe('HaPopover — behavior', () => {
  const Fixture = (): JSX.Element => (
    <div>
      <HaPopover trigger={<button type="button">Open</button>} ariaLabel="Test panel">
        {({ close }) => (
          <div>
            <span>Panel body</span>
            <button type="button" onClick={close}>
              Done
            </button>
          </div>
        )}
      </HaPopover>
      <button type="button">Outside</button>
    </div>
  );

  it('is closed initially, opens on trigger click, sets aria-expanded', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Test panel' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes via the render-prop close()', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on outside pointer-down', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
