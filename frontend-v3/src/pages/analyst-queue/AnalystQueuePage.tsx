/**
 * AnalystQueuePage — per spec 03-ANALYST-QUEUE.md
 * Unified analyst work-queue: AG Grid (server-side), bulk actions,
 * detail drawer, SSE new-alert badge, saved views, time-range selector.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IServerSideDatasource } from 'ag-grid-community';
import { RefreshCw, ShieldAlert } from 'lucide-react';

import { fetchOpenAlertCount } from './analystQueue.service';
import type { QueueFilters } from './analystQueue.types';
import { CreateIncidentModal } from './components/CreateIncidentModal';
import { QueueDetailDrawer } from './components/QueueDetailDrawer';
import { QueueToolbar } from './components/QueueToolbar';
import type { SavedView } from './components/SavedViewsPanel';
import { SavedViewsPanel } from './components/SavedViewsPanel';
import { SseBanner } from './components/SseBanner';
import { QUEUE_COLUMN_DEFS } from './queueColumns';

import { DensitySelector } from '@/components/density-selector';
import { EmptyState } from '@/components/empty-state';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { SiemToolbar } from '@/components/ha-toolbar/SiemToolbar';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock';
import { TimeRangeSelector } from '@/components/time-range-selector';
import { resolveTimeRange } from '@/components/time-range-selector/timeRangeUtils';
import type { TimeRange } from '@/components/time-range-selector/timeRangeUtils';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { convertToIncident, getAlerts } from '@/services/alerts.service';
import { useAlertStreamStore } from '@/store/alertStream.store';
import { useAuthStore } from '@/store/auth.store';
import type { QueueItem } from '@/types/alert.types';

// ── Bulk action API ────────────────────────────────────────────────────────────

async function bulkUpdateStatus(
  alertIds: string[],
  action: 'REVIEWED' | 'FALSE_POSITIVE'
): Promise<void> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const status = action === 'REVIEWED' ? 5 : 7;
  const response = await fetch('/api/ha-alerts/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body: JSON.stringify({
      alertIds,
      status,
      statusObservation: '',
      addFalsePositiveTag: action === 'FALSE_POSITIVE',
    }),
  });
  if (!response.ok) throw new Error(`Bulk update failed: ${response.status}`);
}

async function createIncidentFromAlerts(data: {
  name: string;
  severity: string;
  description: string;
  alertIds: string[];
}): Promise<void> {
  await convertToIncident({
    alertIds: data.alertIds,
    incidentName: data.name,
    incidentId: 0,
    incidentSource: 'alert',
  });
}

// ── OpenCountBadge ─────────────────────────────────────────────────────────────

function OpenCountBadge({ count }: { count: number | undefined }): JSX.Element | null {
  if (count === undefined) return null;
  return (
    <span
      aria-label={`${count} open alerts`}
      style={{
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        background: 'var(--ha-fill-critical-muted)',
        color: 'var(--ha-critical)',
        fontSize: 'var(--ha-text-sm)',
        fontWeight: 600,
        fontFamily: 'var(--ha-font-mono)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count}
    </span>
  );
}

// ── New-alert banner ───────────────────────────────────────────────────────────

function NewAlertBanner({
  count,
  onRefresh,
}: {
  count: number;
  onRefresh: () => void;
}): JSX.Element | null {
  if (count === 0) return null;
  return (
    <button
      onClick={onRefresh}
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 24px',
        background: 'var(--ha-fill-primary-subtle)',
        borderBottom: '1px solid color-mix(in srgb, var(--ha-action-primary) 30%, transparent)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--ha-primary)',
        fontSize: 'var(--ha-text-sm)',
        fontFamily: 'var(--ha-font-ui)',
      }}
    >
      <RefreshCw size={14} />
      {count} new {count === 1 ? 'alert' : 'alerts'} — click to refresh
    </button>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export function AnalystQueuePage(): JSX.Element {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isReadOnly = user?.roles?.includes('ROLE_READ_ONLY') ?? false;

  // SSE
  useAlertStream();
  const { connected: sseConnected, newAlertCount, clearNewAlertCount } = useAlertStreamStore();
  const { eps, connected: epsConnected } = useEpsStream();
  const [density] = useRowDensity();

  // UI state
  const [filters, setFilters] = useState<QueueFilters>({});
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [selectedRows, setSelectedRows] = useState<QueueItem[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | undefined>();
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [hasGridError, setHasGridError] = useState(false);

  // Load saved views
  useEffect(() => {
    const stored = localStorage.getItem('ha_queue_views');
    if (stored) {
      try {
        setSavedViews(JSON.parse(stored) as SavedView[]);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // Open alert count badge
  const { data: openCount, refetch: refetchCount } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: fetchOpenAlertCount,
    refetchInterval: 30_000,
  });

  // Bulk mutations
  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'REVIEWED' | 'FALSE_POSITIVE' }) =>
      bulkUpdateStatus(ids, action),
    onSuccess: () => {
      setSelectedRows([]);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      refetchCount();
    },
  });

  const createIncidentMutation = useMutation({
    mutationFn: createIncidentFromAlerts,
    onSuccess: () => {
      setSelectedRows([]);
      setIsIncidentModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      refetchCount();
    },
  });

  // Handlers
  const handleRowClicked = useCallback((data: unknown) => {
    const item = data as QueueItem;
    setSelectedAlertId(item.id);
  }, []);

  const handleSelectionChanged = useCallback((rows: unknown[]) => {
    setSelectedRows(rows as QueueItem[]);
  }, []);

  const handleBulkAction = useCallback(
    (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE') => {
      const ids = selectedRows.map((r) => r.id);
      if (ids.length === 0) return;
      if (action === 'ESCALATE') {
        setIsIncidentModalOpen(true);
      } else {
        bulkMutation.mutate({ ids, action });
      }
    },
    [selectedRows, bulkMutation]
  );

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    clearNewAlertCount();
    setHasGridError(false);
  }, [queryClient, clearNewAlertCount]);

  // Saved views
  const handleSaveView = useCallback(
    (name: string) => {
      const newView: SavedView = { id: crypto.randomUUID(), name, filters };
      const updated = [...savedViews, newView].slice(0, 20);
      setSavedViews(updated);
      localStorage.setItem('ha_queue_views', JSON.stringify(updated));
      setActiveViewId(newView.id);
    },
    [filters, savedViews]
  );

  const handleSelectView = useCallback((view: SavedView) => {
    setFilters(view.filters);
    setActiveViewId(view.id);
  }, []);

  const handleDeleteView = useCallback(
    (viewId: string) => {
      const updated = savedViews.filter((v) => v.id !== viewId);
      setSavedViews(updated);
      localStorage.setItem('ha_queue_views', JSON.stringify(updated));
      if (activeViewId === viewId) setActiveViewId(undefined);
    },
    [savedViews, activeViewId]
  );

  // Active filter chips for SiemToolbar
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (filters.severity?.length) {
      filters.severity.forEach((sev) => {
        chips.push({
          label: `Severity: ${sev.charAt(0).toUpperCase()}${sev.slice(1)}`,
          onRemove: () =>
            setFilters((prev) => ({
              ...prev,
              severity: prev.severity?.filter((s) => s !== sev),
            })),
        });
      });
    }
    if (filters.status?.length) {
      filters.status.forEach((st) => {
        chips.push({
          label: `Status: ${st.replace(/_/g, ' ')}`,
          onRemove: () =>
            setFilters((prev) => ({
              ...prev,
              status: prev.status?.filter((s) => s !== st),
            })),
        });
      });
    }
    if (filters.category?.length) {
      filters.category.forEach((cat) => {
        chips.push({
          label: `Category: ${cat}`,
          onRemove: () =>
            setFilters((prev) => ({
              ...prev,
              category: prev.category?.filter((c) => c !== cat),
            })),
        });
      });
    }
    if (filters.q) {
      chips.push({
        label: `Search: ${filters.q}`,
        onRemove: () => setFilters((prev) => ({ ...prev, q: undefined })),
      });
    }
    return chips;
  }, [filters]);

  // AG Grid datasource
  const datasource: IServerSideDatasource = useMemo(
    () => ({
      getRows: (params) => {
        const page = Math.floor((params.request.startRow ?? 0) / 50);
        const size = 50;
        const range = resolveTimeRange(timeRange);

        getAlerts({
          page,
          size,
          // Live processor alerts store severity as a string; sorting that field
          // in OpenSearch returns zero hits. Newest-first matches the triage queue.
          sort: '@timestamp,desc',
          severity: filters.severity,
          status: filters.status,
          search: filters.q,
          dateFrom: range.from,
          dateTo: range.to,
        })
          .then((response) => {
            const lastRow =
              response.total <= (params.request.endRow ?? 0) ? response.total : -1;
            params.success({ rowData: response.items, rowCount: lastRow });
            setHasGridError(false);
          })
          .catch(() => {
            params.fail();
            setHasGridError(true);
          });
      },
    }),
    [filters, timeRange]
  );

  // Empty state overlay component
  const EmptyOverlay = useCallback(
    (): JSX.Element => (
      <EmptyState
        icon={<ShieldAlert size={48} />}
        title="No work items found"
        description="Try adjusting your filters or time range. New alerts will appear here as they are detected."
      />
    ),
    []
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--ha-background)',
      }}
    >
      {/* Page header */}
      <SiemPageHeader
        title="Analyst Queue"
        badge={<OpenCountBadge count={openCount} />}
        actions={
          <>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <button
              onClick={handleRefresh}
              aria-label="Refresh queue"
              title="Refresh queue"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
            </button>
            <DensitySelector />
            <SavedViewsPanel
              views={savedViews}
              activeViewId={activeViewId}
              onSelect={handleSelectView}
              onSave={handleSaveView}
              onDelete={handleDeleteView}
              isReadOnly={isReadOnly}
            />
          </>
        }
      />

      {/* SSE disconnected banner */}
      <SseBanner isConnected={sseConnected} onReconnect={handleRefresh} />

      {/* New alerts banner */}
      <NewAlertBanner count={newAlertCount} onRefresh={handleRefresh} />

      {/* Grid error banner */}
      {hasGridError && (
        <div
          role="alert"
          style={{
            padding: '10px 24px',
            background: 'var(--ha-fill-critical-subtle)',
            borderBottom: '1px solid color-mix(in srgb, var(--ha-severity-critical) 25%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-critical)',
          }}
        >
          <span>Failed to load queue — could not reach the backend.</span>
          <button
            onClick={handleRefresh}
            style={{
              background: 'transparent',
              border: '1px solid var(--ha-critical)',
              borderRadius: 'var(--ha-radius-sm)',
              color: 'var(--ha-critical)',
              fontSize: 'var(--ha-text-xs)',
              padding: '3px 10px',
              cursor: 'pointer',
              fontFamily: 'var(--ha-font-ui)',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Toolbar + filter chips */}
      <SiemToolbar
        left={
          <QueueToolbar
            filters={filters}
            onFiltersChange={setFilters}
            selectedCount={selectedRows.length}
            onBulkAction={handleBulkAction}
            onDeselectAll={() => setSelectedRows([])}
            isReadOnly={isReadOnly}
          />
        }
        activeFilters={activeFilterChips}
        onClearAllFilters={() => setFilters({})}
      />

      {/* AG Grid */}
      <div style={{ flex: 1, minHeight: 0, padding: '12px 24px 0' }}>
        <SiemDataGrid
          columnDefs={QUEUE_COLUMN_DEFS}
          datasource={datasource}
          rowModelType="serverSide"
          rowSelection="multiple"
          suppressRowClickSelection={false}
          onRowClicked={(e) => {
            if (e.data) handleRowClicked(e.data);
          }}
          onSelectionChanged={handleSelectionChanged}
          height="100%"
          rowHeight={ROW_HEIGHTS[density]}
          getRowId={(params) => (params.data as QueueItem).id}
          defaultColDef={{
            sortable: true,
            filter: false,
            resizable: true,
          }}
          noRowsOverlayComponent={EmptyOverlay}
        />
      </div>

      {/* Detail drawer */}
      <QueueDetailDrawer
        alertId={selectedAlertId}
        onClose={() => setSelectedAlertId(null)}
      />

      {/* Create incident modal */}
      <CreateIncidentModal
        isOpen={isIncidentModalOpen}
        alertIds={selectedRows.map((r) => r.id)}
        onClose={() => setIsIncidentModalOpen(false)}
        onSubmit={(data) => createIncidentMutation.mutateAsync(data)}
      />

      {/* Status dock */}
      <StatusDock
        sseConnected={sseConnected && epsConnected}
        eps={eps}
        mode="live"
      />
    </div>
  );
}
