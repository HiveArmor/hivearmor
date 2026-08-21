/**
 * DataSourceStatusPage — /inputs/sources route target.
 *
 * Renders a SiemDataGrid with aggregated data source health, an EPS trend
 * column backed by EpsSparkline, and an "Add Data Source" toolbar button that
 * opens AddDataSourceWizard.
 *
 * Design-system invariants:
 *   - All colors reference `--ha-*` CSS custom properties only; no hex literals.
 *   - No `any` TypeScript types.
 *   - JWT read only via apiClient (never directly from localStorage).
 *   - Server state managed via TanStack Query v5 (useDataSources, 30 s refetch).
 *
 * Requirements: 10.1, 10.2, 13.5, 13.9
 */

import type React from 'react';
import { useMemo, useState } from 'react';

import type { ColDef } from 'ag-grid-community';

import { AddDataSourceWizard } from './AddDataSourceWizard/AddDataSourceWizard';

import { EpsSparkline } from '@/components/eps-sparkline/EpsSparkline';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useDataSources } from '@/hooks/useDataSources';
import type { HaDataSourceHealth, HaDataSourceRecord, HaDataSourceType } from '@/types/dataSource.types';


// ---------------------------------------------------------------------------
// Helpers — all colors via --ha-* tokens, never hex literals
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each data source type.
 * Keeps the grid cell readable without exposing raw enum strings.
 */
const TYPE_LABELS: Record<HaDataSourceType, string> = {
  syslog:      'Syslog',
  wineventlog: 'Windows Event Log',
  agent:       'HiveArmor Agent',
  kafka:       'Kafka',
  aws:         'AWS',
  azure:       'Azure',
  gcp:         'GCP',
};

/**
 * Combined health label from both grpcStatus and opensearchStatus.
 * Returns 'Ok' only when both adapters report ok; otherwise 'Degraded' or
 * 'Unreachable' to communicate the worst sub-status to the operator.
 */
function combinedStatusLabel(
  grpc: HaDataSourceHealth,
  os: HaDataSourceHealth,
): string {
  if (grpc === 'ok' && os === 'ok') return 'Ok';
  if (grpc === 'unreachable' && os === 'unreachable') return 'Unreachable';
  return 'Degraded';
}

/**
 * Maps a combined status label to a design-token color.
 * No hex literals — all values reference `--ha-*` custom properties.
 */
function statusTokenColor(label: string): string {
  if (label === 'Ok') return 'var(--ha-positive)';
  if (label === 'Unreachable') return 'var(--ha-critical)';
  return 'var(--ha-high)'; // Degraded
}

/**
 * Formats an ISO-8601 timestamp for display; returns an em dash when null.
 * Uses locale-aware formatting with tabular numerics for alignment.
 */
function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

/**
 * Builds the SiemDataGrid column definitions for the data source table.
 * Extracted into a factory so it can be wrapped in useMemo without inline
 * JSX in the hook dependency array.
 *
 * The EPS Trend column uses a cellRenderer returning EpsSparkline, which
 * reads its color from `--ha-primary` at render time (Req 10.2, 10.3).
 */
function buildColumnDefs(): ColDef[] {
  return [
    // ── Name ──────────────────────────────────────────────────────────────
    {
      headerName: 'Name',
      field: 'name',
      flex: 2,
      minWidth: 160,
      cellStyle: {
        color: 'var(--ha-text-primary)',
        fontFamily: 'Inter, sans-serif',
        fontWeight: '500',
      } as Record<string, string>,
    },

    // ── Type ──────────────────────────────────────────────────────────────
    {
      headerName: 'Type',
      field: 'type',
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: { value: HaDataSourceType }) =>
        TYPE_LABELS[params.value] ?? params.value,
      cellStyle: {
        color: 'var(--ha-text-secondary)',
        fontFamily: 'Inter, sans-serif',
      } as Record<string, string>,
    },

    // ── Status (combined grpcStatus + opensearchStatus) ───────────────────
    {
      headerName: 'Status',
      colId: 'status',
      flex: 1,
      minWidth: 120,
      valueGetter: (params: { data: HaDataSourceRecord }) =>
        combinedStatusLabel(params.data.grpcStatus, params.data.opensearchStatus),
      cellRenderer: (params: { value: string }) => (
        <span
          style={{
            color: statusTokenColor(params.value),
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {params.value}
        </span>
      ),
      // Custom comparator so sorting uses the derived label string.
      comparator: (a: string, b: string) => a.localeCompare(b),
    },

    // ── EPS (current numeric value) ───────────────────────────────────────
    {
      headerName: 'EPS',
      field: 'eps',
      flex: 1,
      minWidth: 90,
      type: 'numericColumn',
      valueFormatter: (params: { value: number }) => params.value.toFixed(1),
      cellStyle: {
        color: 'var(--ha-text-primary)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.8125rem',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      } as Record<string, string>,
    },

    // ── EPS Trend (sparkline, Req 10.2) ───────────────────────────────────
    {
      headerName: 'EPS Trend',
      field: 'epsHistory',
      flex: 2,
      minWidth: 160,
      sortable: false,
      filter: false,
      /**
       * cellRenderer renders the EpsSparkline for this row's epsHistory array.
       * EpsSparkline reads its line color from `--ha-primary` (Req 10.3).
       * No hex literals are used here.
       */
      cellRenderer: (params: { value: number[] }) => (
        <EpsSparkline
          series={params.value ?? []}
          ariaLabel="Events-per-second trend sparkline"
        />
      ),
      // enableCellChangeFlash intentionally omitted — sparkline cells should not flash.
    },

    // ── Last Event ────────────────────────────────────────────────────────
    {
      headerName: 'Last Event',
      field: 'lastEventAt',
      flex: 1,
      minWidth: 160,
      valueFormatter: (params: { value: string | null }) =>
        formatTimestamp(params.value),
      cellStyle: {
        color: 'var(--ha-text-secondary)',
        fontFamily: 'Inter, sans-serif',
        fontVariantNumeric: 'tabular-nums',
      } as Record<string, string>,
    },

    // ── Enabled ───────────────────────────────────────────────────────────
    {
      headerName: 'Enabled',
      field: 'enabled',
      flex: 1,
      minWidth: 90,
      valueFormatter: (params: { value: boolean }) =>
        params.value ? 'Yes' : 'No',
      cellStyle: (params: { value: boolean }) =>
        ({
          color: params.value
            ? 'var(--ha-positive)'
            : 'var(--ha-text-secondary)',
          fontFamily: 'Inter, sans-serif',
          fontWeight: String(params.value ? 600 : 400),
        }) as Record<string, string>,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `DataSourceStatusPage` — lists all configured data sources with live
 * aggregated health from gRPC and OpenSearch, an EPS trend sparkline column,
 * and an "Add Data Source" button that opens the AddDataSourceWizard modal.
 *
 * Data is fetched once on mount and automatically refreshed every 30 s by
 * `useDataSources` (Req 10.4). The refetch interval stops when the user
 * navigates away, because TanStack Query v5 cancels it on unmount (Req 10.5).
 */
export function DataSourceStatusPage(): React.ReactElement {
  // ── State ────────────────────────────────────────────────────────────────

  /** Controls whether the AddDataSourceWizard modal is open (Req 11.1). */
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // ── Server state ─────────────────────────────────────────────────────────

  /**
   * useDataSources provides the aggregated source list.
   * It carries refetchInterval: 30_000 and stops automatically on unmount
   * (Req 10.4, 10.5).
   */
  const { data: sources, isPending, isError } = useDataSources();

  // ── Columns ──────────────────────────────────────────────────────────────

  /**
   * Column definitions are stable across renders — built once per page mount.
   * useMemo with an empty array ensures the AG Grid instance is not rebuilt
   * when the data refetches.
   */
  const columnDefs = useMemo(buildColumnDefs, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openWizard = (): void => setIsWizardOpen(true);
  const closeWizard = (): void => setIsWizardOpen(false);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--ha-background)',
        color: 'var(--ha-text-primary)',
      }}
    >
      {/* Page header with "Add Data Source" toolbar button (Req 11.1) */}
      <SiemPageHeader
        title="Data Sources"
        description="Monitor aggregated health and ingest rates for all configured data sources."
        actions={
          <HaButton
            variant="primary"
            onClick={openWizard}
            aria-label="Open Add Data Source wizard"
          >
            Add Data Source
          </HaButton>
        }
      />

      {/* Error banner — uses --ha-critical token, no hex */}
      {isError && (
        <div
          role="alert"
          style={{
            margin: '16px 24px 0',
            padding: '12px 16px',
            borderRadius: 4,
            backgroundColor: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-critical)',
            color: 'var(--ha-critical)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          Failed to load data sources. The list will retry automatically.
        </div>
      )}

      {/* Data grid — fills remaining vertical space */}
      <div
        style={{
          flex: 1,
          padding: '16px 24px 24px',
          minHeight: 0,
        }}
      >
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={sources ?? []}
          loading={isPending}
          getRowId={(params) => (params.data as HaDataSourceRecord).id}
          height="100%"
          rowHeight={52}
          defaultColDef={{
            sortable: true,
            filter: false,
            resizable: true,
          }}
        />
      </div>

      {/* AddDataSourceWizard modal — controlled by isWizardOpen (Req 11.1) */}
      <AddDataSourceWizard
        isOpen={isWizardOpen}
        onClose={closeWizard}
      />
    </div>
  );
}
