/**
 * Entity dossier — canonical detail for an inventory pivot.
 * Uses live /dossier + /alerts + /activity; never blocks the page on bare /{id}
 * (unmapped → 500) or missing OpenSearch entity docs (404 → shell + honesty).
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

import { getActivity, getDossier, getRelatedAlerts } from './services/dossier.service';
import type { EntityIdentity, RiskProfile } from './types/dossier.types';
import type { EntEntityType } from './types/entity.types';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ApiError } from '@/lib/apiClient';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import { useAuthStore } from '@/store/auth.store';

import './EntityDossierPage.css';

export const ENTITY_DOSSIER_JOB_SENTENCE =
  'Risk dossier — understand entity exposure from confirmed risk and related alerts/events, then pivot to hunt or response.';

type DossierTab = 'alerts' | 'events';

const MUTATE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.ANALYST]} or higher`;

function inferEntityType(id: string): EntEntityType {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(id)) return 'ip';
  if (id.includes('@')) return 'user';
  if (id.includes('.') && !id.includes(' ')) return 'host';
  if (/^[A-Za-z0-9-]{8,}$/.test(id)) return 'host';
  return 'host';
}

function shellIdentity(id: string): EntityIdentity {
  const type = inferEntityType(id);
  const now = new Date().toISOString();
  return {
    id,
    type,
    value: id,
    displayName: id,
    firstSeen: now,
    lastSeen: now,
    tags: [],
    criticality: 'unclassified',
  };
}

function entityHuntQuery(type: EntEntityType, name: string): string {
  const field = type === 'host' ? 'host.name'
    : type === 'user' ? 'user.name'
      : type === 'ip' ? 'source.ip'
        : `${type}.name`;
  return `${field}:"${name.replace(/"/g, '\\"')}"`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
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

  const dossierQuery = useQuery({
    queryKey: ['entity-dossier-core', id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return getDossier(id, '30d', signal);
    },
    enabled: hasAccess && Boolean(id),
    staleTime: 30_000,
    retry: false,
  });

  const alertsQuery = useQuery({
    queryKey: ['entity-dossier-alerts', id],
    queryFn: async ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      try {
        return await getRelatedAlerts(id, { limit: 50 }, signal);
      } catch (error) {
        if (isNotFound(error)) return { items: [], cursor: null, total: 0 };
        throw error;
      }
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'alerts',
    staleTime: 20_000,
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ['entity-dossier-events', id],
    queryFn: async ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      try {
        return await getActivity(id, { limit: 50 }, signal);
      } catch (error) {
        if (isNotFound(error)) return { items: [], cursor: null, total: 0, window: { from: '', to: '' } };
        throw error;
      }
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'events',
    staleTime: 20_000,
    retry: false,
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

  const entityMissing = Boolean(dossierQuery.isError && isNotFound(dossierQuery.error));
  const dossierHardFail = Boolean(
    dossierQuery.isError && !isNotFound(dossierQuery.error),
  );

  const identity: EntityIdentity | null = useMemo(() => {
    if (!id) return null;
    if (dossierQuery.data?.dossier?.identity) return dossierQuery.data.dossier.identity;
    if (entityMissing || dossierHardFail) return shellIdentity(id);
    return null;
  }, [dossierQuery.data, dossierHardFail, entityMissing, id]);

  const riskProfile: RiskProfile | null = dossierQuery.data?.dossier?.riskProfile ?? null;
  const huntQuery = identity ? entityHuntQuery(identity.type, identity.displayName || identity.value) : '';
  const isHost = identity?.type === 'host';

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

  if (dossierQuery.isLoading && !identity) {
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

  if (!identity) {
    return (
      <section className="ha-dossier-page">
        <div className="ha-dossier-page__error">
          <AlertTriangle size={24} />
          <h2>Failed to load dossier</h2>
          <p>
            {dossierQuery.error instanceof Error
              ? dossierQuery.error.message
              : 'An error occurred while loading the entity dossier.'}
          </p>
          <button type="button" onClick={handleBack}>Back to entities</button>
          <button type="button" onClick={() => void dossierQuery.refetch()}>Retry</button>
        </div>
      </section>
    );
  }

  const alerts = (alertsQuery.data?.items ?? []).slice(0, alertsVisible);
  const events = (eventsQuery.data?.items ?? []).slice(0, eventsVisible);
  const score = riskProfile?.score;
  const level = riskProfile?.level ?? 'unknown';
  const trend = riskProfile?.trend;
  const drivers = riskProfile?.drivers ?? [];

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
          <strong>{identity.displayName || identity.value}</strong>
          <p className="ha-dossier-page__job">{ENTITY_DOSSIER_JOB_SENTENCE}</p>
        </div>
        <div className="ha-dossier-page__topbar-spacer" />
        <button
          type="button"
          className="ha-dossier-page__refresh"
          onClick={() => {
            void dossierQuery.refetch();
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

      {(entityMissing || dossierHardFail) && (
        <div className="ha-dossier-page__honesty" role="status">
          <AlertTriangle size={14} />
          <div>
            <strong>
              {entityMissing
                ? 'Entity not in risk inventory'
                : 'Entity risk projection unavailable'}
            </strong>
            <p>
              {entityMissing
                ? 'No indexed entity document matched this id. Showing a pivot shell from the URL — risk score and related panels stay honest until inventory is populated.'
                : dossierQuery.error instanceof Error
                  ? dossierQuery.error.message
                  : 'The dossier service did not return a projection.'}
            </p>
          </div>
        </div>
      )}

      <div className="ha-dossier-page__scroll">
        <header className="ha-dossier-identity">
          <span className="ha-dossier-identity__icon">
            <EntityTypeIcon type={identity.type} size={26} />
          </span>
          <div className="ha-dossier-identity__info">
            <div className="ha-dossier-identity__title">
              <h1>{identity.displayName || identity.value}</h1>
              <span>{entityTypeLabel(identity.type)}</span>
              {identity.criticality && (
                <span data-level={identity.criticality}>{identity.criticality.replace(/_/g, ' ')}</span>
              )}
            </div>
            <code>{identity.id}</code>
            <div className="ha-dossier-identity__meta">
              <span>First seen {formatDateTime(entityMissing ? undefined : identity.firstSeen)}</span>
              <span>Last seen {formatDateTime(entityMissing ? undefined : identity.lastSeen)}</span>
              {identity.os && <span>{identity.os}</span>}
              {identity.location && <span>{identity.location}</span>}
            </div>
            {identity.tags.length > 0 && (
              <div className="ha-dossier-identity__tags">
                {identity.tags.map((tag) => <span key={tag}>{tag}</span>)}
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
              <span>GET /api/ha-entities/{'{id}'}/dossier</span>
            </header>
            {entityMissing || !riskProfile ? (
              <InlineState
                title="Risk unavailable"
                message="No calculated risk score for this entity yet. Open Search & Hunt or Sensors to continue investigation."
              />
            ) : (
              <>
                <div className="ha-dossier-risk__score" data-level={level}>
                  <strong>{score ?? '—'}</strong>
                  <span>{String(level)}</span>
                  {trend && <em>{trend}</em>}
                </div>
                {drivers.length > 0 ? (
                  <ul className="ha-dossier-risk__drivers">
                    {drivers.map((driver) => (
                      <li key={driver.id}>
                        <strong>{driver.category || driver.description}</strong>
                        <span>+{driver.contribution}</span>
                        {driver.description && <p>{driver.description}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ha-dossier-risk__honesty">
                    Score available without explainable drivers. No baseline graph is invented when history is absent.
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
              <div>
                <dt>Type</dt>
                <dd>{entityTypeLabel(identity.type)}</dd>
              </div>
              <div>
                <dt>Inventory</dt>
                <dd>{entityMissing ? 'Not indexed' : 'Indexed'}</dd>
              </div>
              <div>
                <dt>Alerts (loaded)</dt>
                <dd>{alertsQuery.data?.total ?? '—'}</dd>
              </div>
              <div>
                <dt>Criticality</dt>
                <dd>{identity.criticality?.replace(/_/g, ' ') ?? '—'}</dd>
              </div>
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
                <InlineState
                  title="No related alerts"
                  message={
                    entityMissing
                      ? 'Entity is not indexed, so alert linkage is empty. Hunt this host from Search if needed.'
                      : 'No authorized alerts were returned for this entity.'
                  }
                />
              )}
              {alerts.length > 0 && (
                <ul className="ha-dossier-related__list">
                  {alerts.map((alert) => (
                    <li key={alert.id}>
                      <button type="button" onClick={() => navigate(`/alerts/${encodeURIComponent(alert.id)}`)}>
                        <span className="ha-dossier-related__sev" data-sev={alert.severity}>{alert.severity}</span>
                        <span>
                          <strong>{alert.title}</strong>
                          <small>{formatDateTime(alert.timestamp)} · {alert.status.replace(/_/g, ' ')}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(alertsQuery.data?.items.length ?? 0) > alertsVisible && (
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
                <span>GET /api/ha-entities/{'{id}'}/activity</span>
              </header>
              {eventsQuery.isLoading && <InlineState title="Loading events" message="Fetching related events…" />}
              {eventsQuery.isError && (
                <InlineState
                  title="Related events unavailable"
                  message={
                    eventsQuery.error instanceof ApiError
                      ? `Activity endpoint returned ${eventsQuery.error.status}.`
                      : 'Related events could not be loaded.'
                  }
                  retry={() => void eventsQuery.refetch()}
                />
              )}
              {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
                <InlineState
                  title="No related events"
                  message={
                    entityMissing
                      ? 'Entity is not indexed, so activity is empty. Prefill Search with the host pivot above.'
                      : 'No authorized events were returned for this entity.'
                  }
                />
              )}
              {events.length > 0 && (
                <ul className="ha-dossier-related__list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <div className="ha-dossier-related__event">
                        <strong>{event.description || event.type}</strong>
                        <small>{formatDateTime(event.timestamp)} · {event.type} · {event.source}</small>
                        {event.description && <p>{event.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(eventsQuery.data?.items.length ?? 0) > eventsVisible && (
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
          lastUpdated={dossierQuery.dataUpdatedAt ? new Date(dossierQuery.dataUpdatedAt) : undefined}
        />
      </div>
    </section>
  );
}
