/**
 * B0-4 — HaExportMenu component tests.
 *
 * Proves: the control is disabled without results; the format menu is keyboard-reachable with menu
 * roles; while streaming an aria-live progress + cancel affordance render; and the chain-of-custody
 * hash + copy affordance surface after a successful export.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HaExportMenu } from './HaExportMenu';

import type { ExportResult } from '@/pages/search-hunt/forensicExport.types';

afterEach(() => {
  vi.restoreAllMocks();
});

const doneResult: ExportResult = {
  exportId: 'exp-1',
  sha256: 'a'.repeat(64),
  recordCount: 12345,
  filename: 'hunt-2026.csv',
  format: 'csv',
  surface: 'hunt-search',
};

describe('HaExportMenu', () => {
  it('disables the trigger when there are no results', () => {
    render(<HaExportMenu surface="hunt-search" disabled onExport={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Export results' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens a keyboard-reachable menu with CSV and NDJSON items', () => {
    render(<HaExportMenu surface="hunt-search" onExport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export results' }));
    expect(screen.getByRole('menu', { name: 'Export format' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Export CSV' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Export NDJSON' })).toBeDefined();
  });

  it('shows an aria-live progress state with a cancel affordance while streaming', async () => {
    let resolveExport: (value: ExportResult) => void = () => {};
    const onExport = vi.fn(
      () => new Promise<ExportResult>((resolve) => { resolveExport = resolve; }),
    );
    render(<HaExportMenu surface="alert-list" onExport={onExport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export results' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export NDJSON' }));

    const status = await screen.findByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    expect(onExport).toHaveBeenCalledWith('ndjson', expect.any(AbortSignal));

    resolveExport({ ...doneResult, surface: 'alert-list', format: 'ndjson' });
  });

  it('surfaces the chain-of-custody hash with a copy affordance after export', async () => {
    const onExport = vi.fn(async () => doneResult);
    render(<HaExportMenu surface="hunt-search" onExport={onExport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export results' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(screen.getByText(/hunt-2026\.csv downloaded/)).toBeDefined();
    });
    expect(screen.getByText('SHA-256')).toBeDefined();
    expect(screen.getByText(/^aaaaaaaaaaaa/)).toBeDefined();
    expect(screen.getByRole('button', { name: /copy full sha-256/i })).toBeDefined();
    expect(screen.getByText('12,345 records', { exact: false })).toBeDefined();
  });
});
