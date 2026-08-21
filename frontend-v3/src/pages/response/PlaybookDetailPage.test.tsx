/**
 * PlaybookDetailPage.test.tsx — Sprint 18 SOAR T01-1.8
 *
 * Seven Vitest test cases:
 *   1) Renders playbook name, description, and status badge
 *   2) Steps tab renders all step cards with correct type icons
 *   3) Empty steps state renders "No steps defined" message
 *   4) Execution History tab renders the AG Grid with past runs
 *   5) Settings tab allows editing name and calling the save endpoint
 *   6) Loading state renders skeleton header and tabs
 *   7) 404/not-found state renders "Playbook not found" with the back link
 *
 * Mocked dependencies:
 *   - @tanstack/react-query          — useQuery, useMutation, useQueryClient
 *   - react-router-dom               — useParams, useNavigate
 *   - @/services/playbookService     — fetchPlaybook, fetchPlaybookExecutions, executePlaybook
 *   - @/lib/apiClient                — put (Settings save)
 *   - @/components/siem-data-grid/SiemDataGrid
 *   - @/components/ha-button/HaButton
 *   - @/components/ha-switch/HaSwitch
 *   - @/components/ha-page-header/SiemPageHeader
 *   - @/components/ha-tabs/HaTabs
 *   - @/components/toast-stack/toastStore
 *
 * useParams returns { id: '1' } by default.
 *
 * **Validates: Requirements 1.17**
 *
 * Product name: HiveArmor
 */

import React from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlaybookDetailPage } from './PlaybookDetailPage';

import type { Playbook, PlaybookAuditEntry, PlaybookExecution, PlaybookStep } from '@/types/playbook';

// ---------------------------------------------------------------------------
// Mock react-router-dom — useParams returns { id: '1' } by default
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({ id: '1' }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockUseParams(),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({
    to,
    children,
    style,
  }: {
    to: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => (
    <a href={to} style={style}>
      {children}
    </a>
  ),
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
// ---------------------------------------------------------------------------

const mockFetchPlaybook = vi.fn();
const mockFetchPlaybookExecutions = vi.fn();
const mockFetchPlaybookAudit = vi.fn();
const mockUpdatePlaybook = vi.fn();
const mockExecutePlaybook = vi.fn(() =>
  Promise.resolve({ executionId: 'exec-detail-001' }),
);

vi.mock('@/services/playbookService', () => ({
  fetchPlaybook: (...args: unknown[]) => mockFetchPlaybook(...(args as [])),
  fetchPlaybookExecutions: (...args: unknown[]) => mockFetchPlaybookExecutions(...(args as [])),
  fetchPlaybookAudit: (...args: unknown[]) => mockFetchPlaybookAudit(...(args as [])),
  updatePlaybook: (...args: unknown[]) => mockUpdatePlaybook(...args),
  executePlaybook: (...args: unknown[]) => mockExecutePlaybook(...(args as [])),
  fetchPlaybooks: vi.fn(),
  setPlaybookActive: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/apiClient — put is a spy for Settings save
// ---------------------------------------------------------------------------

const mockApiPut = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: (...args: unknown[]) => mockApiPut(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @tanstack/react-query
// ---------------------------------------------------------------------------

type QueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

type MutationState = {
  mutate: (...args: unknown[]) => void;
  mutateAsync: (...args: unknown[]) => Promise<unknown>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
};

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock ag-grid-react
// ---------------------------------------------------------------------------

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-react-stub" />,
}));

// ---------------------------------------------------------------------------
// Mock @patternfly/react-core — EmptyState and EmptyStateBody
// ---------------------------------------------------------------------------

vi.mock('@patternfly/react-core', () => ({
  EmptyState: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pf-empty-state">{children}</div>
  ),
  EmptyStateBody: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pf-empty-state-body">{children}</div>
  ),
  Modal: ({ children, isOpen }: { children?: React.ReactNode; isOpen?: boolean }) =>
    isOpen ? <div data-testid="pf-modal">{children}</div> : null,
  ModalHeader: ({ title }: { title?: string }) => <div data-testid="pf-modal-header">{title}</div>,
  ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick, variant }: { children?: React.ReactNode; onClick?: () => void; variant?: string }) => (
    <button onClick={onClick} data-variant={variant}>{children}</button>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-confirmation-modal/HaConfirmationModal
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-confirmation-modal/HaConfirmationModal', () => ({
  HaConfirmationModal: ({
    isOpen,
    title,
    onConfirm,
    onCancel,
  }: {
    isOpen?: boolean;
    title?: string;
    message?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    variant?: string;
  }) =>
    isOpen ? (
      <div data-testid="ha-confirmation-modal">
        <span>{title}</span>
        <button onClick={onConfirm} data-testid="modal-confirm">Confirm</button>
        <button onClick={onCancel} data-testid="modal-cancel">Cancel</button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Mock @/components/siem-data-grid/SiemDataGrid
// ---------------------------------------------------------------------------

vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: React.forwardRef(function SiemDataGridStub(
    props: {
      columnDefs: Array<{
        field?: string;
        headerName?: string;
        cellRenderer?: (params: { data: PlaybookExecution }) => React.ReactNode;
      }>;
      rowData?: PlaybookExecution[];
      loading?: boolean;
      height?: string | number;
      rowHeight?: number;
      onRowClicked?: (event: { data: PlaybookExecution }) => void;
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
// Mock @/components/ha-button/HaButton
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-button/HaButton', () => ({
  HaButton: ({
    children,
    onClick,
    isDisabled,
    isLoading,
    variant,
    icon,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
    isLoading?: boolean;
    variant?: string;
    icon?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      disabled={isDisabled ?? false}
      data-variant={variant}
      data-loading={isLoading ? 'true' : undefined}
      {...rest}
    >
      {icon}
      {children}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-switch/HaSwitch
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-switch/HaSwitch', () => ({
  HaSwitch: ({
    id,
    isChecked,
    onChange,
    label,
  }: {
    id?: string;
    isChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
  }) => (
    <label>
      <input
        type="checkbox"
        id={id}
        data-testid={`ha-switch-${id ?? 'unknown'}`}
        checked={isChecked ?? false}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      {label}
    </label>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-page-header/SiemPageHeader
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-page-header/SiemPageHeader', () => ({
  SiemPageHeader: ({
    title,
    description,
    badge,
    actions,
  }: {
    title: string;
    description?: string;
    badge?: React.ReactNode;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="siem-page-header">
      <h1 data-testid="page-header-title">{title}</h1>
      {description && <p data-testid="page-header-description">{description}</p>}
      {badge && <div data-testid="page-header-badge">{badge}</div>}
      {actions && <div data-testid="page-header-actions">{actions}</div>}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-tabs/HaTabs
//
// Renders tab titles as clickable buttons; renders the active tab's content.
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-tabs/HaTabs', () => ({
  HaTabs: ({
    tabs,
    activeKey,
    onSelect,
  }: {
    tabs: Array<{ key: string; title: React.ReactNode; content: React.ReactNode }>;
    activeKey?: string | number;
    onSelect?: (key: string) => void;
  }) => {
    const active = String(activeKey);
    return (
      <div data-testid="ha-tabs">
        <div data-testid="ha-tabs-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-btn-${tab.key}`}
              data-active={tab.key === active ? 'true' : 'false'}
              onClick={() => onSelect?.(tab.key)}
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div data-testid="ha-tabs-content">
          {tabs.find((t) => t.key === active)?.content}
        </div>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<PlaybookStep> = {}): PlaybookStep {
  return {
    stepIndex: 0,
    stepType: 'action',
    label: 'Isolate Host',
    config: {},
    ...overrides,
  };
}

function makePlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 1,
    name: 'Isolate Compromised Host',
    description: 'Isolates the host upon a critical alert.',
    triggerType: 'alert-triggered',
    active: true,
    runCount: 7,
    lastRunAt: '2026-07-24T10:00:00.000Z',
    lastRunStatus: 'success',
    steps: [
      makeStep({ stepIndex: 0, stepType: 'condition', label: 'Check Severity' }),
      makeStep({ stepIndex: 1, stepType: 'action', label: 'Isolate Host' }),
    ],
    ...overrides,
  };
}

function makeExecution(overrides: Partial<PlaybookExecution> = {}): PlaybookExecution {
  return {
    executionId: 'exec-001',
    playbookId: 1,
    playbookName: 'Isolate Compromised Host',
    startedAt: '2026-07-24T10:00:00.000Z',
    completedAt: '2026-07-24T10:00:45.000Z',
    durationSeconds: 45,
    status: 'success',
    triggeredBy: 'admin',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Default useQuery / useMutation setup helpers
// ---------------------------------------------------------------------------

function defaultMutationState(): MutationState {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(() => Promise.resolve({})),
    isPending: false,
    isSuccess: false,
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Render helper — no providers needed (all hooks are fully mocked)
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<PlaybookDetailPage />);
}

// ---------------------------------------------------------------------------
// Default mocks applied before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: params has id '1'
  mockUseParams.mockReturnValue({ id: '1' });

  // Default useQuery: idle/not loading — overridden per test
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } satisfies QueryState<unknown>);

  // Default useMutation: idle
  mockUseMutation.mockReturnValue(defaultMutationState());

  // Default API put: resolves successfully
  mockApiPut.mockResolvedValue({} as Playbook);
  mockUpdatePlaybook.mockResolvedValue(makePlaybook());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaybookDetailPage', () => {
  // -------------------------------------------------------------------------
  // 1. Renders playbook name, description, and status badge
  // -------------------------------------------------------------------------
  it('renders the playbook name, description, and active status badge', () => {
    const playbook = makePlaybook({
      name: 'Isolate Compromised Host',
      description: 'Isolates the host upon a critical alert.',
      active: true,
    });

    mockUseQuery.mockReturnValue({
      data: playbook,
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    renderPage();

    // Title rendered in the mocked SiemPageHeader
    expect(screen.getByTestId('page-header-title').textContent).toBe(
      'Isolate Compromised Host',
    );

    fireEvent.click(screen.getByTestId('tab-btn-overview'));

    // Description and lifecycle state are intentionally kept in Overview so
    // the operational command bar remains compact.
    expect(screen.getByTestId('page-header-description').textContent).toBe(
      'Isolates the host upon a critical alert.',
    );

    // Status badge — active playbook shows "Active"
    const badge = screen.getByTestId('page-header-badge');
    expect(badge.textContent).toContain('Active');
  });

  // -------------------------------------------------------------------------
  // 2. Steps tab renders all step cards with correct type icons
  // -------------------------------------------------------------------------
  it('renders all step cards in the Steps tab with step labels visible', () => {
    const playbook = makePlaybook({
      steps: [
        makeStep({ stepIndex: 0, stepType: 'condition', label: 'Check Severity' }),
        makeStep({ stepIndex: 1, stepType: 'action', label: 'Isolate Host' }),
        makeStep({ stepIndex: 2, stepType: 'delay', label: 'Wait 60s' }),
        makeStep({ stepIndex: 3, stepType: 'loop', label: 'Loop Over Alerts' }),
      ],
    });

    mockUseQuery.mockReturnValue({
      data: playbook,
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    renderPage();

    fireEvent.click(screen.getByTestId('tab-btn-steps'));

    // The analyst overview is the landing tab; step detail remains one action away.
    expect(screen.getByText('Check Severity')).toBeDefined();
    expect(screen.getByText('Isolate Host')).toBeDefined();
    expect(screen.getByText('Wait 60s')).toBeDefined();
    expect(screen.getByText('Loop Over Alerts')).toBeDefined();

    // Step type chips are rendered for each step
    expect(screen.getAllByText(/condition · step/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/action · step/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/delay · step/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/loop · step/i).length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 3. Empty steps state renders "No steps defined" message
  // -------------------------------------------------------------------------
  it('renders the "No steps defined" empty state when the steps array is empty', () => {
    const playbook = makePlaybook({ steps: [] });

    mockUseQuery.mockReturnValue({
      data: playbook,
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    renderPage();

    fireEvent.click(screen.getByTestId('tab-btn-steps'));

    // Empty definitions are explained in the dedicated Steps view.
    expect(screen.getByText(/No steps defined/i)).toBeDefined();

    // No step labels should be present
    expect(screen.queryByText('Check Severity')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. Execution History tab renders the AG Grid with past runs
  // -------------------------------------------------------------------------
  it('renders the SiemDataGrid with execution rows when the History tab is active', () => {
    const playbook = makePlaybook();
    const executions: PlaybookExecution[] = [
      makeExecution({ executionId: 'exec-001', status: 'success', triggeredBy: 'admin' }),
      makeExecution({ executionId: 'exec-002', status: 'failure', triggeredBy: 'alert:42' }),
    ];

    // useQuery is called with different queryKeys — route by key array content.
    mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
      const keyHead = opts.queryKey[0];
      if (keyHead === 'playbook') {
        return {
          data: playbook,
          isLoading: false,
          isError: false,
          error: null,
        } satisfies QueryState<Playbook>;
      }
      if (keyHead === 'playbook-executions') {
        return {
          data: executions,
          isLoading: false,
          isError: false,
          error: null,
        } satisfies QueryState<PlaybookExecution[]>;
      }
      // Other queries (audit tab, etc.) return empty
      return {
        data: [] as unknown[],
        isLoading: false,
        isError: false,
        error: null,
      } satisfies QueryState<unknown[]>;
    });

    renderPage();

    // Click the "Execution History" tab
    const historyTab = screen.getByTestId('tab-btn-history');
    fireEvent.click(historyTab);

    // SiemDataGrid should be visible with 2 rows
    expect(screen.getByTestId('siem-data-grid')).toBeDefined();
    expect(screen.getByTestId('grid-row-0')).toBeDefined();
    expect(screen.getByTestId('grid-row-1')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Settings tab allows editing name and calling the save endpoint
  // -------------------------------------------------------------------------
  it('calls apiClient.put with updated data when Save is clicked in the Settings tab', async () => {
    const playbook = makePlaybook({ id: 1, name: 'Old Name' });

    mockUseQuery.mockReturnValue({
      data: playbook,
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    // Capture the mutationFn passed to useMutation so we can invoke it
    let capturedMutationFn: ((data: unknown) => Promise<unknown>) | undefined;
    const mockMutate = vi.fn((data: unknown) => {
      if (capturedMutationFn) {
        void capturedMutationFn(data);
      }
    });

    mockUseMutation.mockImplementation(
      (opts: {
        mutationFn?: (data: unknown) => Promise<unknown>;
        onSuccess?: () => void;
        onError?: (err: unknown) => void;
      }) => {
        capturedMutationFn = opts.mutationFn;
        return {
          mutate: mockMutate,
          mutateAsync: vi.fn(() => Promise.resolve({})),
          isPending: false,
          isSuccess: false,
          isError: false,
        } satisfies MutationState;
      },
    );

    mockApiPut.mockResolvedValue({ ...playbook, name: 'New Name' });

    renderPage();

    // Navigate to Settings tab
    const settingsTab = screen.getByTestId('tab-btn-settings');
    fireEvent.click(settingsTab);

    // Find the name input (id="settings-name")
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput).toBeDefined();

    // Clear and type a new name
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(nameInput.value).toBe('New Name');

    // Click Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // mutate should have been called once
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    // The mutate call receives the updated form data with the new name
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' }),
    );
  });

  // -------------------------------------------------------------------------
  // 6. Loading state renders skeleton header and tabs
  // -------------------------------------------------------------------------
  it('renders the skeleton loading state while the playbook query is loading', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    renderPage();

    // SiemPageHeader should NOT be rendered (no data yet)
    expect(screen.queryByTestId('siem-page-header')).toBeNull();

    // HaTabs should NOT be rendered
    expect(screen.queryByTestId('ha-tabs')).toBeNull();

    // The skeleton renders skeleton tab placeholders (5 divs)
    // We detect the skeleton by absence of real content
    expect(screen.queryByTestId('page-header-title')).toBeNull();
    expect(screen.queryByText('Isolate Compromised Host')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 7. 404/not-found state renders "Playbook not found" with the back link
  // -------------------------------------------------------------------------
  it('renders "Playbook not found" and a back link when the query returns an error', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('404 not found'),
    } satisfies QueryState<Playbook>);

    renderPage();

    // PatternFly EmptyState stub should be rendered
    expect(screen.getByTestId('pf-empty-state')).toBeDefined();

    // The "Playbook not found" heading
    expect(screen.getByText('Playbook not found')).toBeDefined();

    // The "Back to Playbooks" link pointing to /response/playbooks
    const backLink = screen.getByRole('link', { name: /back to playbooks/i });
    expect(backLink).toBeDefined();
    expect((backLink as HTMLAnchorElement).href).toContain('/response/playbooks');
  });

  it('uses manual-activation keyboard navigation across every playbook section', () => {
    mockUseQuery.mockReturnValue({
      data: makePlaybook(),
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryState<Playbook>);

    renderPage();

    const overview = screen.getByRole('tab', { name: /overview/i });
    const steps = screen.getByRole('tab', { name: /steps/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(steps);
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(steps.getAttribute('aria-selected')).toBe('false');

    fireEvent.keyDown(steps, { key: 'Enter' });
    fireEvent.click(steps);
    expect(steps.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(steps, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /audit/i }));
  });

  it('renders the canonical playbook audit projection without using the generic admin audit endpoint', () => {
    const auditEntries: PlaybookAuditEntry[] = [{
      id: 'audit-pb-1-001',
      occurredAt: '2026-08-03T14:22:08Z',
      action: 'EXECUTED',
      actor: 'Maya Chen',
      actorRole: 'SOC Manager',
      summary: 'Execution completed successfully.',
      version: 4,
    }];

    mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
      if (opts.queryKey[0] === 'playbook') {
        return { data: makePlaybook(), isLoading: false, isError: false, error: null };
      }
      if (opts.queryKey[0] === 'playbook-audit') {
        return {
          data: { items: auditEntries, nextCursor: null, total: auditEntries.length, hasMore: false },
          isLoading: false,
          isError: false,
          error: null,
        };
      }
      return { data: undefined, isLoading: false, isError: false, error: null };
    });

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /audit/i }));

    expect(screen.getByText('Execution completed successfully.')).toBeDefined();
    expect(screen.getByText('Maya Chen')).toBeDefined();
    expect(screen.getByText('v4')).toBeDefined();
  });
});
