import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ConfidenceBadge } from './ConfidenceBadge';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ConfidenceBadge', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'ConfidenceBadge.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'ConfidenceBadge.css'))).toBe(true);
    expect(typeof ConfidenceBadge).toBe('function');
  });

  it('renders a 0–100 value', () => {
    render(<ConfidenceBadge value={87} />);
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByLabelText('AI confidence: 87%')).toBeInTheDocument();
  });

  it('auto-detects a 0–1 value', () => {
    render(<ConfidenceBadge value={0.42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('uses intelligence-violet, never severity tokens (confidence is not severity)', () => {
    const css = readFileSync(join(__dirname, 'ConfidenceBadge.css'), 'utf-8');
    expect(css).toContain('var(--ha-intelligence-primary)');
    expect(css).not.toMatch(/--ha-severity-/);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});
