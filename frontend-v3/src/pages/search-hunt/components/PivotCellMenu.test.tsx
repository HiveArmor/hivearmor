import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PivotCellMenu, type PivotCellAction } from './PivotCellMenu';

function renderMenu(overrides: Partial<Parameters<typeof PivotCellMenu>[0]> = {}) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(
    <PivotCellMenu
      rowField="host.name"
      colField="event.action"
      rowValue="WS-014"
      colValue="failed"
      value={842}
      valueLabel="Count"
      x={100}
      y={100}
      onAction={onAction}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onAction, onClose };
}

describe('PivotCellMenu', () => {
  it('always renders the four P1 actions', () => {
    renderMenu();
    expect(screen.getByRole('menuitem', { name: /drill to events/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /keep in hunt/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /exclude from hunt/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /copy filter/i })).toBeInTheDocument();
  });

  it('fires the right action for each P1 item', () => {
    const { onAction } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /keep in hunt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /exclude from hunt/i }));
    const fired = onAction.mock.calls.map((c) => c[0] as PivotCellAction);
    expect(fired).toContain('keep');
    expect(fired).toContain('exclude');
  });

  it('shows View entity + Open timeline for a user row (entity + timeline available)', () => {
    renderMenu({ rowField: 'user.name', rowValue: 'alice' });
    expect(screen.getByRole('menuitem', { name: /view entity/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /open timeline/i })).toBeInTheDocument();
  });

  it('shows View entity but NOT Open timeline for a host row (timeline is user-only)', () => {
    renderMenu({ rowField: 'host.name', rowValue: 'WS-014' });
    expect(screen.getByRole('menuitem', { name: /view entity/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /open timeline/i })).not.toBeInTheDocument();
  });

  it('hides both entity actions for a non-entity row field', () => {
    renderMenu({ rowField: 'event.category', rowValue: 'authentication' });
    expect(screen.queryByRole('menuitem', { name: /view entity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /open timeline/i })).not.toBeInTheDocument();
  });

  it('always offers Add evidence and Create incident (drill-then-promote)', () => {
    const { onAction } = renderMenu({ rowField: 'event.category' });
    fireEvent.click(screen.getByRole('menuitem', { name: /add evidence/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /create incident/i }));
    const fired = onAction.mock.calls.map((c) => c[0] as PivotCellAction);
    expect(fired).toContain('add_evidence');
    expect(fired).toContain('create_incident');
  });

  it('offers Filter this Pivot (pivot-local scratch filter)', () => {
    const { onAction } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /filter this pivot/i }));
    expect(onAction.mock.calls.map((c) => c[0] as PivotCellAction)).toContain('filter_pivot');
  });

  it('offers Pivot further into this cell', () => {
    const { onAction } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /pivot further into this cell/i }));
    expect(onAction.mock.calls.map((c) => c[0] as PivotCellAction)).toContain('pivot_further');
  });

  it('clamps its position up when a cell near the bottom would push the menu off-screen', () => {
    // Stub layout: a 320px-tall menu opened at y=700 in a 760px-tall viewport must move up so it fits.
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 240, height: 320, top: 0, left: 0, right: 240, bottom: 320, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const origH = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 760, configurable: true });
    try {
      renderMenu({ x: 100, y: 700 });
      const menu = screen.getByRole('menu', { name: /cell actions/i });
      // 760 - 320 - 8 = 432 → clamped up from the requested 700.
      expect(menu.style.top).toBe('432px');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    }
  });

  it('navigates entity actions on click', () => {
    const { onAction } = renderMenu({ rowField: 'user.name', rowValue: 'alice' });
    fireEvent.click(screen.getByRole('menuitem', { name: /view entity/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open timeline/i }));
    const fired = onAction.mock.calls.map((c) => c[0] as PivotCellAction);
    expect(fired).toContain('view_entity');
    expect(fired).toContain('open_timeline');
  });

  it('closes on Escape', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
