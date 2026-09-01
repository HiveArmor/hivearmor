import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { PlanThenExecuteDiff } from './PlanThenExecuteDiff';

const __dirname = dirname(fileURLToPath(import.meta.url));

const steps = [
  { action: 'Block 10.0.14.203 at the firewall', kind: 'add' as const, effect: 'stops C2 beacon' },
  { action: 'Remove allow-any rule', kind: 'remove' as const },
];

describe('PlanThenExecuteDiff — conventions', () => {
  it('files exist + export; no hex', () => {
    expect(existsSync(join(__dirname, 'PlanThenExecuteDiff.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'PlanThenExecuteDiff.css'))).toBe(true);
    const tsx = readFileSync(join(__dirname, 'PlanThenExecuteDiff.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'PlanThenExecuteDiff.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('PlanThenExecuteDiff — behavior', () => {
  it('renders steps and the rollback plan', () => {
    render(<PlanThenExecuteDiff title="Contain HOST-1000" steps={steps} rollback="Remove the block after review." />);
    expect(screen.getByText(/Block 10.0.14.203/)).toBeInTheDocument();
    expect(screen.getByText(/stops C2 beacon/)).toBeInTheDocument();
    expect(screen.getByText('Remove the block after review.')).toBeInTheDocument();
  });

  it('fires confirm, dry-run and cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onDryRun = vi.fn();
    const onCancel = vi.fn();
    render(
      <PlanThenExecuteDiff
        title="Contain HOST-1000"
        steps={steps}
        rollback="x"
        onConfirm={onConfirm}
        onDryRun={onDryRun}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm plan' }));
    await user.click(screen.getByRole('button', { name: 'Dry run' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDryRun).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
