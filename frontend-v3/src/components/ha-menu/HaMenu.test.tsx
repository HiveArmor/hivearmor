import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { HaMenu } from './HaMenu';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaMenu — conventions', () => {
  it('files exist + export with subcomponents', () => {
    expect(existsSync(join(__dirname, 'HaMenu.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaMenu.css'))).toBe(true);
    expect(typeof HaMenu).toBe('function');
    expect(typeof HaMenu.Item).toBe('function');
    expect(typeof HaMenu.CheckboxItem).toBe('function');
    expect(typeof HaMenu.Label).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaMenu.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaMenu.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('HaMenu — behavior', () => {
  it('opens on trigger and renders a role=menu with items', async () => {
    const user = userEvent.setup();
    render(
      <HaMenu trigger={<button type="button">Columns</button>} ariaLabel="Columns">
        <HaMenu.Label>Optional</HaMenu.Label>
        <HaMenu.Item>Reset</HaMenu.Item>
      </HaMenu>,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.getByRole('menu', { name: 'Columns' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reset' })).toBeInTheDocument();
  });

  it('toggles a checkbox item', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <HaMenu trigger={<button type="button">Columns</button>} ariaLabel="Columns">
        <HaMenu.CheckboxItem checked={false} onToggle={onToggle}>
          Tags
        </HaMenu.CheckboxItem>
      </HaMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Tags' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
