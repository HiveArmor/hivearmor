/**
 * PlaybooksPage.test.tsx — Sprint 18 SOAR T01-1.7
 *
 * Six Vitest test cases:
 *   1) Renders AG Grid with name, trigger type, and status from mock data
 *   2) Active toggle calls setPlaybookActive with the flipped boolean
 *   3) Run Now calls executePlaybook and receives an executionId
 *   4) Run Now is disabled when active === false
 *   5) Loading skeleton renders while the query is loading
 *   6) Empty state renders when no playbooks exist
 *
 * Mocked dependencies:
 *   - @/services/playbookService       — fetchPlaybooks, setPlaybookActive, executePlaybook
 *   - @tanstack/react-query            — useQuery, useQueryClient (controlled per test)
 *   - @/store/auth.store               — hasAnyRole returns true by default
 *   - @/components/toast-stack/toastStore
 *   - @/components/siem-data-grid/SiemDataGrid — lightweight stub renders colDefs+rowData
 *   - @/components/ha-switch/HaSwitch  — renders as a plain checkbox
 *   - @/components/ha-button/HaButton  — renders as a plain button
 *   - @/components/ha-page-header/SiemPageHeader
 *   - @/components/empty-state/EmptyState
 *   - react-router-dom (useNavigate)
 *
 * **Validates: Requirements 1.16**
 *
 * Product name: HiveArmor
 */

import React from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlaybooksPage } from './PlaybooksPage';

import type { Playbook } from '@/types/playbook';

// ---------------------------------------------------------------------------
// Mock react-router-dom — useNavigate returns a stable spy
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ---------------------------------------------------------------------------
// Mock @/store/auth.store — hasAnyRole returns true (admin) by default
// ---------------------------------------------------------------------------

const mockHasAnyRole = vi.fn(() => true);

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({
    hasAnyRole: mockHasAnyRole,
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/components/toast-stack/toastStore
// ---------------------------------------------------------------------------

const mockAddToast = vi.fn();

vi.mock('@/components/toast-stack/toastStore', () => ({
  useToastStore: () => ({
    addToast: mockAddToast,
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/services/playbookService
//
// fetchPlaybooks is controlled via mockFetchPlaybooks per test.
// setPlaybookActive and executePlaybook are spies.
// ---------------------------------------------------------------------------

const mockSetPlaybookActive = vi.fn(() => Promise.resolve());
const mockExecutePlaybook = vi.fn(() => Promise.resolve({ executionId: 'exec-abc-123' }));
const mockFetchPlaybooks = vi.fn(() => Promise.resolve([] as Playbook[]));

vi.mock('@/services/playbookService', () => ({
  fetchPlaybooks: (...args: unknown[]) => mockFetchPlaybooks(...(args as [])),
  setPlaybookActive: (...args: unknown[]) => mockSetPlaybookActive(...(args as [])),
  executePlaybook: (...args: unknown[]) => mockExecutePlaybook(...(args as [])),
  fetchPlaybook: vi.fn(),
  fetchPlaybookExecutions: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @tanstack/react-query — useQuery and useQueryClient controlled per test
// ---------------------------------------------------------------------------

type UseQueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

const mockSetQueryData = vi.fn();
const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock ag-grid-react — prevents canvas/DOM environment errors
// ---------------------------------------------------------------------------

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-react-stub" />,
}));

// ---------------------------------------------------------------------------
// Mock @/components/siem-data-grid/SiemDataGrid
//
// Strategy: render a simple <div> that surfaces the loading prop and renders
// each row's cell renderers so the column cells are accessible in assertions.
// We look for columns with fields 'name', 'triggerType', 'lastRunStatus',
// 'active', and 'Actions' (headerName).
// ---------------------------------------------------------------------------

vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: React.forwardRef(function SiemDataGridStub(
    props: {
      columnDefs: Array<{
        field?: string;
        headerName?: string;
        cellRenderer?: (params: { data: Playbook }) => React.ReactNode;
      }>;
      rowData?: Playbook[];
      loading?: boolean;
      [key: string]: unknown;
    },
    _ref: React.Ref<unknown>,
  ) {
    const { columnDefs, rowData, loading } = props;
    if (loading) {
      return <div data-testid="siem-data-grid-loading" aria-busy="true" />;
    }

    return (
      <div data-testid="siem-data-grid">
        {(rowData ?? []).map((row, i) => (
          <div key={i} data-testid={`grid-row-${i}`}>
            {columnDefs.map((col) => {
              const key = col.field ?? col.headerName ?? String(i);
              return (
                <div key={key} data-col={key}>
                  {col.cellRenderer ? col.cellRenderer({ data: row }) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-switch/HaSwitch
//
// Renders a plain checkbox. The onChange fires with the NEW checked value.
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-switch/HaSwitch', () => ({
  HaSwitch: ({
    id,
    isChecked,
    onChange,
    isDisabled,
  }: {
    id?: string;
    isChecked?: boolean;
    onChange?: (checked: boolean) => void;
    isDisabled?: boolean;
    'aria-label'?: string;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={isChecked ?? false}
      disabled={isDisabled}
      onChange={(e) => onChange?.(e.target.checked)}
      data-testid={`ha-switch-${id ?? 'unknown'}`}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/playbook/PlaybookExecutionViewer — prevents EventSource crash
// ---------------------------------------------------------------------------

vi.mock('@/components/playbook/PlaybookExecutionViewer', () => ({
  PlaybookExecutionViewer: ({
    isOpen,
    executionId,
  }: {
    isOpen: boolean;
    executionId: string | null;
    playbookSteps: unknown[];
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="playbook-execution-viewer" data-execution-id={executionId ?? ''} />
    ) : null,
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-button/HaButton
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-button/HaButton', () => ({
  HaButton: ({
    children,
    onClick,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-page-header/SiemPageHeader
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-page-header/SiemPageHeader', () => ({
  SiemPageHeader: ({
    title,
    actions,
  }: {
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="siem-page-header">
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/empty-state/EmptyState
// ---------------------------------------------------------------------------

vi.mock('@/components/empty-state/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="ha-empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makePlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 1,
    name: 'Isolate Compromised Host',
    description: 'Isolates the host upon critical alert.',
    triggerType: 'alert-triggered',
    active: true,
    runCount: 12,
    lastRunAt: '2026-07-24T10:00:00.000Z',
    lastRunStatus: 'success',
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper — no providers needed; react-query hooks are fully mocked
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<PlaybooksPage />);
}

// ---------------------------------------------------------------------------
// Default mocks applied before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: admin user with access
  mockHasAnyRole.mockReturnValue(true);

  // Default: idle / no data state — overridden per test
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } satisfies UseQueryState<Playbook[]>);

  mockSetPlaybookActive.mockResolvedValue(undefined);
  mockExecutePlaybook.mockResolvedValue({ executionId: 'exec-abc-123' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaybooksPage', () => {
  // -------------------------------------------------------------------------
  // 1. Renders AG Grid with name, trigger type, and status from mock data
  // -------------------------------------------------------------------------
  it('renders AG Grid cells with name, trigger type, and status from mock data', () => {
    const playbook = makePlaybook({
      id: 7,
      name: 'Isolate Compromised Host',
      triggerType: 'alert-triggered',
      lastRunStatus: 'success',
      active: true,
    });

    mockUseQuery.mockReturnValue({
      data: [playbook],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    renderPage();

    // Grid is rendered with rows
    expect(screen.getByTestId('siem-data-grid')).toBeDefined();
    expect(screen.getByTestId('grid-row-0')).toBeDefined();

    // Name column — the name link button is rendered via cellRenderer
    expect(screen.getByText('Isolate Compromised Host')).toBeDefined();

    // Trigger type badge — rendered by the triggerTypeBadge helper in PlaybooksPage
    expect(screen.getByText('Alert Triggered')).toBeDefined();

    // Status badge — rendered by the statusBadge helper
    expect(screen.getByText('Success')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Active toggle calls setPlaybookActive with the flipped boolean
  // -------------------------------------------------------------------------
  it('calls setPlaybookActive with the flipped boolean when the active toggle is clicked', async () => {
    const playbook = makePlaybook({ id: 3, active: true });

    mockUseQuery.mockReturnValue({
      data: [playbook],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    renderPage();

    // Locate the HaSwitch stub rendered inside the Active column
    const toggle = screen.getByTestId(`ha-switch-active-toggle-3`);
    expect(toggle).toBeDefined();
    // Currently checked (active=true)
    expect((toggle as HTMLInputElement).checked).toBe(true);

    // Click to uncheck — fires onChange(false) → flipped value
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockSetPlaybookActive).toHaveBeenCalledTimes(1);
      expect(mockSetPlaybookActive).toHaveBeenCalledWith(3, false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Run Now calls executePlaybook and receives an executionId
  // -------------------------------------------------------------------------
  it('calls executePlaybook and receives an executionId when Run Now is clicked', async () => {
    const playbook = makePlaybook({ id: 5, active: true, name: 'Block Malicious IP' });

    mockUseQuery.mockReturnValue({
      data: [playbook],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    mockExecutePlaybook.mockResolvedValue({ executionId: 'exec-xyz-789' });

    renderPage();

    const runNowButton = screen.getByRole('button', { name: /run now/i });
    expect(runNowButton).toBeDefined();
    expect((runNowButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(runNowButton);

    await waitFor(() => {
      expect(mockExecutePlaybook).toHaveBeenCalledTimes(1);
      expect(mockExecutePlaybook).toHaveBeenCalledWith(5);
    });

    // On success the component opens the PlaybookExecutionViewer with the executionId
    await waitFor(() => {
      const viewer = document.querySelector('[data-testid="playbook-execution-viewer"]');
      expect(viewer).toBeTruthy();
      expect(viewer?.getAttribute('data-execution-id')).toBe('exec-xyz-789');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Run Now is disabled when active === false
  // -------------------------------------------------------------------------
  it('renders Run Now button as disabled when playbook.active is false', () => {
    const playbook = makePlaybook({ id: 9, active: false, name: 'Quarantine File' });

    mockUseQuery.mockReturnValue({
      data: [playbook],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    renderPage();

    const runNowButton = screen.getByRole('button', { name: /run now/i });
    expect(runNowButton).toBeDefined();
    expect((runNowButton as HTMLButtonElement).disabled).toBe(true);

    // Clicking a disabled button should not call executePlaybook
    fireEvent.click(runNowButton);
    expect(mockExecutePlaybook).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Loading skeleton renders while the query is loading
  // -------------------------------------------------------------------------
  it('renders loading skeleton (aria-busy grid) while the query is loading', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    renderPage();

    // SiemDataGrid stub renders with aria-busy="true" when loading=true
    const loadingGrid = screen.getByTestId('siem-data-grid-loading');
    expect(loadingGrid).toBeDefined();
    expect(loadingGrid.getAttribute('aria-busy')).toBe('true');

    // No data rows should be present
    expect(screen.queryByTestId('grid-row-0')).toBeNull();

    // No empty state
    expect(screen.queryByTestId('ha-empty-state')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. Empty state renders when no playbooks exist
  // -------------------------------------------------------------------------
  it('renders the empty state when the playbooks array is empty', () => {
    mockUseQuery.mockReturnValue({
      data: [] as Playbook[],
      isLoading: false,
      isError: false,
      error: null,
    } satisfies UseQueryState<Playbook[]>);

    renderPage();

    // The HaEmptyState stub renders data-testid="ha-empty-state"
    const emptyState = screen.getByTestId('ha-empty-state');
    expect(emptyState).toBeDefined();

    // The exact empty-state title from PlaybooksPage
    expect(screen.getByText('No playbooks defined')).toBeDefined();

    // The description text
    expect(
      screen.getByText(/No playbooks defined. Create one to begin automating responses./i),
    ).toBeDefined();

    // No grid rows
    expect(screen.queryByTestId('siem-data-grid')).toBeNull();
    expect(screen.queryByTestId('siem-data-grid-loading')).toBeNull();
  });
});
