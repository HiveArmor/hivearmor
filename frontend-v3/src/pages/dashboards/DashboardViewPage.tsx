/**
 * Dashboard runtime — panel execution surface (Prompt 33 / Wave C1 slice 3).
 *
 * Panel run stays SEC-06 gated (GAP_SEC_06_RESOLVED). Distinct from gallery discover,
 * Studio authoring, and `/reports/*` generation. No fake bound/tenant panel claims.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import './DashboardOperations.css';
import { dashboardOperationsService } from './dashboardOperations.service';
import type { DashboardPanel } from './dashboardOperations.types';
import { DashboardPanelRenderer } from './DashboardPanelRenderer';

import { HaDrawer } from '@/components/ha-drawer';
import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';

/** Bundle-visible job sentence — runtime panels, not Studio authoring or report generation. */
export const DASHBOARD_RUNTIME_JOB_SENTENCE =
  'Dashboard runtime — view and refresh governed panel projections for an operational dashboard. Gallery discover stays on Dashboards; Studio authors layouts; scheduled reporting and templates live under Reports — this page does not generate SOC communications.';

const PROJECTION_NOTE_LIVE =
  'Panel visualization run is role-gated (Analyst · SOC Manager · Platform Administrator; SEC-06). Tenant variables and global filters are UI chrome only until DSH contracts land — bound and tenant scope are not claimed. Panels without a stored visualization id stay contract_unavailable.';

const PROJECTION_NOTE_FIXTURE =
  'Design fixture mode: fictional panel results are enabled for visual review. Live mode runs stored visualizations through the role-gated API (SEC-06).';

export function DashboardViewPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const eps = useEpsStream();
  const [timeRange, setTimeRange] = useState('Last 24 hours');
  const [selected, setSelected] = useState<DashboardPanel | null>(null);

  const query = useQuery({
    queryKey: ['dashboard-operations', id],
    queryFn: ({ signal }) => dashboardOperationsService.get(id, signal),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  const dashboard = query.data;
  const staleCount = useMemo(
    () => dashboard?.panels.filter((panel) => panel.state === 'stale' || panel.state === 'partial').length ?? 0,
    [dashboard],
  );

  const projectionNote = dashboardOperationsService.fixtureMode
    ? PROJECTION_NOTE_FIXTURE
    : PROJECTION_NOTE_LIVE;

  if (query.isLoading) {
    return (
      <section className="dsh-page" aria-label="Dashboard runtime">
        <div className="dsh-state" role="status">
          <Gauge size={28} />
          <strong>Loading operational dashboard</strong>
          <span>Resolving definition, variables, and bounded panel projections.</span>
        </div>
      </section>
    );
  }

  if (query.isError || !dashboard) {
    return (
      <section className="dsh-page" aria-label="Dashboard runtime">
        <div className="dsh-state dsh-state--error" role="alert">
          <AlertTriangle size={28} />
          <strong>Dashboard unavailable</strong>
          <span>
            {query.error instanceof Error ? query.error.message : 'The dashboard could not be loaded.'}
          </span>
          <p className="dsh-page__meta">
            <Link to={ROUTES.DASHBOARDS}>Dashboards</Link>
            <span aria-hidden="true">·</span>
            <Link to={ROUTES.DASHBOARD_STUDIO}>Studio</Link>
          </p>
          <button className="dsh-button" type="button" onClick={() => navigate(ROUTES.DASHBOARDS)}>
            Back to dashboards
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dsh-page" aria-label="Dashboard runtime" data-dashboard-runtime="panels">
      <header className="dsh-header">
        <div className="dsh-header__identity">
          <button
            className="dsh-icon-button"
            type="button"
            onClick={() => navigate(ROUTES.DASHBOARDS)}
            aria-label="Back to dashboards"
          >
            <ArrowLeft size={15} />
          </button>
          <span className="dsh-header__mark">
            <LayoutDashboard size={18} aria-hidden="true" />
          </span>
          <div className="dsh-header__copy">
            <div className="dsh-header__eyebrow">
              <span>{dashboard.managed ? 'MANAGED DASHBOARD' : 'OPERATIONAL DASHBOARD'}</span>
              <span className="dsh-header__badge">STAGING CANDIDATE</span>
              <span className="dsh-eyebrow">v{dashboard.version ?? 1}</span>
            </div>
            <h1>{dashboard.title}</h1>
            <p className="dsh-header__job">{DASHBOARD_RUNTIME_JOB_SENTENCE}</p>
            <p className="dsh-page__projection-note" role="note">
              {projectionNote}
            </p>
          </div>
        </div>
        <div className="dsh-header__actions">
          <span className="dsh-badge" data-health={dashboard.health}>
            {dashboard.health}
          </span>
          <button className="dsh-button" type="button" onClick={() => void query.refetch()}>
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            className="dsh-button"
            type="button"
            disabled={dashboard.managed && !dashboardOperationsService.fixtureMode}
            onClick={() => navigate(`/dashboards/${dashboard.id}/edit`)}
          >
            <Pencil size={13} />
            {dashboard.managed ? 'Clone to edit' : 'Edit'}
          </button>
        </div>
      </header>

      <p className="dsh-page__meta">
        <Link to={ROUTES.DASHBOARDS}>Dashboards</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD_STUDIO}>Studio</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_SCHEDULED}>Scheduled Reports</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.REPORTS_TEMPLATES}>Templates</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <span className="dsh-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {dashboardOperationsService.fixtureMode && (
        <div className="dsh-trust">
          <ShieldCheck size={13} />
          <strong>Design fixture:</strong> fictional panel results are enabled for visual review. Live
          mode runs stored visualizations through the role-gated API.
        </div>
      )}

      <div className="dsh-runtime-controls" aria-label="Dashboard context">
        <select
          className="dsh-select"
          value={timeRange}
          onChange={(event) => setTimeRange(event.target.value)}
          aria-label="Time range (UI filter only — not applied to visualization run)"
          title="UI filter only — not applied to visualization run until DSH variables exist"
        >
          <option>Last 15 minutes</option>
          <option>Last 4 hours</option>
          <option>Last 24 hours</option>
          <option>Last 7 days</option>
        </select>
        <span className="dsh-badge" title="Tenant variables require the canonical dashboard contract">
          Tenant scope not applied
        </span>
        {dashboard.variables.map((variable) => (
          <select className="dsh-select" key={variable.id} defaultValue={variable.value} aria-label={variable.label}>
            {variable.options.map((option) => (
              <option key={option.value} value={option.value}>
                {variable.label}: {option.label}
              </option>
            ))}
          </select>
        ))}
        <button
          className="dsh-button"
          type="button"
          disabled
          title="Global filters require the canonical dashboard contract"
        >
          <SlidersHorizontal size={13} />
          Filters
        </button>
        <button className="dsh-button" type="button" onClick={() => navigate(ROUTES.SEARCH)}>
          <ExternalLink size={13} />
          Open in Hunt
        </button>
      </div>

      <main className="dsh-runtime">
        <div className="dsh-runtime-grid">
          {dashboard.panels.map((panel) => (
            <article
              className="dsh-panel"
              key={panel.id}
              style={{
                gridColumn: `${panel.position.x + 1} / span ${panel.position.w}`,
                gridRow: `${panel.position.y + 1} / span ${panel.position.h}`,
              }}
            >
              <header className="dsh-panel__head">
                <div>
                  <h2>{panel.title}</h2>
                  <div className="dsh-panel__meta">
                    <span>{panel.source}</span>
                    <span>·</span>
                    <span data-state={panel.state}>{panel.state}</span>
                    {panel.updatedAt && (
                      <>
                        <span>·</span>
                        <span>
                          {new Date(panel.updatedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="dsh-panel-menu"
                  onClick={() => setSelected(panel)}
                  aria-label={`Open ${panel.title} details`}
                >
                  <MoreHorizontal size={14} />
                </button>
              </header>
              <div className="dsh-panel__body">
                <DashboardPanelRenderer panel={panel} />
              </div>
            </article>
          ))}
        </div>
      </main>

      <div className="dsh-status">
        <span>
          <Clock3 size={11} />
          {timeRange} · UI filter only
        </span>
        <strong>{staleCount ? `${staleCount} panels stale or partial` : 'All panels current'}</strong>
        <span>
          {dashboard.panels.length} panels · {dashboard.sourceCount ?? 0} sources
        </span>
      </div>
      <StatusDock
        className="dsh-status-dock"
        sseConnected={dashboardOperationsService.fixtureMode || eps.connected}
        eps={dashboardOperationsService.fixtureMode ? 12840 : eps.eps}
        mode={dashboardOperationsService.fixtureMode ? 'historical' : 'live'}
        lastUpdated={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined}
      />

      <HaDrawer
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Panel details'}
        subtitle={selected?.description}
        width={480}
        footer={
          selected?.drilldown ? (
            <button
              className="dsh-button dsh-button--primary"
              type="button"
              onClick={() => {
                if (selected.drilldown) navigate(selected.drilldown);
              }}
            >
              <ExternalLink size={13} />
              Open investigation pivot
            </button>
          ) : undefined
        }
      >
        {selected && (
          <div>
            <div className="dsh-readiness" data-ready={selected.state === 'ready'}>
              <strong>
                {selected.state === 'ready' ? 'Projection ready' : `Panel state: ${selected.state}`}
              </strong>
              <br />
              {selected.state === 'contract_unavailable'
                ? 'This panel has no stored visualization id, so it cannot be executed.'
                : selected.visualizationId !== undefined
                  ? 'Panel results come from the authorized visualization run endpoint (SEC-06).'
                  : 'Panel results preserve the active global context when opened.'}
            </div>
            <dl>
              <dt>Source</dt>
              <dd>{selected.source}</dd>
              <dt>Query contract</dt>
              <dd>{selected.queryLabel}</dd>
              <dt>Freshness</dt>
              <dd>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : 'Not reported'}</dd>
              <dt>Layout</dt>
              <dd>
                {selected.position.w} × {selected.position.h}
              </dd>
            </dl>
          </div>
        )}
      </HaDrawer>
    </section>
  );
}
