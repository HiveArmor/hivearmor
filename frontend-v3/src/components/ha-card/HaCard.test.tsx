import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { HaCard } from './HaCard';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaCard — conventions', () => {
  it('component + css files exist', () => {
    expect(existsSync(join(__dirname, 'HaCard.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaCard.css'))).toBe(true);
  });

  it('exports HaCard with Header/Body/Footer slots', () => {
    expect(typeof HaCard).toBe('function');
    expect(typeof HaCard.Header).toBe('function');
    expect(typeof HaCard.Body).toBe('function');
    expect(typeof HaCard.Footer).toBe('function');
  });

  it('no hardcoded hex colors in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaCard.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaCard.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('HaCard — render', () => {
  it('renders composable header/body/footer content', () => {
    render(
      <HaCard>
        <HaCard.Header>
          <span>Title</span>
        </HaCard.Header>
        <HaCard.Body>Body content</HaCard.Body>
        <HaCard.Footer>Footer meta</HaCard.Footer>
      </HaCard>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByText('Footer meta')).toBeInTheDocument();
  });

  it('respects the `as` prop for semantic element', () => {
    const { container } = render(
      <HaCard as="article" aria-label="finding">
        <HaCard.Body>x</HaCard.Body>
      </HaCard>,
    );
    expect(container.querySelector('article.ha-card')).not.toBeNull();
  });

  it('applies compact class', () => {
    const { container } = render(
      <HaCard compact>
        <HaCard.Body>x</HaCard.Body>
      </HaCard>,
    );
    expect(container.querySelector('.ha-card--compact')).not.toBeNull();
  });
});
