import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { AgentStatusPill } from './AgentStatusPill';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('AgentStatusPill', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'AgentStatusPill.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'AgentStatusPill.css'))).toBe(true);
    expect(typeof AgentStatusPill).toBe('function');
  });

  it('no hardcoded hex; reduced-motion honored', () => {
    const tsx = readFileSync(join(__dirname, 'AgentStatusPill.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'AgentStatusPill.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css).toContain('prefers-reduced-motion');
  });

  it('renders the status label with an accessible name', () => {
    render(<AgentStatusPill status="running" agent="Triage" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByLabelText('Triage agent: Running')).toBeInTheDocument();
  });

  it('renders without an agent name', () => {
    render(<AgentStatusPill status="queued" />);
    expect(screen.getByLabelText('Agent status: Queued')).toBeInTheDocument();
  });
});
