/**
 * EnrollmentAuditPage — append-only agent enrollment audit ledger.
 * Route: /admin/enrollment-audit
 * Contract: GET /api/ha-agent-enrollments/audit (+ /export NDJSON)
 * Authority: Platform Administrator | SOC Manager
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Download } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import {
  downloadEnrollmentAuditExport,
  listEnrollmentAudit,
  type EnrollmentAuditEventDTO,
} from '@/services/enrollmentAudit.service';
import { useAuthStore } from '@/store/auth.store';

const PAGE_SIZE = 25;

const ENROLLMENT_AUDIT_ROLES = [ROLES.ADMIN, ROLES.SOC_MANAGER] as const;

function formatOccurredAt(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function EnrollmentAuditPage(): JSX.Element {
  const hasAnyRole = useAuthStore((state) => state.hasAnyRole);
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const canView = hasAnyRole([...ENROLLMENT_AUDIT_ROLES]);
  const tenantSelected = selectedTenantId !== null && selectedTenantId > 0;

  const [page, setPage] = useState(0);
  const [eventType, setEventType] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [agentUuid, setAgentUuid] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [density] = useRowDensity();

  const filters = useMemo(
    () => ({
      page,
      size: PAGE_SIZE,
      eventType: eventType.trim() || undefined,
      tokenId: tokenId.trim() || undefined,
      agentUuid: agentUuid.trim() || undefined,
    }),
    [agentUuid, eventType, page, tokenId]
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['enrollment-audit', selectedTenantId, filters],
    queryFn: ({ signal }) => listEnrollmentAudit(filters, signal),
    enabled: canView && tenantSelected,
    retry: false,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columnDefs = useMemo<ColDef<EnrollmentAuditEventDTO>[]>(
    () => [
      {
        field: 'occurredAt',
        headerName: 'Occurred',
        width: 168,
        valueFormatter: ({ value }) => formatOccurredAt(value as string | null),
      },
      { field: 'eventType', headerName: 'Event', flex: 1, minWidth: 140 },
      { field: 'actor', headerName: 'Actor', width: 140 },
      {
        field: 'reason',
        headerName: 'Reason',
        flex: 1.2,
        minWidth: 160,
        valueFormatter: ({ value }) => (value as string)?.trim() || '—',
      },
      {
        field: 'tokenId',
        headerName: 'Token',
        width: 120,
        cellStyle: { fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' },
        valueFormatter: ({ value }) => {
          const raw = (value as string)?.trim();
          if (!raw) return '—';
          return raw.length > 10 ? `${raw.slice(0, 8)}…` : raw;
        },
      },
      {
        field: 'agentUuid',
        headerName: 'Agent',
        width: 140,
        cellStyle: { fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' },
        valueFormatter: ({ value }) => {
          const raw = (value as string)?.trim();
          if (!raw) return '—';
          return raw.length > 12 ? `${raw.slice(0, 10)}…` : raw;
        },
      },
      { field: 'platform', headerName: 'Platform', width: 100 },
      {
        field: 'credentialVersion',
        headerName: 'Cred ver',
        width: 88,
        valueFormatter: ({ value }) =>
          typeof value === 'number' && value > 0 ? String(value) : '—',
      },
    ],
    []
  );

  const onExport = async (): Promise<void> => {
    setExportError(null);
    setExporting(true);
    try {
      await downloadEnrollmentAuditExport({
        eventType: filters.eventType,
        tokenId: filters.tokenId,
        agentUuid: filters.agentUuid,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorState
          title="Enrollment audit restricted"
          message={`Required permission: ${ROLE_LABELS[ROLES.ADMIN]} or ${ROLE_LABELS[ROLES.SOC_MANAGER]}.`}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="Enrollment Audit"
        description="Append-only ledger from GET /api/ha-agent-enrollments/audit — safe fields only; secrets never returned."
        actions={
          <HaButton
            variant="secondary"
            icon={<Download size={14} />}
            onClick={() => void onExport()}
            isDisabled={exporting || isLoading || !tenantSelected}
            title={
              tenantSelected
                ? 'Download NDJSON via GET /api/ha-agent-enrollments/audit/export'
                : 'Select an authorized tenant in the masthead before exporting'
            }
          >
            {exporting ? 'Exporting…' : 'Export NDJSON'}
          </HaButton>
        }
      />

      <div
        role="status"
        style={{
          margin: '0 24px 12px',
          padding: '10px 12px',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          background: 'var(--ha-surface-primary)',
          color: 'var(--ha-text-secondary)',
          fontSize: 'var(--ha-text-sm)',
        }}
      >
        <strong style={{ color: 'var(--ha-text-primary)' }}>
          {tenantSelected ? `Tenant ${selectedTenantId}` : 'Tenant required'}
        </strong>
        {' — '}
        Source policy is append-only (<code>X-Audit-Source-Policy</code> on export). Enrollment audit
        is tenant-scoped; “All authorized tenants” in the masthead cannot call this API.
      </div>

      {exportError && (
        <div
          role="alert"
          style={{
            margin: '0 24px 12px',
            padding: '10px 12px',
            border: '1px solid var(--ha-critical)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-critical)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          {exportError}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: '0 24px 12px',
        }}
        role="toolbar"
        aria-label="Enrollment audit filters"
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
          Event type
          <input
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value);
              setPage(0);
            }}
            placeholder="e.g. TOKEN_CREATED"
            disabled={!tenantSelected}
            style={{
              minWidth: 160,
              padding: '6px 8px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
          Token id
          <input
            value={tokenId}
            onChange={(event) => {
              setTokenId(event.target.value);
              setPage(0);
            }}
            placeholder="Filter token"
            disabled={!tenantSelected}
            style={{
              minWidth: 160,
              padding: '6px 8px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-text-primary)',
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-sm)',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
          Agent UUID
          <input
            value={agentUuid}
            onChange={(event) => {
              setAgentUuid(event.target.value);
              setPage(0);
            }}
            placeholder="Filter agent"
            disabled={!tenantSelected}
            style={{
              minWidth: 180,
              padding: '6px 8px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-text-primary)',
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-sm)',
            }}
          />
        </label>
        <HaButton variant="plain" onClick={() => void refetch()} isDisabled={isFetching || !tenantSelected}>
          Refresh
        </HaButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '0 24px 16px' }}>
        {!tenantSelected ? (
          <EmptyState
            title="Select a tenant to load enrollment audit"
            description="Choose an authorized tenant in the masthead scope switcher. “All authorized tenants” cannot query GET /api/ha-agent-enrollments/audit (backend requires X-Tenant-ID)."
          />
        ) : isLoading ? (
          <LoadingState message="Loading enrollment audit…" />
        ) : isError ? (
          <ErrorState
            title="Could not load enrollment audit"
            message={error instanceof Error ? error.message : 'Unexpected error'}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No enrollment audit events"
            description="Events appear when enrollment tokens are created, agents enroll, or credentials rotate/revoke for the selected tenant."
          />
        ) : (
          <SiemDataGrid
            className="enrollment-audit-grid"
            columnDefs={columnDefs}
            rowData={items}
            rowHeight={ROW_HEIGHTS[density]}
            getRowId={(params) => (params.data as EnrollmentAuditEventDTO).id}
            ariaLabel="Enrollment audit ledger"
            defaultColDef={{ filter: false }}
          />
        )}
      </div>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 24px',
          borderTop: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
        }}
        aria-label="Enrollment audit pagination"
      >
        <span>
          {total.toLocaleString()} event{total === 1 ? '' : 's'} · page {page + 1} of {pageCount}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={page === 0 || isFetching}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-primary)',
              color: 'var(--ha-text-primary)',
              opacity: page === 0 ? 0.5 : 1,
            }}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * PAGE_SIZE >= total || isFetching}
            onClick={() => setPage((current) => current + 1)}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-primary)',
              color: 'var(--ha-text-primary)',
              opacity: (page + 1) * PAGE_SIZE >= total ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      </footer>
    </div>
  );
}
