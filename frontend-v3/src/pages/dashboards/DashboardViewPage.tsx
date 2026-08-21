/**
 * DashboardViewPage — Dashboard View (DSH-02)
 * Read-only dashboard view with GridStack canvas and live widget tiles.
 *
 * SECURITY GAPS:
 * - GAP-SEC-06: No @PreAuthorize on POST /api/ha-visualizations/run
 * - GAP-SEC-12: No @PreAuthorize on GET /api/ha-dashboards/{id}
 * - GAP-MT-05: No tenant_id on UtmDashboard
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GridStack as GridStackType } from 'gridstack';
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import { useNavigate, useParams } from 'react-router-dom';

import { getDashboard, isFavourited, runVisualization, toggleFavourite } from './dashboards.service';
import type { DashboardDTO, VisualizationDTO } from './dashboards.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { FilterBar } from '@/components/filter-bar';
import type { FilterPill } from '@/components/filter-bar';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaChart } from '@/components/ha-chart';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useAuthStore } from '@/store/auth.store';

// GAP-SEC-06 gate: Set to true only after backend fix is confirmed deployed
const GAP_SEC_06_RESOLVED = false;

export function DashboardViewPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuthStore();

  const dashboardId = id ? parseInt(id, 10) : 0;
  const [isFav, setIsFav] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterPill[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasLayoutChanges, setHasLayoutChanges] = useState(false);
  const gridRef = useRef<GridStackType | null>(null);
  const gridElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (dashboardId) {
      setIsFav(isFavourited(dashboardId));
    }
  }, [dashboardId]);

  // GAP-SEC-12: No @PreAuthorize on GET /api/ha-dashboards/{id}
  const { data: dashboard, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
    enabled: dashboardId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const canEdit = hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST']) && dashboard?.isSystem === false;

  const handleToggleFavourite = () => {
    const newState = toggleFavourite(dashboardId);
    setIsFav(newState);
  };

  const handleEdit = () => {
    navigate(`/dashboards/${dashboardId}/edit`);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['visualization-run'] });
  };

  const handleFilterAdd = (field: string, value: string): void => {
    const newFilter: FilterPill = {
      id: `filter-${crypto.randomUUID()}`,
      field,
      value,
      negate: false,
    };
    setActiveFilters((prev) => [...prev, newFilter]);
  };

  const handleFilterRemove = (id: string): void => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFilterToggleNegate = (id: string): void => {
    setActiveFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, negate: !f.negate } : f))
    );
  };

  const handleFilterClearAll = (): void => {
    setActiveFilters([]);
  };

  // GridStack initialization — runs once after dashboard loads
  useEffect(() => {
    if (!dashboard || !gridElRef.current) return;

    const grid = GridStack.init(
      {
        column: 12,
        cellHeight: 80,
        animate: true,
        draggable: { handle: '.widget-drag-handle' },
        resizable: { handles: 'se' },
        staticGrid: true, // start locked
      },
      gridElRef.current
    );

    if (!grid) return;

    grid.on('change', () => {
      setHasLayoutChanges(true);
    });

    gridRef.current = grid;

    return () => {
      gridRef.current?.destroy(false);
      gridRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id]);

  // Toggle static mode when isEditMode changes
  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.setStatic(!isEditMode);
  }, [isEditMode]);

  const handleSaveLayout = useCallback(async () => {
    if (!gridRef.current || !dashboard) return;

    const token = localStorage.getItem('hivearmor_auth_token') ?? '';
    const gridItems = gridRef.current.getGridItems();

    let visualizations: VisualizationDTO[] = [];
    try {
      visualizations = JSON.parse(dashboard.visualizations || '[]') as VisualizationDTO[];
    } catch {
      visualizations = [];
    }

    const updatedViz = visualizations.map((viz) => {
      const el = gridItems.find((item) => item.getAttribute('gs-id') === String(viz.id));
      if (!el) return viz;
      const node = gridRef.current?.engine.nodes.find((n) => n.el === el);
      if (!node) return viz;
      return { ...viz, posX: node.x ?? 0, posY: node.y ?? 0, width: node.w ?? 6, height: node.h ?? 4 };
    });

    await fetch(`/api/ha-dashboards/${dashboard.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...dashboard, visualizations: JSON.stringify(updatedViz) }),
    });

    setIsEditMode(false);
    setHasLayoutChanges(false);
    void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  }, [dashboard, dashboardId, queryClient]);

  // State 01 — Initial Loading
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              height: 48,
              background: 'var(--ha-surface-primary)',
              borderRadius: 'var(--ha-radius-base)',
              animation: 'shimmer 2s infinite',
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 240,
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                animation: 'shimmer 2s infinite',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // State 05 — Error (Dashboard Config)
  if (isError || !dashboard) {
    return (
      <div style={{ padding: 24 }}>
        <HaInlineBanner
          variant="danger"
          title="Could not load dashboard configuration"
          description="The dashboard could not be loaded."
          isDismissible={false}
        />
        <HaButton variant="secondary" onClick={() => refetch()}>
          Retry
        </HaButton>
      </div>
    );
  }

  // Parse visualizations
  let visualizations: VisualizationDTO[] = [];
  try {
    visualizations = JSON.parse(dashboard.visualizations || '[]');
  } catch {
    visualizations = [];
  }

  // State 04 — Empty Dashboard
  if (visualizations.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <DashboardHeader
          dashboard={dashboard}
          isFav={isFav}
          onToggleFavourite={handleToggleFavourite}
          onEdit={handleEdit}
          onRefresh={handleRefresh}
          canEdit={canEdit}
          isEditMode={false}
          onEditLayoutClick={() => setIsEditMode(true)}
          onSaveLayout={() => void handleSaveLayout()}
          onCancelEdit={() => { setIsEditMode(false); setHasLayoutChanges(false); }}
          hasLayoutChanges={false}
        />
        <EmptyState
          icon="grid"
          title="No widgets configured"
          description="This dashboard has no widgets yet."
          action={
            canEdit ? (
              <HaButton variant="primary" onClick={handleEdit}>
                Configure in Studio
              </HaButton>
            ) : (
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
                Contact your administrator to configure this dashboard.
              </div>
            )
          }
        />
      </div>
    );
  }

  // State 03 — Populated
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 24 }}>
        <DashboardHeader
          dashboard={dashboard}
          isFav={isFav}
          onToggleFavourite={handleToggleFavourite}
          onEdit={handleEdit}
          onRefresh={handleRefresh}
          canEdit={canEdit}
          isEditMode={isEditMode}
          onEditLayoutClick={() => setIsEditMode(true)}
          onSaveLayout={() => void handleSaveLayout()}
          onCancelEdit={() => { setIsEditMode(false); setHasLayoutChanges(false); }}
          hasLayoutChanges={hasLayoutChanges}
        />
      </div>

      {/* Filter Bar (PD-11) */}
      <FilterBar
        filters={activeFilters}
        onRemove={handleFilterRemove}
        onToggleNegate={handleFilterToggleNegate}
        onClearAll={handleFilterClearAll}
      />

      <div style={{ flex: 1, padding: '0 24px 24px 24px', overflow: 'auto' }}>
        {/* GridStack Canvas */}
        <div ref={gridElRef} className="grid-stack">
          {visualizations.map((viz) => (
            <div
              key={viz.id}
              className="grid-stack-item"
              ref={(el) => {
                if (!el) return;
                // GridStack reads these attributes to set initial position
                el.setAttribute('gs-x', String(viz.posX ?? 0));
                el.setAttribute('gs-y', String(viz.posY ?? 0));
                el.setAttribute('gs-w', String(viz.width ?? 6));
                el.setAttribute('gs-h', String(viz.height ?? 4));
                el.setAttribute('gs-id', String(viz.id));
              }}
            >
              <div className="grid-stack-item-content">
                <EditableWidgetCard
                  visualization={viz}
                  dashboardId={dashboardId}
                  refreshTime={dashboard.refreshTime}
                  activeFilters={activeFilters}
                  onFilterAdd={handleFilterAdd}
                  isEditMode={isEditMode}
                  onRemove={() => {
                    // Remove widget from grid and state
                    if (gridRef.current) {
                      const gridItems = gridRef.current.getGridItems();
                      const el = gridItems.find((item) => item.getAttribute('gs-id') === String(viz.id));
                      if (el) gridRef.current.removeWidget(el, false);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DashboardHeaderProps {
  dashboard: DashboardDTO;
  isFav: boolean;
  onToggleFavourite: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  canEdit: boolean;
  isEditMode: boolean;
  onEditLayoutClick: () => void;
  onSaveLayout: () => void;
  onCancelEdit: () => void;
  hasLayoutChanges: boolean;
}

function DashboardHeader({
  dashboard,
  isFav,
  onToggleFavourite,
  onEdit,
  onRefresh,
  canEdit,
  isEditMode,
  onEditLayoutClick,
  onSaveLayout,
  onCancelEdit,
}: DashboardHeaderProps): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)', margin: 0 }}>
          {dashboard.name}
        </h1>
        {dashboard.refreshTime && (
          <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            Auto-refresh: {dashboard.refreshTime}s
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HaButton
          variant="plain"
          onClick={onToggleFavourite}
          aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        >
          {isFav ? '★' : '☆'}
        </HaButton>
        {!isEditMode ? (
          <>
            <button
              onClick={onEditLayoutClick}
              disabled={!canEdit}
              title={!canEdit ? 'Requires Analyst role or higher' : 'Edit dashboard layout'}
              style={{
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: canEdit ? 'var(--ha-text-secondary)' : 'var(--ha-text-secondary)',
                padding: '5px 12px',
                fontSize: 'var(--ha-text-sm)',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                opacity: canEdit ? 1 : 0.5,
              }}
            >
              ✎ Edit Layout
            </button>
            <HaButton
              variant="secondary"
              onClick={onEdit}
              disabled={!canEdit}
              title={
                !canEdit
                  ? dashboard.isSystem
                    ? 'System dashboards cannot be edited'
                    : 'Requires Analyst role or higher'
                  : undefined
              }
            >
              Edit
            </HaButton>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onSaveLayout}
              style={{
                background: 'var(--ha-primary)',
                border: 'none',
                color: 'var(--ha-background)',
                borderRadius: 'var(--ha-radius-base)',
                padding: '5px 14px',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Layout
            </button>
            <button
              onClick={onCancelEdit}
              style={{
                background: 'none',
                border: '1px solid var(--ha-border)',
                color: 'var(--ha-text-secondary)',
                borderRadius: 'var(--ha-radius-base)',
                padding: '5px 12px',
                fontSize: 'var(--ha-text-sm)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {!isEditMode && (
          <HaButton variant="secondary" onClick={onRefresh} aria-label="Refresh all widgets">
            ↻
          </HaButton>
        )}
      </div>
    </div>
  );
}

interface EditableWidgetCardProps extends WidgetCardProps {
  isEditMode: boolean;
  onRemove: () => void;
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--ha-text-secondary)',
  padding: '4px 6px',
  fontSize: 13,
  borderRadius: 'var(--ha-radius-sm)',
};

function EditableWidgetCard({
  visualization,
  dashboardId,
  refreshTime,
  activeFilters,
  onFilterAdd,
  isEditMode,
  onRemove,
}: EditableWidgetCardProps): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Widget header with drag handle + toolbar */}
      <div
        className="widget-drag-handle"
        style={{
          height: 36,
          background: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          cursor: isEditMode ? 'grab' : 'default',
          userSelect: 'none',
        }}
      >
        {isEditMode && (
          <span style={{ color: 'var(--ha-text-secondary)', marginRight: 8, fontSize: 14 }}>⠿</span>
        )}
        <span
          style={{
            flex: 1,
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {visualization.name}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {!isEditMode && (
            <>
              <button
                title="Refresh widget"
                onClick={() => { /* widget-level refresh — queries handle refetch */ }}
                style={iconBtnStyle}
              >
                ↻
              </button>
              <button
                title="Expand fullscreen"
                onClick={() => { /* TODO: fullscreen */ }}
                style={iconBtnStyle}
              >
                ⛶
              </button>
            </>
          )}
          {isEditMode && (
            <button
              title="Remove widget"
              onClick={onRemove}
              style={{ ...iconBtnStyle, color: 'var(--ha-critical)' }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Widget body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 12 }}>
        <WidgetCard
          visualization={visualization}
          dashboardId={dashboardId}
          refreshTime={refreshTime}
          activeFilters={activeFilters}
          onFilterAdd={onFilterAdd}
        />
      </div>
    </div>
  );
}

interface WidgetCardProps {
  visualization: VisualizationDTO;
  dashboardId: number;
  refreshTime: number | null;
  activeFilters: FilterPill[];
  onFilterAdd: (field: string, value: string) => void;
}

function WidgetCard({ visualization, dashboardId, refreshTime, activeFilters, onFilterAdd }: WidgetCardProps): JSX.Element {
  // GAP-SEC-06: No @PreAuthorize on POST /api/ha-visualizations/run
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['visualization-run', visualization.id, dashboardId],
    queryFn: () => {
      if (!GAP_SEC_06_RESOLVED) {
        return Promise.reject(new Error('GAP_SEC_06'));
      }
      return runVisualization({
        visualizationId: visualization.id,
        filters: null,
      });
    },
    enabled: GAP_SEC_06_RESOLVED,
    staleTime: (refreshTime ?? 300) * 1000,
    refetchInterval: refreshTime ? refreshTime * 1000 : false,
  });

  const lastUpdated = dataUpdatedAt ? `Updated ${Math.floor((Date.now() - dataUpdatedAt) / 1000)}s ago` : 'Loading…';

  return (
    <div
      style={{
        gridColumn: `span ${visualization.width}`,
        gridRow: `span ${visualization.height}`,
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Widget header */}
      <div
        style={{
          height: 32,
          background: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
        }}
      >
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={visualization.name}
        >
          {visualization.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lastUpdated}
          </span>
        </div>
      </div>

      {/* Widget body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          position: 'relative',
        }}
      >
        {!GAP_SEC_06_RESOLVED && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                background: 'color-mix(in srgb, var(--ha-high) 10%, transparent)',
                border: '1px solid var(--ha-high)',
                borderRadius: 'var(--ha-radius-base)',
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-high)',
                textAlign: 'center',
              }}
            >
              Visualization data unavailable — security fix GAP-SEC-06 pending deployment
            </div>
          </div>
        )}
        {GAP_SEC_06_RESOLVED && isLoading && (
          <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Loading…</div>
        )}
        {GAP_SEC_06_RESOLVED && isError && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)', marginBottom: 8 }}>
              Failed to load widget data
            </div>
            <button
              onClick={() => refetch()}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ha-primary)',
                fontSize: 'var(--ha-text-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {GAP_SEC_06_RESOLVED && !isLoading && !isError && data && (
          <WidgetBody type={visualization.type} data={data} onFilterAdd={onFilterAdd} />
        )}
        {GAP_SEC_06_RESOLVED && !isLoading && !isError && !data && activeFilters.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8 }}>
              No data matches current filters
            </div>
            <button
              onClick={() => {
                // Clear filters callback would be passed down from parent
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ha-primary)',
                fontSize: 'var(--ha-text-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface WidgetBodyProps {
  type: VisualizationDTO['type'];
  data: unknown;
  onFilterAdd?: (field: string, value: string) => void;
}

function WidgetBody({ type, data }: WidgetBodyProps): JSX.Element {
  if (!data) {
    return <LoadingState />;
  }

  switch (type) {
    case 'CHART': {
      // Parse chart data from API response
      const chartData = data as { labels?: string[]; values?: number[]; series?: { name: string; data: number[] }[] };

      if (!chartData.labels && !chartData.series) {
        return (
          <div style={{ textAlign: 'center', color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
            No chart data available
          </div>
        );
      }

      const option = {
        backgroundColor: 'transparent',
        textStyle: {
          color: 'var(--ha-text-primary)',
        },
        xAxis: {
          type: 'category' as const,
          data: chartData.labels ?? [],
          axisLabel: { color: 'var(--ha-text-secondary)' },
          axisLine: { lineStyle: { color: 'var(--ha-border)' } },
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: { color: 'var(--ha-text-secondary)' },
          axisLine: { lineStyle: { color: 'var(--ha-border)' } },
          splitLine: { lineStyle: { color: 'var(--ha-border)', opacity: 0.3 } },
        },
        series: chartData.series ?? [{
          data: chartData.values ?? [],
          type: 'line' as const,
          smooth: true,
          lineStyle: { color: 'var(--ha-primary)' },
          itemStyle: { color: 'var(--ha-primary)' },
        }],
        grid: {
          left: 40,
          right: 20,
          top: 20,
          bottom: 30,
        },
      };

      return <HaChart option={option} style={{ height: '100%', width: '100%' }} ariaLabel="Dashboard visualization chart" />;
    }

    case 'METRIC': {
      const metricData = data as { value?: number | string; label?: string };
      const value = metricData.value ?? '—';
      const label = metricData.label ?? 'Metric Value';

      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div
            style={{
              fontSize: 'var(--ha-text-2xl)',
              color: 'var(--ha-text-primary)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}
          >
            {value}
          </div>
          <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginTop: 4 }}>
            {label}
          </div>
        </div>
      );
    }

    case 'TABLE': {
      const tableData = data as { columns?: string[]; rows?: Record<string, unknown>[] };

      if (!tableData.columns || !tableData.rows) {
        return (
          <div style={{ textAlign: 'center', color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
            No table data available
          </div>
        );
      }

      const columnDefs = tableData.columns.map((col) => ({
        field: col,
        headerName: col,
        flex: 1,
        sortable: true,
      }));

      return (
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={tableData.rows}
          height="100%"
        />
      );
    }

    case 'MAP':
      return (
        <div style={{ textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ha-text-secondary)" strokeWidth="1">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
          </svg>
          <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginTop: 8 }}>
            Map visualizations are not available in this version.
          </div>
        </div>
      );

    default:
      return (
        <div style={{ textAlign: 'center', color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
          Widget type &ldquo;{type}&rdquo; is not yet supported.
        </div>
      );
  }
}
