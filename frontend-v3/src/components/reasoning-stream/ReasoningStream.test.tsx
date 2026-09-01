import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { ReasoningStream } from './ReasoningStream';

const __dirname = dirname(fileURLToPath(import.meta.url));

const lines = [
  { id: '1', text: 'Correlating auth failures with process tree.' },
  { id: '2', text: 'Enriching source IP.', citations: [{ label: 'GTI: 10.0.14.203', onClick: () => {} }] },
];

describe('ReasoningStream — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'ReasoningStream.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'ReasoningStream.css'))).toBe(true);
    expect(typeof ReasoningStream).toBe('function');
  });

  it('no hardcoded hex; reduced-motion honored', () => {
    const tsx = readFileSync(join(__dirname, 'ReasoningStream.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'ReasoningStream.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('ReasoningStream — behavior', () => {
  it('renders reasoning lines in a polite live region', () => {
    render(<ReasoningStream lines={lines} />);
    const region = screen.getByRole('list', { name: 'AI reasoning' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/Correlating auth failures/)).toBeInTheDocument();
  });

  it('shows Stop while streaming and fires onStop', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ReasoningStream lines={lines} streaming onStop={onStop} />);
    const stop = screen.getByRole('button', { name: 'Stop the agent' });
    await user.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('hides Stop when not streaming', () => {
    render(<ReasoningStream lines={lines} />);
    expect(screen.queryByRole('button', { name: 'Stop the agent' })).not.toBeInTheDocument();
  });

  it('renders a citation and fires its pivot', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ReasoningStream lines={[{ id: '1', text: 'x', citations: [{ label: 'GTI: 10.0.0.1', onClick }] }]} />);
    await user.click(screen.getByRole('button', { name: 'GTI: 10.0.0.1' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
