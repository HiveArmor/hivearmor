import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { HaLabel } from './HaLabel';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaLabel — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'HaLabel.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaLabel.css'))).toBe(true);
    expect(typeof HaLabel).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaLabel.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaLabel.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('HaLabel — render', () => {
  it('renders icon + text and applies the color token', () => {
    const { container } = render(
      <HaLabel icon={<i data-testid="ico" />} color="var(--ha-state-healthy)">
        Resolved
      </HaLabel>,
    );
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByTestId('ico')).toBeInTheDocument();
    const el = container.querySelector('.ha-label') as HTMLElement;
    expect(el.style.color).toContain('--ha-state-healthy');
  });
});
