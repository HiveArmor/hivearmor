/**
 * DashboardCanvasPage — DSH-02 Dashboard View (Read-Only)
 * Full-canvas dashboard viewer using GridStack.js 13 for widget layout.
 *
 * SECURITY GAPS:
 * - SEC-06: POST /api/ha-visualizations/run requires ROLE_ADMIN|ROLE_SOC_MANAGER|ROLE_ANALYST
 * - GAP-SEC-12: GET /api/ha-dashboards/{id} has no @PreAuthorize
 * - GAP-MT-05: CLOSED (STAGING) — backend scopes hive_dashboard.tenant_id via TenantContext
 */

import { useEffect, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GridStack } from 'gridstack';
import { useParams, useNavigate } from 'react-router-dom';
import 'gridstack/dist/gridstack.min.css';

import { DashboardToolbar } from './components/DashboardToolbar';
import { VisualizationWidget } from './components/VisualizationWidget';
import { getDashboard, isFavourited, toggleFavourite } from './dashboards.service';
import type { VisualizationDTO } from './dashboards.types';
import { ErrorState } from '../../components/error-state/ErrorState';

const USER_ROLES = {
  ADMIN: 'ROLE_ADMIN',
  SOC_MANAGER: 'ROLE_SOC_MANAGER',
  ANALYST: 'ROLE_ANALYST',
  USER: 'ROLE_USER',
  READ_ONLY: 'ROLE_READ_ONLY',
};

export function DashboardCanvasPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);

  const [isFavourite, setIsFavourite] = useState(false);
  const [visualizations, setVisualizations] = useState<VisualizationDTO[]>([]);

  // Mock user role - in production this would come from auth store
  const userRole = USER_ROLES.ANALYST;
  const canEdit = [USER_ROLES.ADMIN, USER_ROLES.SOC_MANAGER, USER_ROLES.ANALYST].includes(userRole);

  const dashboardId = id ? Number.parseInt(id, 10) : 0;

  // GAP-SEC-12: GET /api/ha-dashboards/{id} has no @PreAuthorize
  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
    enabled: dashboardId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Parse visualizations from JSON string
  useEffect(() => {
    if (dashboard?.visualizations) {
      try {
        const parsed = JSON.parse(dashboard.visualizations) as VisualizationDTO[];
        setVisualizations(parsed);
      } catch {
        // Failed to parse visualizations - render empty state
        setVisualizations([]);
      }
    }
  }, [dashboard?.visualizations]);

  // Initialize GridStack in read-only mode
  useEffect(() => {
    if (!gridRef.current || visualizations.length === 0) return;

    if (!gridInstanceRef.current) {
      gridInstanceRef.current = GridStack.init(
        {
          column: 12,
          cellHeight: 60,
          animate: false,
          staticGrid: true, // Read-only mode
          disableResize: true,
          disableDrag: true,
          float: false,
        },
        gridRef.current
      );
    }

    return () => {
      if (gridInstanceRef.current) {
        gridInstanceRef.current.destroy(false);
        gridInstanceRef.current = null;
      }
    };
  }, [visualizations]);

  // Check favourite status
  useEffect(() => {
    if (dashboardId > 0) {
      setIsFavourite(isFavourited(dashboardId));
    }
  }, [dashboardId]);

  const handleToggleFavourite = (): void => {
    const newState = toggleFavourite(dashboardId);
    setIsFavourite(newState);
  };

  const handleRefresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['visualization-run'] });
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DashboardToolbar
          dashboardName="Loading..."
          dashboardId={dashboardId}
          isSystem={false}
          isFavourited={false}
          isRefreshing={false}
          canEdit={false}
          refreshTime={null}
          onToggleFavourite={() => {}}
          onRefresh={() => {}}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ha-text-secondary)',
          }}
        >
          Loading dashboard...
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !dashboard) {
    if (error?.message === 'Dashboard not found') {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <ErrorState
            title="Dashboard not found"
            message="This dashboard no longer exists or you do not have access to it."
            onRetry={() => navigate('/dashboards')}
          />
        </div>
      );
    }

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ErrorState
          title="Could not load dashboard"
          message="Failed to load dashboard configuration. Please try again."
          onRetry={() => void refetch()}
          error={error as Error}
        />
      </div>
    );
  }

  // Empty dashboard state
  if (visualizations.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DashboardToolbar
          dashboardName={dashboard.name}
          dashboardId={dashboardId}
          isSystem={dashboard.isSystem}
          isFavourited={isFavourite}
          isRefreshing={false}
          canEdit={canEdit}
          refreshTime={dashboard.refreshTime}
          onToggleFavourite={handleToggleFavourite}
          onRefresh={handleRefresh}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: 'var(--ha-text-secondary)',
          }}
        >
          <div style={{ fontSize: 'var(--ha-text-lg)' }}>No widgets configured</div>
          <div style={{ fontSize: 'var(--ha-text-sm)' }}>
            This dashboard has no widgets yet.
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => navigate(`/dashboards/${dashboardId}/edit`)}
              style={{
                background: 'var(--ha-primary)',
                color: 'var(--ha-background)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--ha-radius-base)',
                cursor: 'pointer',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
              }}
            >
              Configure in Studio
            </button>
          )}
        </div>
      </div>
    );
  }

  // Main dashboard view with GridStack canvas
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <DashboardToolbar
        dashboardName={dashboard.name}
        dashboardId={dashboardId}
        isSystem={dashboard.isSystem}
        isFavourited={isFavourite}
        isRefreshing={false}
        canEdit={canEdit && !dashboard.isSystem}
        refreshTime={dashboard.refreshTime}
        onToggleFavourite={handleToggleFavourite}
        onRefresh={handleRefresh}
      />

      <div
        ref={gridRef}
        className="grid-stack"
        style={{
          flex: 1,
          background: 'var(--ha-background)',
          padding: '16px',
          overflow: 'auto',
        }}
      >
        {visualizations.map((viz) => (
          <div
            key={viz.id}
            className="grid-stack-item"
            data-gs-x={viz.posX}
            data-gs-y={viz.posY}
            data-gs-width={viz.width}
            data-gs-height={viz.height}
            data-gs-id={viz.id}
          >
            <div className="grid-stack-item-content" style={{ overflow: 'hidden' }}>
              <VisualizationWidget
                visualization={viz}
                filters={null} // TODO: Parse dashboard.filters
                refreshTime={dashboard.refreshTime}
                onExpand={() => {
                  // TODO: Open fullscreen modal (DSH-02 feature)
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
