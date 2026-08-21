/**
 * RuleGenerationPage.test.tsx — Vitest component tests for RuleGenerationPage and RuleReviewDrawer.
 *
 * Sprint 28, Task 5.9.
 *
 * Coverage:
 *   1. Clicking a row in the pending queue opens the drawer with the correct session data
 *   2. Clicking Approve calls approveSession, on success the row disappears and drawer closes
 *   3. Clicking Reject calls rejectSession, on success the row disappears
 *   4. Monaco editor mounts with readOnly: true; toggling Edit flips to readOnly: false
 *   5. The drawer renders at the correct width (640px)
 *
 * Requirements validated: 5.5, 5.6, 5.7, 5.8
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RuleGenerationPage } from '../RuleGenerationPage';

import type { RuleGenSessionDTO, SignalSummaryDTO } from '@/types/ruleGeneration.types';

// ---------------------------------------------------------------------------
// Mock @monaco-editor/react — Monaco can't render in jsdom.
// We render a simple textarea that exposes the readOnly state via data attributes.
// ---------------------------------------------------------------------------

let lastMonacoOptions: Record<string, unknown> = {};

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, options }: { value: string; options?: Record<string, unknown> }) => {
    lastMonacoOptions = options ?? {};
    return (
      <textarea
        data-testid="monaco-editor"
        data-readonly={String(options?.readOnly ?? false)}
        defaultValue={value}
        readOnly={!!options?.readOnly}
      />
    );
  },
}));

// ---------------------------------------------------------------------------
// Mock ruleGenerationService
// ---------------------------------------------------------------------------

const mockGetSignalSummary = vi.fn<() => Promise<SignalSummaryDTO>>();
const mockGetPendingSessions = vi.fn<() => Promise<RuleGenSessionDTO[]>>();
const mockApproveSession = vi.fn<(id: number) => Promise<RuleGenSessionDTO>>();
const mockRejectSession = vi.fn<(id: number) => Promise<RuleGenSessionDTO>>();
const mockRegenerateSession = vi.fn();

vi.mock('@/services/ruleGeneration.service', () => ({
  ruleGenerationService: {
    getSignalSummary: (...args: unknown[]) => mockGetSignalSummary(...(args as [])),
    getPendingSessions: (...args: unknown[]) => mockGetPendingSessions(...(args as [])),
    generateSession: vi.fn(),
    approveSession: (...args: unknown[]) => mockApproveSession(...(args as [number])),
    rejectSession: (...args: unknown[]) => mockRejectSession(...(args as [number])),
    regenerateSession: (...args: unknown[]) => mockRegenerateSession(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock HaChart — echarts can't render in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: () => <div data-testid="ha-chart">chart</div>,
}));

// ---------------------------------------------------------------------------
// Mock HaToggle — PatternFly Switch doesn't render fully in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-toggle', () => ({
  HaToggle: ({
    isChecked,
    onChange,
    'aria-label': ariaLabel,
    id,
  }: {
    isChecked?: boolean;
    onChange?: (checked: boolean) => void;
    'aria-label'?: string;
    id?: string;
  }) => (
    <input
      type="checkbox"
      id={id}
      aria-label={ariaLabel}
      checked={isChecked}
      onChange={(e) => onChange?.(e.target.checked)}
      data-testid="edit-toggle"
    />
  ),
}));

// ---------------------------------------------------------------------------
// Mock AG Grid — AgGridReact is complex to render in jsdom; we render a simple table
// ---------------------------------------------------------------------------

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({
    rowData,
    onRowClicked,
    columnDefs,
  }: {
    rowData?: unknown[];
    onRowClicked?: (event: { data: unknown }) => void;
    columnDefs?: Array<{ headerName?: string; field?: string }>;
  }) => (
    <table data-testid="ag-grid">
      <thead>
        <tr>
          {columnDefs?.map((col, i) => (
            <th key={i}>{col.headerName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(rowData as RuleGenSessionDTO[] | undefined)?.map((row) => (
          <tr
            key={row.id}
            data-testid={`grid-row-${row.id}`}
            onClick={() => onRowClicked?.({ data: row })}
          >
            <td>{row.id}</td>
            <td>{row.ruleName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_1: RuleGenSessionDTO = {
  id: 101,
  status: 'pending_review',
  ruleName: 'Brute Force SSH',
  ruleYaml: 'name: Brute Force SSH\nseverity: high\ndataTypes:\n  - syslog\ndefinition: cel-expr',
  signalKey: 'syslog_TRUE_POSITIVE',
  requestedBy: 'admin',
  approvedPath: null,
  createdAt: '2026-07-25T10:00:00Z',
  updatedAt: '2026-07-25T10:00:00Z',
};

const SESSION_2: RuleGenSessionDTO = {
  id: 102,
  status: 'pending_review',
  ruleName: 'Lateral Movement RDP',
  ruleYaml: 'name: Lateral Movement RDP\nseverity: medium\ndataTypes:\n  - windows\ndefinition: cel-expr2',
  signalKey: 'windows_TRUE_POSITIVE',
  requestedBy: 'admin',
  approvedPath: null,
  createdAt: '2026-07-25T11:00:00Z',
  updatedAt: '2026-07-25T11:00:00Z',
};

const SUMMARY: SignalSummaryDTO = {
  minCount: 3,
  truePositiveTotal: 12,
  falsePositiveTotal: 5,
  groups: [
    { dataType: 'syslog', signalType: 'TRUE_POSITIVE', count: 8, firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-25T00:00:00Z' },
    { dataType: 'syslog', signalType: 'FALSE_POSITIVE', count: 3, firstSeen: '2026-07-05T00:00:00Z', lastSeen: '2026-07-20T00:00:00Z' },
    { dataType: 'windows', signalType: 'TRUE_POSITIVE', count: 4, firstSeen: '2026-07-10T00:00:00Z', lastSeen: '2026-07-24T00:00:00Z' },
    { dataType: 'windows', signalType: 'FALSE_POSITIVE', count: 2, firstSeen: '2026-07-12T00:00:00Z', lastSeen: '2026-07-22T00:00:00Z' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RuleGenerationPage />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleGenerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMonacoOptions = {};

    // Default mocks: summary loads, pending sessions available
    mockGetSignalSummary.mockResolvedValue(SUMMARY);
    mockGetPendingSessions.mockResolvedValue([SESSION_1, SESSION_2]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Row activation opens drawer with correct session
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking a row in the pending queue opens the drawer with the correct session data', async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the grid to render with pending sessions
    const row = await screen.findByTestId('grid-row-101');
    await user.click(row);

    // Drawer should show the rule name as header — HaDrawer renders it in a specific div
    // "Brute Force SSH" appears both in grid and drawer, so find all and verify drawer appeared
    await waitFor(() => {
      const matches = screen.getAllByText('Brute Force SSH');
      // Should be at least 2: one in the grid row, one in the drawer header
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    // Monaco editor should show the session's YAML
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveValue(SESSION_1.ruleYaml);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Approve removes row from queue and closes drawer
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking Approve calls approveSession, removes the row from queue, and closes drawer', async () => {
    const user = userEvent.setup();

    // After approve, the pending sessions no longer include session 101
    mockApproveSession.mockResolvedValue({ ...SESSION_1, status: 'approved' });

    renderPage();

    // Open the drawer for session 101
    const row = await screen.findByTestId('grid-row-101');
    await user.click(row);

    // Wait for drawer to be open (Approve button visible)
    const approveBtn = await screen.findByRole('button', { name: /approve/i });
    expect(approveBtn).toBeInTheDocument();

    // After approve resolves, the service should refetch pending sessions without session 101
    mockGetPendingSessions.mockResolvedValue([SESSION_2]);

    await user.click(approveBtn);

    // Verify approveSession was called with the correct id
    await waitFor(() => {
      expect(mockApproveSession).toHaveBeenCalledWith(101);
    });

    // Drawer should close (the rule name specific to session 101 disappears along with editor)
    await waitFor(() => {
      expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
    });

    // Row 101 should no longer be in the grid
    await waitFor(() => {
      expect(screen.queryByTestId('grid-row-101')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Reject removes row from queue
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking Reject calls rejectSession and removes the row from queue', async () => {
    const user = userEvent.setup();

    mockRejectSession.mockResolvedValue({ ...SESSION_1, status: 'rejected' });

    renderPage();

    // Open drawer
    const row = await screen.findByTestId('grid-row-101');
    await user.click(row);

    const rejectBtn = await screen.findByRole('button', { name: /reject/i });

    // After reject resolves, pending sessions no longer include session 101
    mockGetPendingSessions.mockResolvedValue([SESSION_2]);

    await user.click(rejectBtn);

    // Verify rejectSession was called
    await waitFor(() => {
      expect(mockRejectSession).toHaveBeenCalledWith(101);
    });

    // Row 101 should disappear from the grid
    await waitFor(() => {
      expect(screen.queryByTestId('grid-row-101')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Monaco editor mounts read-only; Edit toggle switches state
  // ─────────────────────────────────────────────────────────────────────────

  it('Monaco editor mounts with readOnly: true and Edit toggle switches to readOnly: false', async () => {
    const user = userEvent.setup();
    renderPage();

    // Open drawer
    const row = await screen.findByTestId('grid-row-101');
    await user.click(row);

    // Editor should be in read-only mode initially
    const editor = await screen.findByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-readonly', 'true');
    expect(lastMonacoOptions.readOnly).toBe(true);

    // Find the Edit toggle (mocked as a plain checkbox via data-testid)
    const toggle = screen.getByTestId('edit-toggle');
    expect(toggle).not.toBeChecked();

    // Click the toggle
    await user.click(toggle);

    // After toggling, editor should no longer be read-only
    await waitFor(() => {
      const updatedEditor = screen.getByTestId('monaco-editor');
      expect(updatedEditor).toHaveAttribute('data-readonly', 'false');
    });
    expect(lastMonacoOptions.readOnly).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Drawer renders at the correct width (640px)
  // ─────────────────────────────────────────────────────────────────────────

  it('the drawer renders at 640px width', async () => {
    const user = userEvent.setup();
    renderPage();

    // Open the drawer
    const row = await screen.findByTestId('grid-row-101');
    await user.click(row);

    // HaDrawer renders a fixed-position div with width=640.
    // Find the drawer panel by locating the element with width: 640 style
    await waitFor(() => {
      // The HaDrawer sets width via inline style — find the one with 640
      const allFixedDivs = document.querySelectorAll('div[style]');
      const panel = Array.from(allFixedDivs).find((el) => {
        const style = (el as HTMLElement).style;
        return style.width === '640px';
      });
      expect(panel).toBeTruthy();
    });
  });
});
