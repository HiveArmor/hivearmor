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
    render(<HuntAiControls showAiHand={false} onToggleAiHand={onToggle} autonomy="suggest" onAutonomyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /show ai's hand/i }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('keeps Auto-approve and Autopilot DISABLED (propose-only)', () => {
    render(<HuntAiControls showAiHand={false} onToggleAiHand={vi.fn()} autonomy="suggest" onAutonomyChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Auto-approve' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Autopilot' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Suggest' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Off' })).not.toBeDisabled();
  });

  it('changes autonomy on an enabled option', () => {
    const onChange = vi.fn();
    render(<HuntAiControls showAiHand={false} onToggleAiHand={vi.fn()} autonomy="suggest" onAutonomyChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onChange).toHaveBeenCalledWith('off');
  });
});
