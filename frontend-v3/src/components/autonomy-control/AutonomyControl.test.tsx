import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { AutonomyControl } from './AutonomyControl';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('AutonomyControl — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'AutonomyControl.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'AutonomyControl.css'))).toBe(true);
    expect(typeof AutonomyControl).toBe('function');
  });

  it('no hardcoded hex', () => {
    const tsx = readFileSync(join(__dirname, 'AutonomyControl.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'AutonomyControl.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('AutonomyControl — behavior', () => {
  it('renders a radiogroup with the four tiers and marks the active one', () => {
    render(<AutonomyControl value="auto-approve" onChange={vi.fn()} label="Triage" />);
    expect(screen.getByRole('radiogroup', { name: 'Triage autonomy' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Auto + approve' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onChange with the chosen level', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AutonomyControl value="off" onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Autopilot' }));
    expect(onChange).toHaveBeenCalledWith('autopilot');
  });

  it('fills tiers up to the active one (trust gradient)', () => {
    const { container } = render(<AutonomyControl value="auto-approve" onChange={vi.fn()} />);
    // off, suggest, auto-approve filled = 3; autopilot not filled
    expect(container.querySelectorAll('.ha-autonomy__seg--filled')).toHaveLength(3);
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AutonomyControl value="off" onChange={onChange} disabled />);
    await user.click(screen.getByRole('radio', { name: 'Autopilot' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
