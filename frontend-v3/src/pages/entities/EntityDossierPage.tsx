/**
 * Entity dossier — canonical detail for an inventory pivot.
 * Confirmed APIs only: detail, risk, alerts, events. Honesty when empty/5xx.
 */

import { useCallback, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Crosshair,
  Database,
  ExternalLink,
  FlaskConical,
  Laptop,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import { SeverityLabel } from '@/components/severity-label/SeverityLabel';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ApiError } from '@/lib/apiClient';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import { numericToSeverityLevel } from '@/lib/severity';
import {
  entityFixtureMode,
  fetchEntityAlerts,
  fetchEntityDetail,
  fetchEntityEvents,
  fetchEntityRisk,
} from '@/services/entities.service';
import { useAuthStore } from '@/store/auth.store';
import type { EntityDetailDTO, EntityType } from '@/types/entity.types';

import './EntityDossierPage.css';

export const ENTITY_DOSSIER_JOB_SENTENCE =
  'Risk dossier — understand entity exposure from confirmed risk and related alerts/events, then pivot to hunt or response.';

type DossierTab = 'alerts' | 'events';

const MUTATE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.ANALYST]} or higher`;

function entityHuntQuery(entity: Pick<EntityDetailDTO, 'entityType' | 'name'>): string {
  const field = entity.entityType === 'host' ? 'host.name'
    : entity.entityType === 'user' ? 'user.name'
      : entity.entityType === 'ip' ? 'source.ip'
        : `${entity.entityType}.name`;
  return `${field}:"${entity.name.replace(/"/g, '\\"')}"`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function riskLevelFromScore(score: number | undefined): string {
  if (score === undefined || score === null) return 'unknown';
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function InlineState({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry?: () => void;
}): JSX.Element {
  return (
    <div className="ha-dossier-inline-state" role="status">
      <AlertTriangle size={18} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {retry && <button type="button" onClick={retry}>Retry</button>}
      </div>
    </div>
  );
}

export function EntityDossierPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: DossierTab = requestedTab === 'events' ? 'events' : 'alerts';
  const epsStream = useEpsStream();
  const hasAccess = useAuthStore((state) =>
    state.hasAnyRole([ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.ADMIN, 'ROLE_SOC_ANALYST']),
  );
  const [eventsVisible, setEventsVisible] = useState(25);
  const [alertsVisible, setAlertsVisible] = useState(25);

  const detailQuery = useQuery({
    queryKey: ['entity-dossier-detail', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityDetail(id, signal);
    },
    enabled: hasAccess && Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });

  const riskQuery = useQuery({
    queryKey: ['entity-dossier-risk', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityRisk(id, signal);
    },
    enabled: hasAccess && Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });

  const alertsQuery = useQuery({
    queryKey: ['entity-dossier-alerts', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityAlerts(id, signal);
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'alerts',
    staleTime: 20_000,
    retry: 1,
  });

  const eventsQuery = useQuery({
    queryKey: ['entity-dossier-events', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityEvents(id, signal);
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'events',
    staleTime: 20_000,
    retry: 1,
  });

  const handleBack = useCallback(() => {
    navigate('/entities');
  }, [navigate]);

  const selectTab = useCallback((tab: DossierTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const entity = detailQuery.data;
  const huntQuery = useMemo(
    () => (entity ? entityHuntQuery(entity) : ''),
    [entity],
  );

  const score = riskQuery.data?.riskScore ?? entity?.riskScore;
  const level = riskQuery.data?.riskLevel ?? entity?.riskLevel ?? riskLevelFromScore(score);
  const trend = riskQuery.data?.riskTrend ?? entity?.riskTrend;
  const drivers = riskQuery.data?.riskDrivers?.length
    ? riskQuery.data.riskDrivers
    : entity?.riskDrivers;
  const isHost = entity?.entityType === 'host' || (entity?.entityType as EntityType | undefined) === 'host';

  if (!id) {
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>No entity selected</h2>
          <p>Navigate to an entity from the inventory to view its dossier.</p>
          <button type="button" onClick={handleBack}>Back to entities</button>
        </div>
      </section>
    );
  }

  if (!hasAccess) {
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>Entity dossier restricted</h2>
          <p>{MUTATE_DENIED}</p>
          <button type="button" onClick={handleBack}>Back to entities</button>
        </div>
      </section>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <section className="ha-dossier-page" aria-busy="true">
        <div className="ha-dossier-page__skeleton ha-dossier-page__skeleton--header" role="status" aria-label="Loading entity dossier" />
        <div className="ha-dossier-page__skeleton-grid">
          <div className="ha-dossier-page__skeleton" />
          <div className="ha-dossier-page__skeleton" />
        </div>
      </section>
    );
  }

  if (detailQuery.isError || !entity) {
    const is404 = detailQuery.error instanceof ApiError && detailQuery.error.status === 404;
    const is403 = detailQuery.error instanceof ApiError && detailQuery.error.status === 403;
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>{is404 ? 'Entity not found' : is403 ? 'Access denied' : 'Failed to load dossier'}</h2>
          <p>
            {is404
              ? 'This entity does not exist in the authorized inventory, or GET /api/ha-entities/{id} is unavailable.'
              : is403
                ? MUTATE_DENIED
                : detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : 'An error occurred while loading the entity dossier.'}
          </p>
          <button type="button" onClick={handleBack}>Back to entities</button>
          {!is404 && !is403 && (
            <button type="button" onClick={() => void detailQuery.refetch()}>Retry</button>
          )}
        </div>
      </section>
    );
  }

  const alerts = (alertsQuery.data ?? []).slice(0, alertsVisible);
  const events = (eventsQuery.data ?? []).slice(0, eventsVisible);

  return (
    <section className="ha-dossier-page" aria-label="Entity risk dossier">
      <header className="ha-dossier-page__topbar">
        <button
          type="button"
          className="ha-dossier-page__back"
          onClick={handleBack}
          aria-label="Back to entity inventory"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="ha-dossier-page__topbar-title">
          <span>Entity dossier</span>
          <strong>{entity.name}</strong>
          <p className="ha-dossier-page__job">{ENTITY_DOSSIER_JOB_SENTENCE}</p>
        </div>
        <div className="ha-dossier-page__topbar-spacer" />
        <button
          type="button"
          className="ha-dossier-page__refresh"
          onClick={() => {
            void detailQuery.refetch();
            void riskQuery.refetch();
            void alertsQuery.refetch();
            void eventsQuery.refetch();
          }}
          aria-label="Refresh dossier"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      <p className="ha-dossier-page__meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/entities">Inventory</Link>
        <span aria-hidden="true">·</span>
        <Link to={`/search?q=${encodeURIComponent(huntQuery)}`}>Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to="/investigations">Investigations</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        {isHost && (
          <>
            <span aria-hidden="true">·</span>
            <Link to="/posture/sensors">Sensors</Link>
          </>
        )}
        <span aria-hidden="true">·</span>
        <Link to="/ueba/risk">UEBA risk</Link>
      </p>

      {entityFixtureMode && (
        <div className="ha-dossier-page__fixture" role="status">
          <strong>Design fixture:</strong> fictional risk and activity records are enabled.
          <span>Production never receives these records.</span>
        </div>
      )}

      <div className="ha-dossier-page__scroll">
        <header className="ha-dossier-identity">
          <span className="ha-dossier-identity__icon">
            <EntityTypeIcon type={entity.entityType} size={26} />
          </span>
          <div className="ha-dossier-identity__info">
            <div className="ha-dossier-identity__title">
              <h1>{entity.name}</h1>
              <span>{entityTypeLabel(entity.entityType)}</span>
              {entity.criticality && <span data-level={entity.criticality}>{entity.criticality.replace(/_/g, ' ')}</span>}
            </div>
            <code>{entity.id}</code>
            <div className="ha-dossier-identity__meta">
              <span>First seen {formatDateTime(entity.firstSeen)}</span>
              <span>Last seen {formatDateTime(entity.lastSeen)}</span>
              {entity.watchlisted !== undefined && <span>{entity.watchlisted ? 'Watchlisted' : 'Not watchlisted'}</span>}
            </div>
            {entity.tags && entity.tags.length > 0 && (
              <div className="ha-dossier-identity__tags">
                {entity.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}
          </div>
          <div className="ha-dossier-identity__pivots" role="group" aria-label="Entity pivots">
            <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(huntQuery)}`)}>
              <Search size={14} /> Hunt
            </button>
            <button type="button" onClick={() => navigate('/alerts')}>
              <Bell size={14} /> Alerts
            </button>
            <button type="button" onClick={() => navigate('/investigations')}>
              <FlaskConical size={14} /> Investigations
            </button>
            <button type="button" onClick={() => navigate('/incidents')}>
              <Siren size={14} /> Incidents
            </button>
            {isHost && (
              <button type="button" onClick={() => navigate('/posture/sensors')}>
                <Laptop size={14} /> Sensors
              </button>
            )}
          </div>
        </header>

        <div className="ha-dossier-page__grid">
          <section className="ha-dossier-risk" aria-label="Entity risk">
            <header>
              <ShieldAlert size={14} />
              <h2>Risk</h2>
              <span>GET /api/ha-entities/{'{id}'}/risk</span>
            </header>
            {riskQuery.isLoading && !riskQuery.data && !entity.riskScore && score === undefined ? (
              <InlineState title="Loading risk" message="Fetching confirmed risk projection…" />
            ) : riskQuery.isError && score === undefined ? (
              <InlineState
                title="Risk unavailable"
                message={
                  riskQuery.error instanceof ApiError
                    ? `Risk endpoint returned ${riskQuery.error.status}. No synthetic score is shown.`
                    : 'Risk projection failed. No synthetic score is shown.'
                }
                retry={() => void riskQuery.refetch()}
              />
            ) : (
              <>
                <div className="ha-dossier-risk__score" data-level={level}>
                  <strong>{score ?? '—'}</strong>
                  <span>{String(level)}</span>
                  {trend && <em>{trend}</em>}
                </div>
                <p className="ha-dossier-risk__calc">
                  Last calculated {formatDateTime(riskQuery.data?.lastCalculated ?? entity.riskCalculatedAt)}
                </p>
                {drivers && drivers.length > 0 ? (
                  <ul className="ha-dossier-risk__drivers">
                    {drivers.map((driver, index) => (
                      <li key={driver.id ?? driver.label ?? String(index)}>
                        <strong>{driver.label ?? 'Driver'}</strong>
                        {driver.contribution !== undefined && <span>+{driver.contribution}</span>}
                        {driver.description && <p>{driver.description}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ha-dossier-risk__honesty">
                    Score available without explainable drivers. No baseline graph is invented when history is absent.
                  </p>
                )}
                {riskQuery.isError && score !== undefined && (
                  <p className="ha-dossier-risk__partial" role="status">
                    Dedicated /risk endpoint failed; showing score from entity detail when present.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="ha-dossier-summary" aria-label="Entity summary">
            <header>
              <Database size={14} />
              <h2>Summary</h2>
            </header>
            <dl>
              <div><dt>Active alerts</dt><dd>{entity.alertCount}</dd></div>
              <div><dt>Linked incidents</dt><dd>{entity.incidentCount ?? '—'}</dd></div>
              <div><dt>Tenant</dt><dd>{entity.tenantName ?? 'Authorized scope'}</dd></div>
              <div><dt>Status</dt><dd>{entity.status ?? 'Unknown'}</dd></div>
            </dl>
            <div className="ha-dossier-summary__hunt">
              <Crosshair size={13} />
              <code>{huntQuery}</code>
              <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(huntQuery)}`)}>
                Open in Search <ExternalLink size={12} />
              </button>
            </div>
          </section>
        </div>

        <nav className="ha-dossier-page__tabs" role="tablist" aria-label="Dossier related panels">
          <button role="tab" aria-selected={activeTab === 'alerts'} onClick={() => selectTab('alerts')}>
            <Bell size={13} /> Related alerts
          </button>
          <button role="tab" aria-selected={activeTab === 'events'} onClick={() => selectTab('events')}>
            <Activity size={13} /> Related events
          </button>
        </nav>

        <div className="ha-dossier-page__tab-content" role="tabpanel">
          {activeTab === 'alerts' && (
            <section className="ha-dossier-related">
              <header>
                <strong>Related alerts</strong>
                <span>GET /api/ha-entities/{'{id}'}/alerts</span>
              </header>
              {alertsQuery.isLoading && <InlineState title="Loading alerts" message="Fetching related alerts…" />}
              {alertsQuery.isError && (
                <InlineState
                  title="Related alerts unavailable"
                  message={
                    alertsQuery.error instanceof ApiError
                      ? `Alerts endpoint returned ${alertsQuery.error.status}.`
                      : 'Related alerts could not be loaded.'
                  }
                  retry={() => void alertsQuery.refetch()}
                />
              )}
              {!alertsQuery.isLoading && !alertsQuery.isError && alerts.length === 0 && (
                <InlineState title="No related alerts" message="No authorized alerts were returned for this entity." />
              )}
              {alerts.length > 0 && (
                <ul className="ha-dossier-related__list">
                  {alerts.map((alert) => (
                    <li key={alert.id}>
                      <button type="button" onClick={() => navigate(`/alerts/${encodeURIComponent(alert.id)}`)}>
                        <SeverityLabel severity={numericToSeverityLevel(alert.severity)} size="sm" />
                        <span>
                          <strong>{alert.title}</strong>
                          <small>{formatDateTime(alert.timestamp)} · {alert.status.replace(/_/g, ' ')}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(alertsQuery.data?.length ?? 0) > alertsVisible && (
                <button type="button" className="ha-dossier-related__more" onClick={() => setAlertsVisible((n) => n + 25)}>
                  Show more
                </button>
              )}
            </section>
          )}

          {activeTab === 'events' && (
            <section className="ha-dossier-related">
              <header>
                <strong>Related events</strong>
                <span>GET /api/ha-entities/{'{id}'}/events</span>
              </header>
              {eventsQuery.isLoading && <InlineState title="Loading events" message="Fetching related events…" />}
              {eventsQuery.isError && (
                <InlineState
                  title="Related events unavailable"
                  message={
                    eventsQuery.error instanceof ApiError
                      ? `Events endpoint returned ${eventsQuery.error.status}.`
                      : 'Related events could not be loaded.'
                  }
                  retry={() => void eventsQuery.refetch()}
                />
              )}
              {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
                <InlineState title="No related events" message="No authorized events were returned for this entity." />
              )}
              {events.length > 0 && (
                <ul className="ha-dossier-related__list">
                  {events.map((event, index) => (
                    <li key={event.id ?? `${event.timestamp}-${index}`}>
                      <div className="ha-dossier-related__event">
                        <strong>{event.action ?? event.source}</strong>
                        <small>{formatDateTime(event.timestamp)} · {event.source}</small>
                        <p>{event.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(eventsQuery.data?.length ?? 0) > eventsVisible && (
                <button type="button" className="ha-dossier-related__more" onClick={() => setEventsVisible((n) => n + 25)}>
                  Show more
                </button>
              )}
            </section>
          )}
        </div>
      </div>

      <div className="ha-dossier-page__status">
        <StatusDock
          sseConnected={epsStream.connected}
          eps={epsStream.eps}
          mode="historical"
          lastUpdated={detailQuery.dataUpdatedAt ? new Date(detailQuery.dataUpdatedAt) : undefined}
        />
      </div>
    </section>
  );
}
