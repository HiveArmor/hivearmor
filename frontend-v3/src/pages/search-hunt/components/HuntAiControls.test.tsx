/**
 * HuntAiControls tests: the "Show AI's hand" toggle and the PROPOSE-ONLY autonomy dial
 * (Auto-approve / Autopilot MUST be disabled until the response backend ships — REDESIGN §5.2).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { HuntAiControls } from './HuntAiControls';

describe('HuntAiControls', () => {
  it('toggles "Show AI\'s hand"', () => {
    const onToggle = vi.fn();
    render(<HuntAiControls showAiHand={false} onToggleAiHand={onToggle} handAvailable autonomy="suggest" onAutonomyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /show ai's hand/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('disables the "Show AI\'s hand" lens when AI is not configured (FINDING-03)', () => {
    const onToggle = vi.fn();
    render(<HuntAiControls showAiHand={false} onToggleAiHand={onToggle} handAvailable={false} autonomy="suggest" onAutonomyChange={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /show ai's hand/i });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps Auto-approve and Autopilot DISABLED (propose-only)', () => {
    render(<HuntAiControls showAiHand={false} onToggleAiHand={vi.fn()} handAvailable autonomy="suggest" onAutonomyChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Auto-approve' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Autopilot' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Suggest' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Off' })).not.toBeDisabled();
  });

  it('changes autonomy on an enabled option', () => {
    const onChange = vi.fn();
    render(<HuntAiControls showAiHand={false} onToggleAiHand={vi.fn()} handAvailable autonomy="suggest" onAutonomyChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onChange).toHaveBeenCalledWith('off');
  });
});
