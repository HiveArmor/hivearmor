import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { ApprovalCard } from './ApprovalCard';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ApprovalCard — conventions', () => {
  it('files exist + export; no hex', () => {
    expect(existsSync(join(__dirname, 'ApprovalCard.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'ApprovalCard.css'))).toBe(true);
    const tsx = readFileSync(join(__dirname, 'ApprovalCard.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'ApprovalCard.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('ApprovalCard — behavior', () => {
  it('renders action, risk, blast radius and reversibility', () => {
    render(
      <ApprovalCard
        action="Isolate HOST-1000"
        agent="Response agent"
        risk="high"
        blastRadius="1 endpoint · 1 user session"
        reversible
      />,
    );
    expect(screen.getByText('Isolate HOST-1000')).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(screen.getByText('1 endpoint · 1 user session')).toBeInTheDocument();
    expect(screen.getByText(/can be rolled back/)).toBeInTheDocument();
  });

  it('fires approve / modify / reject', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onModify = vi.fn();
    const onReject = vi.fn();
    render(
      <ApprovalCard
        action="Isolate HOST-1000"
        risk="critical"
        blastRadius="1 endpoint"
        reversible={false}
        onApprove={onApprove}
        onModify={onModify}
        onReject={onReject}
      />,
    );
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Modify' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onModify).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });
});
