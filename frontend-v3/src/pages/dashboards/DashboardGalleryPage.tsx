/**
 * Dashboard gallery — inventory-first discover hub (Prompt 31 / Wave C1 opener).
 *
 * Production inventory: GET /api/ha-dashboards only. Fixtures never ship to production.
 */

import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Grid2X2,
  LayoutDashboard,
  List,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import './DashboardOperations.css';
import { dashboardOperationsService } from './dashboardOperations.service';
import type { DashboardAccess, DashboardHealth, DashboardRecord } from './dashboardOperations.types';

import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';

/** Bundle-visible job sentence — gallery discover, not Studio authoring or report generation. */
export const DASHBOARD_GALLERY_JOB_SENTENCE =
  'Dashboard gallery — discover operational dashboards, managed content, and health across authorized inventory. Runtime panels open on selection; Studio authoring is Analyst or above; scheduled reporting lives on Scheduled Reports.';

type ViewMode = 'grid' | 'list';
type SortMode = 'recent' | 'title' | 'owner';

function accessIcon(access: DashboardAccess): JSX.Element {
  return access === 'private' ? (
    <LockKeyhole size={11} />
  ) : access === 'team' ? (
    <Users size={11} />
  ) : (
    <ShieldCheck size={11} />
  );
}

function relativeTime(value?: string): string {
  if (!value) return 'Never opened';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60
    ? `${minutes}m ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ago`
      : `${Math.floor(minutes / 1440)}d ago`;
}

export function DashboardGalleryPage(): JSX.Element {
  const navigate = useNavigate();
  const eps = useEpsStream();
  const canCreate = useAuthStore((state) =>
    state.hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']),
  );
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<'all' | DashboardAccess>('all');
  const [health, setHealth] = useState<'all' | DashboardHealth>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [view, setView] = useState<ViewMode>('grid');
  const [active, setActive] = useState(0);

  const dashboardsQuery = useQuery({
    queryKey: ['dashboard-operations'],
    queryFn: ({ signal }) => dashboardOperationsService.list(signal),
    staleTime: 60_000,
  });
  const dashboards = useMemo(
    () => dashboardsQuery.data?.items ?? [],
    [dashboardsQuery.data?.items],
  );

  const hasFilters = access !== 'all' || health !== 'all' || Boolean(query.trim());

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return dashboards
      .filter(
        (item) =>
          (access === 'all' || item.access === access) &&
          (health === 'all' || item.health === health) &&
          (!needle ||
            `${item.title} ${item.description} ${item.owner} ${item.tags.join(' ')}`
              .toLocaleLowerCase()
              .includes(needle)),
      )
      .sort((a, b) =>
        sort === 'title'
          ? a.title.localeCompare(b.title)
          : sort === 'owner'
            ? a.owner.localeCompare(b.owner)
            : new Date(b.lastViewedAt ?? b.updatedAt ?? 0).getTime() -
              new Date(a.lastViewedAt ?? a.updatedAt ?? 0).getTime(),
      );
  }, [access, dashboards, health, query, sort]);

  useEffect(
    () => setActive((current) => Math.min(current, Math.max(0, filtered.length - 1))),
    [filtered.length],
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key.toLocaleLowerCase() === 'j') {
        event.preventDefault();
        setActive((value) => Math.min(value + 1, filtered.length - 1));
      }
      if (event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setActive((value) => Math.max(value - 1, 0));
      }
      if (event.key === 'Enter' && filtered[active]) {
        navigate(`/dashboards/${filtered[active].id}`);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [active, filtered, navigate]);

  const managed = dashboards.filter((item) => item.managed).length;
  const degraded = dashboards.filter((item) => item.health === 'degraded').length;
  const drafts = dashboards.filter((item) => item.health === 'draft').length;
  const showEmptyHonesty =
    !dashboardsQuery.isLoading && !dashboardsQuery.isError && dashboards.length === 0 && !hasFilters;
  const showFilterEmpty =
    !dashboardsQuery.isLoading &&
    !dashboardsQuery.isError &&
    dashboards.length > 0 &&
    filtered.length === 0;
  const projectionNote = !dashboardOperationsService.fixtureMode
    ? dashboardsQuery.data && !dashboardsQuery.data.bounded
      ? 'Legacy GET /api/ha-dashboards returns an array without X-Total-Count — bound and tenant scope are not verified. Panel run remains role-gated (SEC-06).'
      : 'Inventory via GET /api/ha-dashboards. Panel visualization run is role-gated (Analyst · SOC Manager · Platform Administrator). Canonical versioned save remains fixture-only until DSH contracts land.'
    : null;

  const clearFilters = (): void => {
    setQuery('');
    setAccess('all');
    setHealth('all');
    setSort('recent');
  };

  return (
    <section className="dsh-page" aria-label="Dashboard gallery">
      <header className="dsh-header">
        <div className="dsh-header__identity">
          <span className="dsh-header__mark">
            <LayoutDashboard size={18} aria-hidden="true" />
          </span>
          <div className="dsh-header__copy">
            <div className="dsh-header__eyebrow">
              <span>DASHBOARDS</span>
              <span className="dsh-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Dashboards</h1>
            <p className="dsh-header__job">{DASHBOARD_GALLERY_JOB_SENTENCE}</p>
            {projectionNote && (
              <p className="dsh-page__projection-note" role="note">
                {projectionNote}
              </p>
            )}
          </div>
        </div>
        <div className="dsh-header__actions">
          <span className="dsh-shortcut">
            <kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> open
          </span>
          <button
            className="dsh-button dsh-button--primary"
            type="button"
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : 'Required permission: Analyst, SOC Manager, or Platform Administrator'
            }
            onClick={() => navigate(ROUTES.DASHBOARD_STUDIO)}
          >
            <Plus size={14} />
            New dashboard
          </button>
        </div>
      </header>

      <p className="dsh-page__meta">
        <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.DASHBOARD_STUDIO}>Studio</Link>
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
          <strong>Design fixture:</strong> fictional dashboard definitions and panel data are
          enabled for visual review. Production never receives these records.
        </div>
      )}

      {showEmptyHonesty && (
        <div className="dashboards-empty-honesty" role="status" data-testid="dashboards-empty-honesty">
          <strong>No dashboards in authorized inventory.</strong>
          <span>
            An empty gallery does not imply platform health — create a governed definition in Studio
            (Analyst or above) when the save contract is available, or open Scheduled Reports for
            reporting operations. Mission Control remains available for triage widgets.
          </span>
        </div>
      )}

      <div className="dsh-toolbar" aria-label="Dashboard filters">
        <label className="dsh-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dashboards, owner, or tag…"
            aria-label="Search dashboards"
          />
        </label>
        <select
          className="dsh-select"
          value={access}
          onChange={(event) => setAccess(event.target.value as typeof access)}
          aria-label="Access scope"
        >
          <option value="all">All access</option>
          <option value="managed">Managed</option>
          <option value="team">Team</option>
          <option value="private">Private</option>
        </select>
        <select
          className="dsh-select"
          value={health}
          onChange={(event) => setHealth(event.target.value as typeof health)}
          aria-label="Dashboard health"
        >
          <option value="all">All health</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Needs attention</option>
          <option value="draft">Draft</option>
          <option value="unknown">Unknown</option>
        </select>
        <div className="dsh-toolbar__group dsh-toolbar__group--end">
          <select
            className="dsh-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            aria-label="Sort dashboards"
          >
            <option value="recent">Recently viewed</option>
            <option value="title">Title</option>
            <option value="owner">Owner</option>
          </select>
          <div className="dsh-segment" aria-label="Layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <Grid2X2 size={13} />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      <main className="dsh-content dsh-inventory">
        <div className="dsh-results-head">
          <div>
            <strong>Dashboards</strong>{' '}
            <span>
              {filtered.length} of {dashboardsQuery.data?.total ?? 0}
            </span>
            {!showEmptyHonesty && dashboards.length > 0 && (
              <span className="dsh-inline-stats" aria-label="Inventory summary">
                <span>{dashboards.length} visible</span>
                <span>{managed} managed</span>
                {degraded > 0 && <span data-tone="warning">{degraded} need attention</span>}
                {drafts > 0 && <span>{drafts} drafts</span>}
              </span>
            )}
            {hasFilters && filtered.length > 0 && (
              <button className="dsh-button" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
          <span>
            {dashboardsQuery.data?.tenantScoped
              ? 'Tenant scoped · bounded projection'
              : 'Legacy scope not reported'}
          </span>
        </div>

        {dashboardsQuery.isLoading ? (
          <div className="dsh-state" role="status">
            <BarChart3 size={28} />
            <strong>Loading dashboard inventory</strong>
            <span>Retrieving the dashboard inventory.</span>
          </div>
        ) : dashboardsQuery.isError ? (
          <div className="dsh-state dsh-state--error" role="alert">
            <AlertTriangle size={28} />
            <strong>Dashboard inventory unavailable</strong>
            <span>
              {dashboardsQuery.error instanceof Error
                ? dashboardsQuery.error.message
                : 'The inventory could not be loaded.'}
            </span>
            <button className="dsh-button" type="button" onClick={() => dashboardsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : showEmptyHonesty ? null : showFilterEmpty ? (
          <div className="dsh-state" role="status">
            <Search size={28} />
            <strong>No dashboards match this view</strong>
            <span>Clear filters or broaden access and health criteria.</span>
            <button className="dsh-button" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className={`dsh-gallery ${view === 'list' ? 'dsh-gallery--list' : ''}`}>
            {filtered.map((dashboard, index) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                active={index === active}
                onOpen={() => navigate(`/dashboards/${dashboard.id}`)}
                onFocus={() => setActive(index)}
              />
            ))}
          </div>
        )}
      </main>

      <div className="dsh-status">
        <span>
          <ShieldCheck size={11} />
          No dashboard opens without explicit selection
        </span>
        <strong>
          {dashboardOperationsService.fixtureMode
            ? 'Fixture execution · no production queries'
            : 'Inventory loaded · panel run role-gated'}
        </strong>
        <span>
          {dashboardsQuery.data?.bounded ? 'Bounded inventory' : 'Bound not verified'}
        </span>
      </div>
      <StatusDock
        className="dsh-status-dock"
        sseConnected={dashboardOperationsService.fixtureMode || eps.connected}
        eps={dashboardOperationsService.fixtureMode ? 12840 : eps.eps}
        mode="historical"
        lastUpdated={
          dashboardsQuery.dataUpdatedAt ? new Date(dashboardsQuery.dataUpdatedAt) : undefined
        }
      />
    </section>
  );
}

function DashboardCard({
  dashboard,
  active,
  onOpen,
  onFocus,
}: {
  dashboard: DashboardRecord;
  active: boolean;
  onOpen: () => void;
  onFocus: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="dsh-card"
      data-active={active}
      onClick={onOpen}
      onFocus={onFocus}
    >
      <div className="dsh-card__body">
        <div className="dsh-card__meta">
          <span className="dsh-badge" data-health={dashboard.health}>
            {dashboard.health}
          </span>
          <span>{dashboard.managed ? 'Managed' : `v${dashboard.version ?? 1}`}</span>
        </div>
        <h2>{dashboard.title}</h2>
        <p>{dashboard.description}</p>
        <div className="dsh-tags">
          {dashboard.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <footer className="dsh-card__footer">
        <span>
          {accessIcon(dashboard.access)}
          {dashboard.access} · {dashboard.owner}
        </span>
        <span>
          <Clock3 size={10} />
          {relativeTime(dashboard.lastViewedAt ?? dashboard.updatedAt)}
        </span>
      </footer>
    </button>
  );
}
