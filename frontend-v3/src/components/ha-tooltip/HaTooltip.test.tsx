import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { HaTooltip } from './HaTooltip';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaTooltip — conventions', () => {
  it('component + css files exist', () => {
    expect(existsSync(join(__dirname, 'HaTooltip.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaTooltip.css'))).toBe(true);
  });

  it('exports HaTooltip', () => {
    const src = readFileSync(join(__dirname, 'HaTooltip.tsx'), 'utf-8');
    expect(
      src.includes('export function HaTooltip') || src.includes('export const HaTooltip'),
    ).toBe(true);
  });

  it('uses import type', () => {
    const src = readFileSync(join(__dirname, 'HaTooltip.tsx'), 'utf-8');
    expect(src.includes('import type')).toBe(true);
  });

  it('no hardcoded hex colors in the component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaTooltip.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaTooltip.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });

  it('layers on the z-tooltip token', () => {
    const src = readFileSync(join(__dirname, 'HaTooltip.tsx'), 'utf-8');
    expect(src.includes('var(--ha-z-tooltip)')).toBe(true);
  });

  it('css honors prefers-reduced-motion', () => {
    const css = readFileSync(join(__dirname, 'HaTooltip.css'), 'utf-8');
    expect(css.includes('prefers-reduced-motion')).toBe(true);
  });
});

describe('HaTooltip — behavior', () => {
  it('renders the trigger and reveals content on focus', async () => {
    const user = userEvent.setup();
    render(
      <HaTooltip content="Events per second">
        <button type="button">EPS</button>
      </HaTooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'EPS' });
    expect(trigger).toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText('Events per second')).toBeInTheDocument();
  });
});
