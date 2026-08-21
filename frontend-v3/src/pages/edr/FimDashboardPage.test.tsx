/**
 * FimDashboardPage tests — Validates: Requirements 4.18
 *
 * Tests:
 *   1) Loading state — when isLoading=true, renders three PanelSkeleton
 *      placeholders (role="status", aria-label="Loading chart")
 *   2) Empty state   — when all three data arrays are empty and isLoading=false,
 *      renders a PatternFly EmptyState with body text about no FIM data
 *   3) Error state   — when isError=true, renders a PatternFly Alert with
 *      variant="danger" and the error message
 *   4) Loaded state  — when data contains FIM events, renders the three chart
 *      containers (Changes Over Time, Top Changed Paths) and the Suspicious
 *      Hashes table with aria-label="Suspicious file hashes"
 *
 * Mocked dependencies to prevent heavy side-effects in jsdom:
 *   - useFimSummary               — the primary data-fetch hook
 *   - echarts/core + echarts      — prevents HTMLCanvasElement errors
 *   - @/hooks/useHaThemeTokens    — returns stable empty strings for all
 *                                   tokens so getComputedStyle is never
 *                                   called in jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FimDashboardPage } from './FimDashboardPage';

import type { FimSummaryDTO, TimeSeriesPoint, PathCountDTO, SuspiciousHashDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// Mock echarts/core and echarts — prevents canvas errors in jsdom
// ---------------------------------------------------------------------------

const echartsInstanceMock = {
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('echarts/core', () => ({
  default: {
    init: vi.fn(() => echartsInstanceMock),
    use: vi.fn(),
  },
  use: vi.fn(),
  init: vi.fn(() => echartsInstanceMock),
}));

vi.mock('echarts', () => ({
  default: {
    init: vi.fn(() => echartsInstanceMock),
    use: vi.fn(),
  },
  use: vi.fn(),
  init: vi.fn(() => echartsInstanceMock),
}));

vi.mock('echarts/charts', () => ({
  BarChart: {},
  LineChart: {},
}));

vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TooltipComponent: {},
}));

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: {},
}));

// ---------------------------------------------------------------------------
// Mock @/hooks/useHaThemeTokens — returns stable empty strings for all tokens
// so getComputedStyle is never called in jsdom (mirrors ProcessTree.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHaThemeTokens', () => ({
  useHaThemeTokens: () => ({
    '--ha-background': '',
    '--ha-surface-primary': '',
    '--ha-surface-raised': '',
    '--ha-border': '',
    '--ha-primary': '',
    '--ha-intelligence': '',
    '--ha-critical': '',
    '--ha-high': '',
    '--ha-medium': '',
    '--ha-positive': '',
    '--ha-text-primary': '',
    '--ha-text-secondary': '',
  }),
  resolveHaToken: () => '',
}));

// ---------------------------------------------------------------------------
// Mock useFimSummary — controls loading / error / data states
// ---------------------------------------------------------------------------

type UseFimSummaryReturn = {
  data: FimSummaryDTO | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

const mockUseFimSummary = vi.fn();

vi.mock('@/hooks/useFimSummary', () => ({
  useFimSummary: (...args: unknown[]) => mockUseFimSummary(...args),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTimeSeriesPoint(overrides: Partial<TimeSeriesPoint> = {}): TimeSeriesPoint {
  return {
    timestamp: '2026-07-24T12:00:00.000Z',
    create: 5,
    modify: 12,
    delete: 2,
    rename: 1,
    ...overrides,
  };
}

function makePathCount(overrides: Partial<PathCountDTO> = {}): PathCountDTO {
  return {
    path: '/etc/passwd',
    count: 8,
    ...overrides,
  };
}

function makeSuspiciousHash(overrides: Partial<SuspiciousHashDTO> = {}): SuspiciousHashDTO {
  return {
    sha256Hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    filename: 'malware.exe',
    firstSeen: '2026-07-23T08:00:00.000Z',
    lastSeen: '2026-07-24T10:00:00.000Z',
    endpointCount: 3,
    threatIntelHit: true,
    ...overrides,
  };
}

function makeFimSummary(overrides: Partial<FimSummaryDTO> = {}): FimSummaryDTO {
  return {
    changesOverTime: [],
    topPaths: [],
    suspiciousHashes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<FimDashboardPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FimDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Loading state — three PanelSkeleton placeholders should be visible
  it('renders three PanelSkeleton placeholders with aria-label="Loading chart" when isLoading is true', () => {
    mockUseFimSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } satisfies UseFimSummaryReturn);

    renderPage();

    // PanelSkeleton renders role="status" aria-label="Loading chart".
    // There should be three: Changes Over Time, Top Changed Paths, Suspicious Hashes.
    const skeletons = screen.getAllByRole('status', { name: /loading chart/i });
    expect(skeletons.length).toBe(3);
  });

  // 2. Empty state — PatternFly EmptyState with no-FIM-data body text
  it('renders a PatternFly EmptyState with FIM data message when all arrays are empty and not loading', () => {
    mockUseFimSummary.mockReturnValue({
      data: makeFimSummary({
        changesOverTime: [],
        topPaths: [],
        suspiciousHashes: [],
      }),
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseFimSummaryReturn);

    renderPage();

    // The empty-state body text — from FimDashboardPage's EmptyStateBody
    expect(
      screen.getByText(/no file integrity events found for the selected time range/i),
    ).toBeDefined();

    // No skeleton placeholders should be visible
    expect(screen.queryByRole('status', { name: /loading chart/i })).toBeNull();

    // No danger alert
    expect(screen.queryByRole('heading', { name: /failed to load fim data/i })).toBeNull();
  });

  // 3. Error state — PatternFly Alert with danger variant
  it('renders a PatternFly Alert with danger variant when isError is true', () => {
    mockUseFimSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('OpenSearch timeout while fetching FIM summary'),
    } satisfies UseFimSummaryReturn);

    renderPage();

    // PatternFly v6 Alert with variant="danger" renders an h4 heading whose
    // accessible name contains the alert title text (mirrors FileQuarantinePage.test.tsx)
    const alertHeading = screen.getByRole('heading', {
      name: /failed to load fim data/i,
    });
    expect(alertHeading).toBeDefined();

    // The error message body text should also be visible
    expect(
      screen.getByText(/OpenSearch timeout while fetching FIM summary/i),
    ).toBeDefined();

    // No skeleton placeholders
    expect(screen.queryByRole('status', { name: /loading chart/i })).toBeNull();
  });

  // 4. Loaded state — chart containers and Suspicious Hashes table with data
  it('renders chart containers and the Suspicious Hashes table with data when FIM events are present', () => {
    const suspiciousHash = makeSuspiciousHash({
      sha256Hash: 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe',
      filename: 'ransomware.dll',
      endpointCount: 5,
      threatIntelHit: true,
    });

    mockUseFimSummary.mockReturnValue({
      data: makeFimSummary({
        changesOverTime: [makeTimeSeriesPoint(), makeTimeSeriesPoint()],
        topPaths: [makePathCount({ path: '/etc/shadow', count: 15 })],
        suspiciousHashes: [suspiciousHash],
      }),
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseFimSummaryReturn);

    renderPage();

    // No skeleton placeholders in the loaded state
    expect(screen.queryByRole('status', { name: /loading chart/i })).toBeNull();

    // No error alert
    expect(screen.queryByRole('heading', { name: /failed to load fim data/i })).toBeNull();

    // Suspicious Hashes table should be present
    const hashesTable = screen.getByRole('table', { name: /suspicious file hashes/i });
    expect(hashesTable).toBeDefined();

    // The filename from our fixture should appear in the table
    expect(screen.getByText('ransomware.dll')).toBeDefined();

    // Threat Intel HIT badge for the suspicious hash
    expect(screen.getByText('HIT')).toBeDefined();
  });
});
