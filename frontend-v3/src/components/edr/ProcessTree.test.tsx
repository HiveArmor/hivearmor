/**
 * ProcessTree component tests — Requirements 1.12
 *
 * Tests:
 *   1) isLoading=true  → renders container with role="status" and
 *      aria-label="Loading process tree"
 *   2) isError=true    → renders container with role="alert" containing
 *      "Failed to load process tree"
 *   3) processes=[], isLoading=false, isError=false → renders text matching
 *      /no process data/i
 *   4) processes non-empty, isLoading=false, isError=false → renders the
 *      chart container (echarts.init is mocked to prevent real canvas ops)
 *
 * echarts is mocked so jsdom does not throw on HTMLCanvasElement operations.
 * useHaThemeTokens is mocked to return predictable empty-string token values.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ProcessTree } from './ProcessTree';

import type { ProcessNodeDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// Mock echarts — prevents real canvas operations in jsdom (Requirement 1.12)
// ---------------------------------------------------------------------------

vi.mock('echarts', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Mock useHaThemeTokens — returns empty strings for all token values so
// ECharts colour resolution does not trigger getComputedStyle in jsdom.
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHaThemeTokens', () => ({
  useHaThemeTokens: () => ({
    '--ha-primary': '',
    '--ha-critical': '',
    '--ha-text-primary': '',
    '--ha-border': '',
    '--ha-surface-primary': '',
  }),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<ProcessNodeDTO> = {}): ProcessNodeDTO {
  return {
    pid: 1000,
    ppid: 0,
    name: 'explorer.exe',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessTree', () => {
  // 1. Loading state
  it('renders a container with role="status" and aria-label="Loading process tree" when isLoading is true', () => {
    render(
      <ProcessTree
        processes={[]}
        isLoading={true}
        isError={false}
      />
    );

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeDefined();
    expect(statusEl.getAttribute('aria-label')).toBe('Loading process tree');
  });

  // 2. Error state
  it('renders a container with role="alert" containing "Failed to load process tree" when isError is true', () => {
    render(
      <ProcessTree
        processes={[]}
        isLoading={false}
        isError={true}
      />
    );

    const alertEl = screen.getByRole('alert');
    expect(alertEl).toBeDefined();
    expect(alertEl.textContent).toContain('Failed to load process tree');
  });

  // 3. Empty state
  it('renders text matching /no process data/i when processes is empty and not loading or errored', () => {
    render(
      <ProcessTree
        processes={[]}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.getByText(/no process data/i)).toBeDefined();
  });

  // 4. Loaded state
  it('renders the chart container div when processes is non-empty', () => {
    const processes: ProcessNodeDTO[] = [
      makeNode({ pid: 4, ppid: 0, name: 'System' }),
      makeNode({ pid: 1234, ppid: 4, name: 'svchost.exe' }),
    ];

    render(
      <ProcessTree
        processes={processes}
        isLoading={false}
        isError={false}
      />
    );

    // The loaded state renders a div with aria-label="Process tree chart"
    const chartContainer = screen.getByLabelText('Process tree chart');
    expect(chartContainer).toBeDefined();
  });
});
