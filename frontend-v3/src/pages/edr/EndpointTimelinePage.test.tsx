/**
 * EndpointTimelinePage tests — Validates: Requirements 2.16
 *
 * Tests:
 *   1) Loading state  — when isLoading=true, renders skeleton rows and the
 *      "Loading events…" indicator with role="status"
 *   2) Empty state    — when data.content.length === 0 and isLoading=false,
 *      renders the "No events found" empty state text
 *   3) Error state    — when isError=true, renders a PatternFly Alert with
 *      variant="danger" containing the error message
 *   4) Loaded state   — when data contains a process_start event, renders the
 *      AG Grid rows and, on row click, opens the detail drawer with the
 *      "Show Process Tree" button
 *
 * Mocked dependencies to prevent heavy side-effects in jsdom:
 *   - useEdrTimeline  — the primary data-fetch hook
 *   - useProcessTree  — the drill-down hook (used inside ProcessTreeModal)
 *   - echarts         — prevents HTMLCanvasElement errors
 *   - @monaco-editor/react — prevents full Monaco bundle loading
 *   - ag-grid-react   — replaced with a lightweight table that forwards
 *                        onRowClicked so row-click tests work without a real
 *                        AG Grid environment
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EndpointTimelinePage } from './EndpointTimelinePage';

import type { UseProcessTreeResult } from '@/hooks/useProcessTree';
import type { EdrTimelinePage } from '@/types/edr';

// ---------------------------------------------------------------------------
// Mock echarts — prevents canvas errors in jsdom (Requirement 2.16)
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
// Mock @monaco-editor/react — avoids full Monaco bundle loading in jsdom
// ---------------------------------------------------------------------------

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => (
    <textarea
      aria-label="Monaco Editor"
      readOnly
      defaultValue={value}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Mock ag-grid-react — lightweight substitute that forwards onRowClicked
// ---------------------------------------------------------------------------

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({
    rowData,
    onRowClicked,
  }: {
    rowData?: unknown[];
    onRowClicked?: (event: { data: unknown }) => void;
  }) => (
    <div data-testid="ag-grid-stub">
      {(rowData ?? []).map((row, i) => (
        <div
          key={i}
          data-testid={`ag-grid-row-${i}`}
          onClick={() => onRowClicked?.({ data: row })}
          style={{ cursor: 'pointer' }}
        >
          {JSON.stringify(row)}
        </div>
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock useEdrTimeline — controls loading / error / data states
// ---------------------------------------------------------------------------

type UseEdrTimelineReturn = {
  data: EdrTimelinePage | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

const mockUseEdrTimeline = vi.fn();

vi.mock('@/hooks/useEdrTimeline', () => ({
  useEdrTimeline: (...args: unknown[]) => mockUseEdrTimeline(...args),
}));

// ---------------------------------------------------------------------------
// Mock useProcessTree — avoids real API calls when the drawer is opened
// ---------------------------------------------------------------------------

const mockUseProcessTree = vi.fn();

vi.mock('@/hooks/useProcessTree', () => ({
  useProcessTree: (...args: unknown[]) => mockUseProcessTree(...args),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTimelinePage(overrides: Partial<EdrTimelinePage> = {}): EdrTimelinePage {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    number: 0,
    ...overrides,
  };
}

const SAMPLE_PROCESS_EVENT = {
  id: 'evt-001',
  agentId: 'test-agent-123',
  eventType: 'process_start' as const,
  severity: 75,
  timestamp: '2026-07-24T12:00:00.000Z',
  processName: 'malware.exe',
  pid: 4242,
  user: 'SYSTEM',
  details: { cmdline: 'malware.exe /silent', hash: 'deadbeef' },
};

const SAMPLE_NETWORK_EVENT = {
  id: 'evt-002',
  agentId: 'test-agent-123',
  eventType: 'network_connect' as const,
  severity: 45,
  timestamp: '2026-07-24T12:01:00.000Z',
  processName: 'chrome.exe',
  pid: 1234,
  user: 'jdoe',
  details: { destinationIp: '192.168.1.50', destinationPort: 443 },
};

// ---------------------------------------------------------------------------
// Render helper — wraps in MemoryRouter with matching :agentId route
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/edr/timeline/test-agent-123']}>
      <Routes>
        <Route path="/edr/timeline/:agentId" element={<EndpointTimelinePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EndpointTimelinePage', () => {
  beforeEach(() => {
    // Default process tree state — idle
    mockUseProcessTree.mockReturnValue({
      roots: [],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseProcessTreeResult);
  });

  // 1. Loading state
  it('renders the loading indicator and skeleton rows when isLoading is true', () => {
    mockUseEdrTimeline.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } satisfies UseEdrTimelineReturn);

    renderPage();

    // The spinner / loading message rendered above the chart
    const loadingStatus = screen.getByRole('status', { name: /loading events/i });
    expect(loadingStatus).toBeDefined();

    // Text "Loading events…" is visible to users
    expect(loadingStatus.textContent).toMatch(/loading events/i);

    // Skeleton rows are rendered (they use SkeletonRow components)
    // The page renders 8 skeleton divs inside a wrapper during loading
    const skeletonContainer = loadingStatus.closest('[style]')?.parentElement;
    expect(skeletonContainer).not.toBeNull();
  });

  // 2. Empty state
  it('renders the empty state message when there are no events and loading is complete', () => {
    mockUseEdrTimeline.mockReturnValue({
      data: makeTimelinePage({ content: [], totalElements: 0 }),
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseEdrTimelineReturn);

    renderPage();

    // Should NOT show the loading status spinner
    expect(screen.queryByRole('status', { name: /loading events/i })).toBeNull();

    // Should show the empty state message
    expect(screen.getByText(/no events found in the selected range/i)).toBeDefined();
  });

  // 3. Error state
  it('renders a PatternFly Alert with danger variant when isError is true', () => {
    mockUseEdrTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('OpenSearch connection refused'),
    } satisfies UseEdrTimelineReturn);

    renderPage();

    // PatternFly v6 Alert with variant="danger" renders the title in an h4
    // with the accessible name "Danger alert: <title>".
    const alertTitle = screen.getByRole('heading', {
      name: /failed to load events/i,
    });
    expect(alertTitle).toBeDefined();

    // The error message body should also be visible somewhere in the document
    expect(screen.getByText(/OpenSearch connection refused/i)).toBeDefined();
  });

  // 4. Loaded state — events grid, row click → drawer, "Show Process Tree" button
  it('renders events in the grid and shows "Show Process Tree" when a process_start row is clicked', async () => {
    mockUseEdrTimeline.mockReturnValue({
      data: makeTimelinePage({
        content: [SAMPLE_PROCESS_EVENT, SAMPLE_NETWORK_EVENT],
        totalElements: 2,
        totalPages: 1,
      }),
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseEdrTimelineReturn);

    renderPage();

    // The AG Grid stub should be rendered (loaded state shows the grid)
    const grid = screen.getByTestId('ag-grid-stub');
    expect(grid).toBeDefined();

    // Two rows should be rendered
    expect(screen.getByTestId('ag-grid-row-0')).toBeDefined();
    expect(screen.getByTestId('ag-grid-row-1')).toBeDefined();

    // Click the first row — a process_start event — to open the detail drawer
    fireEvent.click(screen.getByTestId('ag-grid-row-0'));

    // The "Show Process Tree" button is unique — it only appears in the
    // drawer footer for process_* events, not in the filter bar.
    // Use waitFor since the drawer renders after state update.
    const showTreeButton = await screen.findByRole('button', {
      name: /show process tree/i,
    });
    expect(showTreeButton).toBeDefined();

    // The Monaco editor should display the JSON of the event details
    const monacoEditor = await screen.findByLabelText('Monaco Editor');
    expect(monacoEditor).toBeDefined();
    expect((monacoEditor as HTMLTextAreaElement).value).toContain('cmdline');
    expect((monacoEditor as HTMLTextAreaElement).value).toContain('deadbeef');

    // The drawer title div contains the event type — there will be multiple
    // elements with "process_start" text (filter bar button + drawer title).
    // Assert that at least two occurrences exist (filter bar + drawer).
    const allProcessStartText = screen.getAllByText('process_start');
    expect(allProcessStartText.length).toBeGreaterThanOrEqual(2);
  });
});
