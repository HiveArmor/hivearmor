/**
 * FileQuarantinePage tests — Validates: Requirements 3.23
 *
 * Tests:
 *   1) Loading state — renders loading state in the grid
 *   2) Empty state   — renders "No quarantined files found" empty state text
 *   3) Error state   — renders PatternFly Alert with danger variant
 *   4) Loaded state  — renders rows; when Delete button is clicked, a
 *      confirmation modal appears BEFORE the mutation fires; only fires
 *      after confirming
 *
 * Mocked dependencies:
 *   - useQuarantinedFiles, useQuarantineAction, useQuarantineBulkAction
 *     from @/hooks/useQuarantine — controls data / loading / error states
 *     and captures mutation calls
 *   - @/components/siem-data-grid — replaced with a lightweight table that
 *     renders row data with clickable Restore/Delete buttons matching the
 *     aria-labels set in FileQuarantinePage's RowActions component
 *   - @/components/ha-confirmation-modal/HaConfirmationModal — replaced with
 *     a transparent stub that renders its message and wires confirm/cancel
 *   - @/hooks/useHaThemeTokens — resolveHaToken returns a stable string so
 *     getComputedStyle is never called in jsdom
 *   - ag-grid-react — prevents AG Grid Community from requiring a DOM canvas
 */

import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FileQuarantinePage } from './FileQuarantinePage';

import { useAuthStore } from '@/store/auth.store';
import type { QuarantinePage, QuarantinedFileDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// Mock ag-grid-react — prevents canvas/DOM environment errors
// ---------------------------------------------------------------------------

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-inner-stub" />,
}));

// ---------------------------------------------------------------------------
// Mock @/components/siem-data-grid
//
// The real SiemDataGrid wraps AgGridReact which needs a full browser DOM.
// This stub renders a simple <table> from rowData and calls the
// onSelectionChanged callback (not needed for these tests but kept for
// completeness). The RowActions cell renderers in FileQuarantinePage are NOT
// rendered by SiemDataGrid — they are defined as AG Grid cellRenderer
// functions inside columnDefs. We therefore expose the row actions directly
// by rendering them using the columnDefs passed down.
//
// Strategy: render a <tbody> with one <tr> per row. For the Actions column
// (last colDef whose headerName === 'Actions'), invoke its cellRenderer prop
// and render the result so Restore/Delete buttons are accessible.
// ---------------------------------------------------------------------------

vi.mock('@/components/siem-data-grid', () => ({
  // forwardRef is required because FileQuarantinePage passes a gridRef to SiemDataGrid.
  SiemDataGrid: React.forwardRef(function SiemDataGridStub(
    {
      columnDefs,
      rowData,
      loading,
      onRowClicked,
    }: {
      columnDefs: Array<{
        headerName?: string;
         
        cellRenderer?: (params: { data: unknown; value: unknown }) => React.ReactNode;
      }>;
      rowData?: unknown[];
      loading?: boolean;
      onRowClicked?: (event: { data: unknown }) => void;
    },
    _ref: React.Ref<unknown>,
  ) {
    if (loading) {
      return <div data-testid="siem-data-grid-loading" aria-busy="true" />;
    }

    const actionsCol = columnDefs.find((c) => c.headerName === 'Actions');

    return (
      <table data-testid="siem-data-grid">
        <tbody>
          {(rowData ?? []).map((row, i) => (
            <tr key={i} data-testid={`grid-row-${i}`} onClick={() => onRowClicked?.({ data: row })}>
              <td>
                {actionsCol?.cellRenderer?.({
                  data: row,
                  value: (row as Record<string, unknown>)['id'],
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }),
}));

// ---------------------------------------------------------------------------
// Mock HaConfirmationModal
//
// Renders a lightweight div that surfaces:
//   - the modal title (via data-testid="confirm-modal-title")
//   - the modal message (via data-testid="confirm-modal-message")
//   - a "Confirm" button wired to onConfirm
//   - a "Cancel" button wired to onCancel
// Visible only when isOpen === true.
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-confirmation-modal/HaConfirmationModal', () => ({
  HaConfirmationModal: ({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="confirm-modal" role="dialog" aria-modal="true">
        <span data-testid="confirm-modal-title">{title}</span>
        <span data-testid="confirm-modal-message">{message}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>{cancelLabel}</button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Mock resolveHaToken — avoids getComputedStyle calls in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHaThemeTokens', () => ({
  resolveHaToken: () => '#000000',
}));

// ---------------------------------------------------------------------------
// Mock @/hooks/useQuarantine
// ---------------------------------------------------------------------------

const mockMutateSingle = vi.fn();
const mockMutateBulk = vi.fn();

const mockUseQuarantinedFiles = vi.fn();
const mockUseIsolatedHosts = vi.fn();
const mockUseQuarantineAction = vi.fn();
const mockUseQuarantineBulkAction = vi.fn();

vi.mock('@/hooks/useQuarantine', () => ({
  useQuarantinedFiles: (...args: unknown[]) => mockUseQuarantinedFiles(...args),
  useIsolatedHosts: (...args: unknown[]) => mockUseIsolatedHosts(...args),
  useQuarantineAction: () => mockUseQuarantineAction(),
  useQuarantineBulkAction: () => mockUseQuarantineBulkAction(),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeQuarantinePage(overrides: Partial<QuarantinePage> = {}): QuarantinePage {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    number: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<QuarantinedFileDTO> = {}): QuarantinedFileDTO {
  return {
    id: 1,
    agentId: 'agent-abc',
    agentName: 'Workstation-01',
    filename: 'malware.exe',
    filePath: 'C:\\Users\\user\\Downloads\\malware.exe',
    sha256Hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    fileSize: 204800,
    quarantineTime: '2026-07-24T10:00:00.000Z',
    status: 'quarantined',
    quarantinedBy: 'SYSTEM',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<FileQuarantinePage />);
}

// ---------------------------------------------------------------------------
// Default mock values applied before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  useAuthStore.setState({
    user: {
      id: 1,
      login: 'analyst',
      firstName: 'Ari',
      lastName: 'Patel',
      email: 'ari@example.test',
      roles: ['ROLE_ANALYST'],
      langKey: 'en',
    },
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    selectedTenantId: null,
  });

  (mockUseQuarantineAction as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutateSingle,
    isPending: false,
  });

  (mockUseQuarantineBulkAction as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutateBulk,
    isPending: false,
  });

  mockUseIsolatedHosts.mockReturnValue({
    data: { content: [], totalElements: 0, totalPages: 0, number: 0 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: Date.now(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileQuarantinePage', () => {
  // 1. Loading state
  it('renders the loading state in the grid when isLoading is true', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderPage();

    // SiemDataGrid stub renders aria-busy="true" when loading prop is true
    const loadingGrid = screen.getByTestId('siem-data-grid-loading');
    expect(loadingGrid).toBeDefined();
    expect(loadingGrid.getAttribute('aria-busy')).toBe('true');

    // No rows should be rendered
    expect(screen.queryByTestId('grid-row-0')).toBeNull();

    // No confirmation modal should be open
    expect(screen.queryByTestId('confirm-modal')).toBeNull();

    // Neither mutation should have fired
    expect(mockMutateSingle).not.toHaveBeenCalled();
    expect(mockMutateBulk).not.toHaveBeenCalled();
  });

  // 2. Empty state
  it('renders "No quarantined files found" when content is empty and loading is complete', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [], totalElements: 0 }),
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    // Empty state text
    expect(screen.getByText(/no quarantined files found/i)).toBeDefined();

    // The secondary hint mentions HiveArmor
    expect(screen.getByText(/HiveArmor agents will appear here/i)).toBeDefined();

    // Grid should not be rendered in empty state (page only renders grid when isLoading || rows.length > 0)
    expect(screen.queryByTestId('siem-data-grid')).toBeNull();
    expect(screen.queryByTestId('siem-data-grid-loading')).toBeNull();

    // No mutations
    expect(mockMutateSingle).not.toHaveBeenCalled();
    expect(mockMutateBulk).not.toHaveBeenCalled();
  });

  // 3. Error state
  it('renders a PatternFly Alert with danger variant when isError is true', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Connection refused to quarantine service'),
    });

    renderPage();

    // PatternFly v6 Alert with variant="danger" renders an h4 heading whose
    // accessible name contains the alert title text
    const alertHeading = screen.getByRole('heading', {
      name: /failed to load quarantined files/i,
    });
    expect(alertHeading).toBeDefined();

    // The error message body should also be visible
    expect(screen.getByText(/Connection refused to quarantine service/i)).toBeDefined();

    // No mutations
    expect(mockMutateSingle).not.toHaveBeenCalled();
    expect(mockMutateBulk).not.toHaveBeenCalled();
  });

  // 4. Loaded state — rows rendered, Delete shows modal BEFORE mutation fires
  it('renders rows and opens a confirmation modal before firing the delete mutation', () => {
    const row = makeRow({ id: 42, filename: 'ransomware.dll', status: 'quarantined' });

    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [row], totalElements: 1, totalPages: 1 }),
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    // Grid is rendered with the row
    expect(screen.getByTestId('siem-data-grid')).toBeDefined();
    expect(screen.getByTestId('grid-row-0')).toBeDefined();

    // Confirmation modal is NOT open yet
    expect(screen.queryByTestId('confirm-modal')).toBeNull();

    // Mutation has NOT fired yet
    expect(mockMutateSingle).not.toHaveBeenCalled();

    // Click the Delete button for the row (aria-label set in RowActions)
    const deleteButton = screen.getByRole('button', {
      name: /delete ransomware\.dll/i,
    });
    fireEvent.click(deleteButton);

    // Modal MUST be open before mutation fires
    const modal = screen.getByTestId('confirm-modal');
    expect(modal).toBeDefined();
    expect(screen.getByTestId('confirm-modal-title').textContent).toBe('Permanently delete preserved file?');
    expect(screen.getByTestId('confirm-modal-message').textContent).toContain(
      'ransomware.dll',
    );

    // Mutation has STILL not fired — just the modal is open
    expect(mockMutateSingle).not.toHaveBeenCalled();

    // Confirm the deletion
    const confirmButton = screen.getByRole('button', { name: /delete permanently/i });
    fireEvent.click(confirmButton);

    // NOW the mutation fires with the correct arguments
    expect(mockMutateSingle).toHaveBeenCalledTimes(1);
    expect(mockMutateSingle).toHaveBeenCalledWith({ id: 42, action: 'delete' });

    // Bulk mutation must NOT have been invoked
    expect(mockMutateBulk).not.toHaveBeenCalled();

    // Modal is dismissed after confirming
    expect(screen.queryByTestId('confirm-modal')).toBeNull();
  });

  it('requires confirmation before requesting a file restore', () => {
    const row = makeRow({ id: 73, filename: 'approved-tool.exe', status: 'quarantined' });
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [row], totalElements: 1, totalPages: 1 }),
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /restore approved-tool\.exe/i }));

    expect(screen.getByTestId('confirm-modal-title').textContent).toBe('Restore quarantined file?');
    expect(screen.getByTestId('confirm-modal-message').textContent).toContain('becomes available');
    expect(mockMutateSingle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /request restore/i }));
    expect(mockMutateSingle).toHaveBeenCalledWith({ id: 73, action: 'restore' });
  });

  it('uses bounded server pagination when the analyst requests the next page', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [makeRow()], totalElements: 64, totalPages: 3, number: 0 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    expect(mockUseQuarantinedFiles).toHaveBeenLastCalledWith({
      page: 1,
      size: 25,
      status: undefined,
    });
  });

  it('opens progressive file context from a selected result row', () => {
    const row = makeRow({ filename: 'ransomware.dll', threatName: 'Ransomware:Precursor' });
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [row], totalElements: 1, totalPages: 1 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByTestId('grid-row-0'));

    expect(screen.getByText('ransomware.dll')).toBeDefined();
    expect(screen.getByRole('button', { name: /request restore/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /delete permanently/i })).toBeDefined();
  });

  it('shows honest access denied for roles outside Analyst, SOC Manager, and Platform Administrator', () => {
    useAuthStore.setState({
      user: {
        id: 9,
        login: 'reader',
        firstName: 'Read',
        lastName: 'Only',
        email: 'reader@example.test',
        roles: ['ROLE_USER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });

    renderPage();

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Required permission: Analyst, SOC Manager, or Platform Administrator/i)).toBeDefined();
    expect(screen.queryByText(/ROLE_/)).toBeNull();
    expect(mockUseQuarantinedFiles).not.toHaveBeenCalled();
  });

  it('allows SOC Manager through the page gate without calling legacy /api/edr quarantine', () => {
    useAuthStore.setState({
      user: {
        id: 2,
        login: 'soc.manager',
        firstName: 'Sam',
        lastName: 'Manager',
        email: 'soc@example.test',
        roles: ['ROLE_SOC_MANAGER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });

    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [], totalElements: 0, totalPages: 0 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.queryByText(/Required permission/i)).toBeNull();
    expect(screen.getByText(/no quarantined files found/i)).toBeDefined();
    expect(mockUseQuarantinedFiles).toHaveBeenCalled();
  });

  it('shows honest empty host isolation inventory from secured ha-edr path', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [], totalElements: 0, totalPages: 0 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });
    mockUseIsolatedHosts.mockReturnValue({
      data: {
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        snapshotAt: '2026-08-25T06:10:00Z',
        asOf: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
    });

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /endpoint isolation/i }));

    expect(screen.getByText(/no isolated hosts/i)).toBeDefined();
    expect(screen.getByText(/legacy \/api\/edr\/isolation is not used/i)).toBeDefined();
    expect(mockUseIsolatedHosts).toHaveBeenCalled();
  });

  it('shows server isolation snapshot freshness banner', () => {
    mockUseQuarantinedFiles.mockReturnValue({
      data: makeQuarantinePage({ content: [], totalElements: 0, totalPages: 0 }),
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      dataUpdatedAt: Date.now(),
    });
    mockUseIsolatedHosts.mockReturnValue({
      data: {
        content: [{
          id: 91,
          agentId: 'agent-fin-wks-044',
          hostname: 'FIN-WKS-044',
          isolationType: 'FULL',
          status: 'ACTIVE',
          isolatedAt: '2026-08-25T05:00:00Z',
          actionedBy: 'Maya Chen',
        }],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        snapshotAt: '2026-08-25T06:15:00.000Z',
        asOf: '2026-08-25T05:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
    });

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /endpoint isolation/i }));

    expect(screen.getByLabelText(/host isolation inventory freshness/i)).toBeDefined();
    expect(screen.getByText(/STAGING CANDIDATE · page read time, not cursor\/PIT-bound/i)).toBeDefined();
    expect(screen.getAllByText(/Snapshot/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/as of/i).length).toBeGreaterThan(0);
  });
});
