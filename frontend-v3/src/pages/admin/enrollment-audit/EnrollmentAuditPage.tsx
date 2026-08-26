/**
 * EnrollmentAuditPage — append-only agent enrollment audit ledger.
 * Route: /admin/enrollment-audit
 * Contract: GET /api/ha-agent-enrollments/audit (+ /export NDJSON)
 * Authority: Platform Administrator | SOC Manager
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
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
  EnrollmentAuditTenantRequiredError,
  type EnrollmentAuditEventDTO,
} from '@/services/enrollmentAudit.service';
import { useAuthStore } from '@/store/auth.store';

const PAGE_SIZE = 25;

const ENROLLMENT_AUDIT_ROLES = [ROLES.ADMIN, ROLES.SOC_MANAGER] as const;

type LifecycleEventTone = 'neutral' | 'warning' | 'critical';
type LifecycleEventCategory = 'Enrollment token' | 'Device credential' | 'Audit event';

const ENROLLMENT_AUDIT_EVENT_FILTERS = [
  { value: 'enrollment.token.created', label: 'Token created', category: 'Enrollment token', tone: 'neutral' },
  { value: 'enrollment.token.consumed', label: 'Token consumed', category: 'Enrollment token', tone: 'neutral' },
  { value: 'enrollment.token.revoked', label: 'Token revoked', category: 'Enrollment token', tone: 'critical' },
  { value: 'agent.credential.rotated', label: 'Credential rotated', category: 'Device credential', tone: 'warning' },
  { value: 'agent.credential.revoked', label: 'Credential revoked', category: 'Device credential', tone: 'critical' },
] as const;

function truncateWithEllipsis(raw: string, maxLen: number): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLen - 1))}…`;
}

function getLifecycleEventPresentation(eventType: string | null | undefined): {
  category: LifecycleEventCategory;
  label: string;
  tone: LifecycleEventTone;
} {
  const normalized = (eventType ?? '').trim();
  const match = ENROLLMENT_AUDIT_EVENT_FILTERS.find((e) => e.value === normalized);
  if (match) {
    return { category: match.category, label: match.label, tone: match.tone };
  }
  // Backend allowlist is strict; this is a safe fallback for unexpected data.
  return { category: 'Audit event', label: normalized || '—', tone: 'neutral' };
}

function LifecycleEventCellRenderer(
  params: ICellRendererParams<EnrollmentAuditEventDTO>
): JSX.Element {
  const { category, label, tone } = getLifecycleEventPresentation(params.data?.eventType);

  const badgeBg =
    tone === 'critical'
      ? 'color-mix(in srgb, var(--ha-critical) 18%, transparent)'
      : tone === 'warning'
        ? 'color-mix(in srgb, var(--ha-high) 16%, transparent)'
        : 'color-mix(in srgb, var(--ha-medium) 14%, transparent)';

  const badgeColor =
    tone === 'critical'
      ? 'var(--ha-critical)'
      : tone === 'warning'
        ? 'var(--ha-high)'
        : 'var(--ha-primary)';

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span
        title={category}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 6px',
          borderRadius: 'var(--ha-radius-sm)',
          border: '1px solid var(--ha-border)',
          background: badgeBg,
          color: badgeColor,
          fontFamily: 'var(--ha-font-ui)',
          fontSize: 'var(--ha-text-xs)',
          lineHeight: '1',
          letterSpacing: '0.2px',
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        {category}
      </span>
      <span
        title={label}
        style={{
          fontFamily: 'var(--ha-font-ui)',
          fontSize: 'var(--ha-text-sm)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </span>
  );
}

function TruncatedTextCellRenderer(props: {
  value: unknown;
  maxLen: number;
  titleIfTrimmedEmpty?: string;
}): JSX.Element {
  const raw = typeof props.value === 'string' ? props.value : '';
  const trimmed = raw.trim();
  const shown = trimmed ? truncateWithEllipsis(trimmed, props.maxLen) : props.titleIfTrimmedEmpty ?? '—';
  return (
    <span
      title={trimmed || undefined}
      style={{ fontFamily: 'var(--ha-font-ui)', fontSize: 'var(--ha-text-sm)', whiteSpace: 'nowrap' }}
    >
      {shown}
    </span>
  );
}

function ReasonCellRenderer(props: { value: unknown; maxLen: number }): JSX.Element {
  const raw = typeof props.value === 'string' ? props.value : '';
  const trimmed = raw.trim();
  const shown = trimmed ? truncateWithEllipsis(trimmed, props.maxLen) : '—';
  return (
    <span
      title={trimmed || undefined}
      style={{
        fontFamily: 'var(--ha-font-ui)',
        fontSize: 'var(--ha-text-sm)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {shown}
    </span>
  );
}

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
      {
        field: 'eventType',
        headerName: 'Lifecycle event',
        flex: 1,
        minWidth: 220,
        cellRenderer: LifecycleEventCellRenderer,
      },
      {
        field: 'actor',
        headerName: 'Actor',
        width: 170,
        cellRenderer: (params: ICellRendererParams<EnrollmentAuditEventDTO>) => (
          <TruncatedTextCellRenderer
            value={params.value}
            maxLen={18}
            titleIfTrimmedEmpty="—"
          />
        ),
      },
      {
        field: 'reason',
        headerName: 'Reason',
        flex: 1.6,
        minWidth: 200,
        cellRenderer: (params: ICellRendererParams<EnrollmentAuditEventDTO>) => (
          <ReasonCellRenderer value={params.value} maxLen={110} />
        ),
      },
      {
        field: 'tokenId',
        headerName: 'Token id',
        width: 130,
        cellStyle: { fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' },
        valueFormatter: ({ value }) => {
          const raw = (value as string)?.trim();
          if (!raw) return '—';
          return raw.length > 10 ? `${raw.slice(0, 8)}…` : raw;
        },
      },
      {
        field: 'agentUuid',
        headerName: 'Agent UUID',
        width: 160,
        cellStyle: { fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' },
        valueFormatter: ({ value }) => {
          const raw = (value as string)?.trim();
          if (!raw) return '—';
          return raw.length > 12 ? `${raw.slice(0, 10)}…` : raw;
        },
      },
      { field: 'platform', headerName: 'Platform', width: 100 },
      {
        field: 'policyId',
        headerName: 'Policy',
        width: 130,
        cellStyle: { fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)' },
        valueFormatter: ({ value }) => {
          const raw = (value as string)?.trim();
          if (!raw) return '—';
          return raw.length > 16 ? `${raw.slice(0, 12)}…` : raw;
        },
      },
      {
        field: 'credentialVersion',
        headerName: 'Credential ver',
        width: 88,
        valueFormatter: ({ value }) =>
          typeof value === 'number' && value > 0 ? String(value) : '—',
      },
      {
        field: 'enrollmentVersion',
        headerName: 'Enroll ver',
        width: 98,
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
        description="Review tenant-scoped enrollment token lifecycle and agent credential rotate/revoke events using safe identifiers only (GET /api/ha-agent-enrollments/audit; secret values never returned)."
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
          <select
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value);
              setPage(0);
            }}
            disabled={!tenantSelected}
            style={{
              minWidth: 220,
              padding: '6px 8px',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            <option value="">All event types</option>
            {ENROLLMENT_AUDIT_EVENT_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
          error instanceof EnrollmentAuditTenantRequiredError ? (
            <EmptyState
              title="Select a tenant to load enrollment audit"
              description="Choose an authorized tenant in the masthead scope switcher. Enrollment audit is tenant-scoped; export and list both require an X-Tenant-ID."
              action={undefined}
            />
          ) : (
            <ErrorState
              title="Enrollment audit ledger unavailable"
              message="The audit trail could not be loaded right now. Try refreshing, or verify backend connectivity for this tenant."
              onRetry={() => void refetch()}
            />
          )
        ) : items.length === 0 ? (
          <EmptyState
            title="No enrollment audit events"
            description="This tenant currently has no enrollment token lifecycle or credential rotate/revoke events in the append-only ledger. Token/credential secret values are intentionally withheld by the backend; the UI shows safe identifiers and lifecycle state changes only."
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
