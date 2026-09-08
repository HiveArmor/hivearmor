import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PivotBreadcrumb, type PivotStep } from './PivotBreadcrumb';
import type { HuntPivotConfig } from '../searchHunt.types';

const cfg = (): HuntPivotConfig => ({ v: 1, tenantId: null, rowField: 'host.name', colField: 'event.action', valueFn: 'count', distinctField: null });

const steps: PivotStep[] = [
  { id: 'root', label: 'All results', scopeFilters: [], config: cfg() },
  { id: 's1', label: 'host.name = web01 × event.action = login', scopeFilters: ['(host.name:web01 AND event.action:login)'], config: cfg() },
  { id: 's2', label: 'user.name = admin × event.outcome = failure', scopeFilters: ['(host.name:web01 AND event.action:login)', '(user.name:admin AND event.outcome:failure)'], config: cfg() },
];

describe('PivotBreadcrumb', () => {
  it('renders nothing at root-only depth (a single step is not a path)', () => {
    const { container } = render(<PivotBreadcrumb steps={[steps[0]]} onNavigate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the trail; earlier crumbs are buttons, the current step is not', () => {
    render(<PivotBreadcrumb steps={steps} onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^all results$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /host\.name = web01 × event\.action = login/i })).toBeInTheDocument();
    // current (last) step is not a button
    expect(screen.queryByRole('button', { name: /user\.name = admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/user\.name = admin × event\.outcome = failure/)).toHaveAttribute('aria-current', 'step');
  });

  it('clicking an earlier crumb fires onNavigate with its index', () => {
    const onNavigate = vi.fn();
    render(<PivotBreadcrumb steps={steps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /host\.name = web01 × event\.action = login/i }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });
});
