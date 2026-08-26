/**
 * AnalystQueuePage — SOC triage queue (`/queue`)
 *
 * Job: Triage open alerts for this shift.
 * Contracts: GET /api/ha-alerts, GET /api/ha-alerts/count-open-alerts,
 * POST /api/ha-alerts/status (bulk alertIds), POST /api/ha-alerts/convert-to-incident,
 * assignment via /api/ha-alerts/bulk/assignment* (SOC Manager+).
 * STAGING CANDIDATE — no fake live when SSE disconnected; human role labels on deny.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IServerSideDatasource } from 'ag-grid-community';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import {
  canAssignQueueAlerts,
  canTriageQueueAlerts,
  QUEUE_JOB_SENTENCE,
  QUEUE_TRIAGE_DENIED,
} from './analystQueue.capabilities';
import { fetchOpenAlertCount } from './analystQueue.service';
import type { QueueFilters } from './analystQueue.types';
import type { QueueRowAction } from './cells/RowActionsCell';
import { CreateIncidentModal } from './components/CreateIncidentModal';
import { QueueDetailDrawer } from './components/QueueDetailDrawer';
import { QueueToolbar } from './components/QueueToolbar';
import type { SavedView } from './components/SavedViewsPanel';
import { SavedViewsPanel } from './components/SavedViewsPanel';
import { SseBanner } from './components/SseBanner';
import { createQueueColumnDefs } from './queueColumns';

import { DensitySelector } from '@/components/density-selector';
import { EmptyState } from '@/components/empty-state';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock';
import { TimeRangeSelector } from '@/components/time-range-selector';
import { resolveTimeRange } from '@/components/time-range-selector/timeRangeUtils';
import type { TimeRange } from '@/components/time-range-selector/timeRangeUtils';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { AssignmentDialog } from '@/pages/alerts/components/AssignmentDialog';
import { convertToIncident, getAlerts, updateAlertStatus } from '@/services/alerts.service';
import { useAlertStreamStore } from '@/store/alertStream.store';
import { useAuthStore } from '@/store/auth.store';
import type { QueueItem } from '@/types/alert.types';

import './AnalystQueuePage.css';

const JOB_SENTENCE = QUEUE_JOB_SENTENCE;

/** Defender/Sentinel default: New + In progress (open work, not resolved). */
const DEFAULT_FILTERS: QueueFilters = { status: ['open', 'in_progress'] };

function OpenCountBadge({ count }: { count: number | undefined }): JSX.Element | null {
  if (count === undefined) return null;
  return (
    <span className="aq-open-count" aria-label={`${count} open alerts`}>
      {count}
    </span>
  );
}

function NewAlertBanner({
  count,
  onRefresh,
}: {
  count: number;
  onRefresh: () => void;
}): JSX.Element | null {
  if (count === 0) return null;
  return (
    <button type="button" className="aq-new-banner" onClick={onRefresh} aria-live="polite">
      <RefreshCw size={14} />
      {count} new {count === 1 ? 'alert' : 'alerts'} — click to refresh
    </button>
  );
}

export function AnalystQueuePage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const roles = user?.roles;
  const canTriage = canTriageQueueAlerts(roles);
  const canAssign = canAssignQueueAlerts(roles);

  useAlertStream();
  const { connected: sseConnected, newAlertCount, clearNewAlertCount } = useAlertStreamStore();
  const { eps, connected: epsConnected } = useEpsStream();
  const [density] = useRowDensity();
  const dockLive = sseConnected && epsConnected;

  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [selectedRows, setSelectedRows] = useState<QueueItem[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | undefined>();
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentAlertIds, setIncidentAlertIds] = useState<string[]>([]);
  const [assignmentDialogIds, setAssignmentDialogIds] = useState<string[] | null>(null);
  const [hasGridError, setHasGridError] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ha_queue_views');
    if (!stored) return;
    try {
      setSavedViews(JSON.parse(stored) as SavedView[]);
    } catch {
      // ignore corrupt preference
    }
  }, []);

  const { data: openCount, refetch: refetchCount } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: fetchOpenAlertCount,
    refetchInterval: 30_000,
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'REVIEWED' | 'FALSE_POSITIVE' }) =>
      updateAlertStatus({
        alertIds: ids,
        status: action === 'REVIEWED' ? 5 : 7,
        statusObservation: '',
        addFalsePositiveTag: action === 'FALSE_POSITIVE',
      }),
    onSuccess: () => {
      setSelectedRows([]);
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void refetchCount();
    },
  });

  const createIncidentMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      severity: string;
      description: string;
      alertIds: string[];
    }) => {
      await convertToIncident({
        alertIds: data.alertIds,
        incidentName: data.name,
        incidentId: 0,
        incidentSource: 'alert',
      });
    },
    onSuccess: () => {
      setSelectedRows([]);
      setIsIncidentModalOpen(false);
      setIncidentAlertIds([]);
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void refetchCount();
    },
  });

  const handleRowClicked = useCallback((data: unknown) => {
    const item = data as QueueItem;
    setSelectedAlertId(item.id);
  }, []);

  const handleSelectionChanged = useCallback((rows: unknown[]) => {
    setSelectedRows(rows as QueueItem[]);
  }, []);

  const openEscalate = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setIncidentAlertIds(ids);
    setIsIncidentModalOpen(true);
  }, []);

  const handleBulkAction = useCallback(
    (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE' | 'ASSIGN') => {
      const ids = selectedRows.map((r) => r.id);
      if (ids.length === 0) return;
      if (action === 'ESCALATE') {
        if (!canTriage) return;
        openEscalate(ids);
        return;
      }
      if (action === 'ASSIGN') {
        if (!canAssign) return;
        setAssignmentDialogIds(ids);
        return;
      }
      if (!canTriage) return;
      bulkMutation.mutate({ ids, action });
    },
    [selectedRows, bulkMutation, canTriage, canAssign, openEscalate]
  );

  const handleRowAction = useCallback(
    (action: QueueRowAction, item: QueueItem) => {
      if (action === 'open' || action === 'status') {
        setSelectedAlertId(item.id);
        return;
      }
      if (action === 'full_page') {
        void navigate(`/alerts/${item.id}`);
        return;
      }
      if (action === 'assign') {
        if (!canAssign) return;
        setAssignmentDialogIds([item.id]);
        return;
      }
      if (action === 'escalate') {
        if (!canTriage) return;
        openEscalate([item.id]);
      }
    },
    [navigate, canAssign, canTriage, openEscalate]
  );

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    clearNewAlertCount();
    setHasGridError(false);
  }, [queryClient, clearNewAlertCount]);

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

  const columnDefs = useMemo(
    () =>
      createQueueColumnDefs({
        canTriage,
        canAssign,
        onRowAction: handleRowAction,
      }),
    [canTriage, canAssign, handleRowAction]
  );

  const datasource: IServerSideDatasource = useMemo(
    () => ({
      getRows: (params) => {
        const page = Math.floor((params.request.startRow ?? 0) / 50);
        const size = 50;
        const range = resolveTimeRange(timeRange);

        getAlerts({
          page,
          size,
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

  const EmptyOverlay = useCallback(
    (): JSX.Element => (
      <EmptyState
        icon={<ShieldAlert size={48} />}
        title="No open work items"
        description="No alerts match this triage filter. Adjust severity/status chips or widen the time range."
      />
    ),
    []
  );

  return (
    <div className="aq-page">
      <header className="aq-page__header">
        <SiemPageHeader
          title="Analyst Queue"
          description={JOB_SENTENCE}
          badge={<OpenCountBadge count={openCount} />}
          actions={
            <>
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
              <button
                type="button"
                className="aq-icon-btn"
                onClick={handleRefresh}
                aria-label="Refresh queue"
                title="Refresh queue"
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
                isReadOnly={!canTriage}
              />
            </>
          }
        />
        <p className="aq-page__meta">
          <Link to="/dashboard">Mission Control</Link>
          <span aria-hidden="true">·</span>
          <Link to="/alerts">Alerts list</Link>
          <span aria-hidden="true">·</span>
          <Link to="/incidents">Incidents</Link>
          {!canTriage && (
            <>
              <span aria-hidden="true">·</span>
              <span className="aq-page__meta-warn" title={QUEUE_TRIAGE_DENIED}>
                Read-only — {QUEUE_TRIAGE_DENIED}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Conditional only — OEM queues keep chrome thin so the grid stays primary */}
      <SseBanner isConnected={sseConnected} onReconnect={handleRefresh} />
      <NewAlertBanner count={newAlertCount} onRefresh={handleRefresh} />

      {hasGridError && (
        <div className="aq-page__error" role="alert">
          <span>Failed to load queue — could not reach the backend.</span>
          <button type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      <div className="aq-page__toolbar">
        <QueueToolbar
          filters={filters}
          onFiltersChange={setFilters}
          selectedCount={selectedRows.length}
          onBulkAction={handleBulkAction}
          onDeselectAll={() => setSelectedRows([])}
          canTriage={canTriage}
          canAssign={canAssign}
        />
      </div>

      <div className="aq-page__grid">
        <SiemDataGrid
          columnDefs={columnDefs}
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
          ariaLabel="Analyst triage queue"
        />
      </div>

      <QueueDetailDrawer
        alertId={selectedAlertId}
        onClose={() => setSelectedAlertId(null)}
        onOpenAlert={(id) => setSelectedAlertId(id)}
        canTriage={canTriage}
        onEscalate={(id) => openEscalate([id])}
      />

      <CreateIncidentModal
        isOpen={isIncidentModalOpen}
        alertIds={incidentAlertIds}
        onClose={() => {
          setIsIncidentModalOpen(false);
          setIncidentAlertIds([]);
        }}
        onSubmit={(data) => createIncidentMutation.mutateAsync(data)}
      />

      {assignmentDialogIds && (
        <AssignmentDialog
          alertIds={assignmentDialogIds}
          onCancel={() => setAssignmentDialogIds(null)}
          onSuccess={() => {
            setAssignmentDialogIds(null);
            setSelectedRows([]);
            void queryClient.invalidateQueries({ queryKey: ['alerts'] });
          }}
        />
      )}

      <StatusDock
        sseConnected={dockLive}
        eps={eps}
        mode={dockLive ? 'live' : 'historical'}
      />
    </div>
  );
}
