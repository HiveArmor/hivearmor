/**
 * AuditPage.tsx — Audit Log viewer (ADM-07)
 * Read-only grid with server-side pagination, filters, and NDJSON export
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Download, History } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import { ApiError, apiClient } from '@/lib/apiClient';
import { downloadAuditLogExport } from '@/services/auditLog.service';
import { useAuthStore } from '@/store/auth.store';

interface AuditLogDTO {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  ipAddress: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

interface AuditLogFilters {
  from: string;
  to: string;
  action: string;
  user: string;
  page: number;
  size: number;
}

async function getAuditLog(filters: AuditLogFilters): Promise<{ data: AuditLogDTO[]; total: number }> {
  return apiClient.get<{ data: AuditLogDTO[]; total: number }>('/ha-audit-log', { params: { ...filters } });
}

export function AuditPage(): JSX.Element {
  const [density] = useRowDensity();
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole('ROLE_ADMIN');

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [filters, setFilters] = useState<AuditLogFilters>({
    from: sevenDaysAgo,
    to: today,
    action: '',
    user: '',
    page: 0,
    size: 100,
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => getAuditLog(filters),
    retry: false,
  });

  const auditStatus = error instanceof ApiError ? error.status : null;
  const auditErrorMessage =
    auditStatus !== null
      ? `GET /api/ha-audit-log returned HTTP ${String(auditStatus)}. The audit grid stays empty until that endpoint succeeds.`
      : error instanceof Error
        ? error.message
        : 'GET /api/ha-audit-log could not be reached.';

  const handlePageChange = (page: number): void => {
    setFilters({ ...filters, page });
  };

  const handleExport = async (): Promise<void> => {
    setExportError(null);
    setExporting(true);
    try {
      await downloadAuditLogExport({
        from: filters.from || undefined,
        to: filters.to || undefined,
        action: filters.action || undefined,
        user: filters.user || undefined,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Audit export failed.');
    } finally {
      setExporting(false);
    }
  };

  const SeverityCell = (params: { value: unknown }): JSX.Element => {
    const value = params.value as 'info' | 'warning' | 'critical';
    const colors: Record<string, string> = {
      info: 'var(--ha-positive)',
      warning: 'var(--ha-high)',
      critical: 'var(--ha-critical)',
    };

    return (
      <span
        style={{
          color: colors[value] ?? 'var(--ha-text-secondary)',
          textTransform: 'capitalize',
        }}
      >
        {value}
      </span>
    );
  };

  const TimestampCell = (params: { value: unknown }): JSX.Element => {
    const value = params.value as string;
    const date = new Date(value);
    return (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {date.toLocaleString()}
      </span>
    );
  };

  const columnDefs: ColDef[] = [
    {
      field: 'timestamp',
      headerName: 'Timestamp',
      width: 180,
      cellRenderer: TimestampCell,
    },
    {
      field: 'action',
      headerName: 'Action',
      width: 160,
      cellStyle: { textTransform: 'capitalize' },
    },
    {
      field: 'user',
      headerName: 'User',
      width: 140,
    },
    {
      field: 'ipAddress',
      headerName: 'IP Address',
      width: 140,
      cellStyle: { fontFamily: 'var(--ha-font-mono)' },
    },
    {
      field: 'details',
      headerName: 'Details',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 120,
      cellRenderer: SeverityCell,
    },
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Audit Log" />
        <LoadingState rows={15} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Audit Log" />
        <div style={{ padding: 24 }}>
          <ErrorState
            title="Audit log is unavailable"
            message={auditErrorMessage}
          />
        </div>
      </div>
    );
  }

  const isEmpty = !data || data.data.length === 0;
  const totalPages = data ? Math.ceil(data.total / filters.size) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Audit Log"
        actions={
          isAdmin ? (
            <HaButton
              variant="secondary"
              icon={<Download size={16} />}
              isDisabled={exporting}
              onClick={() => {
                void handleExport();
              }}
              title="Download NDJSON via GET /api/ha-audit-log/export (safe fields; payload omitted)"
            >
              {exporting ? 'Exporting…' : 'Export NDJSON'}
            </HaButton>
          ) : undefined
        }
      />

      {exportError !== null && (
        <div
          style={{
            margin: '12px 24px 0',
            padding: '8px 12px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-critical)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            background: 'color-mix(in srgb, var(--ha-critical) 12%, transparent)',
          }}
        >
          {exportError}
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          padding: '12px 24px',
          background: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 500,
            }}
          >
            From:
          </label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 0 })}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              backgroundColor: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 500,
            }}
          >
            To:
          </label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 0 })}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              backgroundColor: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 500,
            }}
          >
            Action:
          </label>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 0 })}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              backgroundColor: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              minWidth: '140px',
            }}
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="rule_created">Rule Created</option>
            <option value="rule_modified">Rule Modified</option>
            <option value="user_created">User Created</option>
            <option value="agent_command">Agent Command</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: '200px' }}>
          <label
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 500,
            }}
          >
            User:
          </label>
          <input
            type="text"
            value={filters.user}
            onChange={(e) => setFilters({ ...filters, user: e.target.value, page: 0 })}
            placeholder="Search by username"
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              backgroundColor: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, padding: 24 }}>
        {isEmpty ? (
          <EmptyState
            icon={<History size={48} />}
            title="No audit log entries found"
            description="No audit log entries match the current filter criteria."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <SiemDataGrid
                columnDefs={columnDefs}
                rowData={data.data}
                height="100%"
                rowHeight={ROW_HEIGHTS[density]}
                getRowId={(params) => (params.data as AuditLogDTO).id}
              />
            </div>

            {/* Pagination Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
              }}
            >
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
                Showing {filters.page * filters.size + 1} - {Math.min((filters.page + 1) * filters.size, data.total)} of {data.total.toLocaleString()} entries
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <HaButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(filters.page - 1)}
                  disabled={filters.page === 0}
                >
                  Previous
                </HaButton>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    fontSize: 'var(--ha-text-sm)',
                    color: 'var(--ha-text-primary)',
                  }}
                >
                  Page {filters.page + 1} of {totalPages}
                </div>
                <HaButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(filters.page + 1)}
                  disabled={filters.page >= totalPages - 1}
                >
                  Next
                </HaButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
