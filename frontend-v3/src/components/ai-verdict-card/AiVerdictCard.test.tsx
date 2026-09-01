import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { AiVerdictCard } from './AiVerdictCard';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('AiVerdictCard — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'AiVerdictCard.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'AiVerdictCard.css'))).toBe(true);
    expect(typeof AiVerdictCard).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'AiVerdictCard.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'AiVerdictCard.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });

  it('wears intelligence-violet provenance (left rule)', () => {
    const css = readFileSync(join(__dirname, 'AiVerdictCard.css'), 'utf-8');
    expect(css).toMatch(/\.ai-verdict\s*\{[^}]*border-left:[^}]*var\(--ha-intelligence-primary\)/);
  });
});

describe('AiVerdictCard — behavior', () => {
  const base = {
    verdict: 'malicious' as const,
    confidence: 92,
    summary: 'Brute-force then successful auth then lateral SMB.',
    conclusion: 'Confirmed credential-access into lateral movement.',
    reasoning: [
      { label: 'Enrichment', detail: 'GTI + geo', state: 'done' as const },
      { label: 'Deep-dive', state: 'active' as const },
    ],
    evidence: [
      { label: 'Source IP', value: '10.0.14.203' },
      { label: 'Host', value: 'HOST-1000' },
    ],
  };

  it('renders verdict, confidence, and summary', () => {
    render(<AiVerdictCard {...base} />);
    expect(screen.getByText('Malicious')).toBeInTheDocument();
    expect(screen.getByLabelText('AI confidence: 92%')).toBeInTheDocument();
    expect(screen.getByText(/Brute-force then successful auth/)).toBeInTheDocument();
  });

  it('switches to the Evidence Locker tab', async () => {
    const user = userEvent.setup();
    render(<AiVerdictCard {...base} />);
    await user.click(screen.getByRole('tab', { name: /Evidence Locker/ }));
    expect(screen.getByText('Source IP')).toBeInTheDocument();
    expect(screen.getByText('10.0.14.203')).toBeInTheDocument();
  });

  it('fires feedback on thumbs', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(<AiVerdictCard {...base} onFeedback={onFeedback} />);
    await user.click(screen.getByRole('button', { name: /Confirm verdict/ }));
    expect(onFeedback).toHaveBeenCalledWith('up');
  });
});
