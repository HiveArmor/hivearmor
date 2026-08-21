/**
 * Incident Workbench — persistent case context with progressive investigation detail.
 * Heavy panels are code-split and supporting API calls do not block the case header.
 */

import { lazy, Suspense, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RowClickedEvent } from 'ag-grid-community';
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileSearch,
  Fingerprint,
  Hexagon,
  History,
  MessageSquare,
  Network,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';

import { IncidentEvidencePanel } from './components/IncidentEvidencePanel';
import { IncidentHeader } from './components/IncidentHeader';
import { IncidentTimelinePanel } from './components/IncidentTimelinePanel';
import {
  changeIncidentStatus,
  createEvidenceItem,
  fetchEvidenceItems,
  fetchIncidentAlerts,
  fetchIncidentDetail,
  fetchIncidentTimeline,
  fetchInvestigationSessions,
} from './incidentDetail.service';
import type {
  EvidenceItem,
  IncidentDetail,
  InvestigationSession,
  InvestigationTab,
  TimelineEvent,
} from './incidentDetail.types';
import { updateIncidentPriority } from './incidents.service';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { EntityTypeIcon } from '@/components/entity-type-icon';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaSelect } from '@/components/ha-select/HaSelect';
import { LoadingState } from '@/components/loading-state/LoadingState';
import type { IncidentStatus } from '@/constants/status.constants';
import { ROLES } from '@/lib/roles';
import { ALERT_COLUMNS_DEFAULT } from '@/pages/alerts/alertColumns';
import {
  foundationAlerts,
  foundationEntities,
  foundationEvidence,
  foundationIncident,
  foundationTimeline,
} from '@/pages/incidents/incidentDetail.fixtures';
import { getIncidentEntities } from '@/services/incidents.service';
import { useAuthStore } from '@/store/auth.store';
import type { UtmAlert } from '@/types/api.types';

import './IncidentDetailPage.css';

const AiChatPanel = lazy(() =>
  import('@/components/ai-chat/AiChatPanel').then((module) => ({ default: module.AiChatPanel }))
);
const AiIncidentSummaryCard = lazy(() =>
  import('@/components/ai-chat/AiIncidentSummaryCard').then((module) => ({
    default: module.AiIncidentSummaryCard,
  }))
);
const AlertDetailDrawer = lazy(() =>
  import('@/pages/alerts/AlertDetailDrawer').then((module) => ({ default: module.AlertDetailDrawer }))
);
const SiemDataGrid = lazy(() =>
  import('@/components/siem-data-grid/SiemDataGrid').then((module) => ({ default: module.SiemDataGrid }))
);
const ActivityFeed = lazy(() =>
  import('./components/ActivityFeed').then((module) => ({ default: module.ActivityFeed }))
);
const EventSearchPanel = lazy(() =>
  import('./components/EventSearchPanel').then((module) => ({ default: module.EventSearchPanel }))
);
const ResponseActionsPanel = lazy(() =>
  import('./components/ResponseActionsPanel').then((module) => ({ default: module.ResponseActionsPanel }))
);
const SimilarIncidentsPanel = lazy(() =>
  import('./components/SimilarIncidentsPanel').then((module) => ({ default: module.SimilarIncidentsPanel }))
);
const TaskPanel = lazy(() =>
  import('./components/TaskPanel').then((module) => ({ default: module.TaskPanel }))
);
const IncidentNotesPanel = lazy(() =>
  import('./components/IncidentNotesPanel').then((module) => ({ default: module.IncidentNotesPanel }))
);

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const validTabs: InvestigationTab[] = ['overview', 'timeline', 'evidence', 'alerts', 'events', 'tasks', 'response', 'activity', 'notes'];

const priorityOptions = [
  { value: 'P1', label: 'P1 — Critical' },
  { value: 'P2', label: 'P2 — High' },
  { value: 'P3', label: 'P3 — Medium' },
  { value: 'P4', label: 'P4 — Low' },
];

const evidenceTypeOptions = [
  { value: 'NOTE', label: 'Analyst note' },
  { value: 'ARTIFACT', label: 'Artifact' },
  { value: 'EXTERNAL_URL', label: 'External reference' },
  { value: 'ALERT', label: 'Alert reference' },
];

const statusLabels: Record<string, string> = {
  open: 'Open',
  OPEN: 'Open',
  in_progress: 'In Progress',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  resolved: 'Resolved',
  RESOLVED: 'Resolved',
  closed: 'Closed',
  CLOSED: 'Closed',
  COMPLETED: 'Completed',
};

interface EvidenceFormState {
  title: string;
  itemType: EvidenceItem['itemType'];
  description: string;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function IncidentLoadingSkeleton(): JSX.Element {
  return (
    <div className="incident-workbench__loading" aria-busy="true" aria-label="Loading incident workbench">
      <div className="incident-workbench__loading-header incident-skeleton" />
      <div className="incident-workbench__loading-grid">
        <div className="incident-skeleton" />
        <div className="incident-skeleton" />
        <div className="incident-skeleton" />
      </div>
    </div>
  );
}

function InlineLoading({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <div className="incident-loading-inline" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function IncidentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const incidentId = Number(id);
  const validIncidentId = Number.isInteger(incidentId) && incidentId > 0;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as InvestigationTab | null;
  const activeTab = requestedTab && validTabs.includes(requestedTab) ? requestedTab : 'overview';
  const [drawerAlertId, setDrawerAlertId] = useState<string | null>(null);
  const [isAddEvidenceOpen, setIsAddEvidenceOpen] = useState(false);
  const [isCloseOpen, setIsCloseOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>({
    title: '',
    itemType: 'NOTE',
    description: '',
  });

  const { hasRole } = useAuthStore();
  const canEdit = hasRole(ROLES.ANALYST) || hasRole(ROLES.SOC_MANAGER) || hasRole(ROLES.ADMIN);

  const incidentQuery = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => fixtureMode
      ? Promise.resolve({ ...foundationIncident, id: incidentId })
      : fetchIncidentDetail(incidentId),
    enabled: validIncidentId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const timelineQuery = useQuery({
    queryKey: ['incident', incidentId, 'timeline'],
    queryFn: () => fixtureMode ? Promise.resolve(foundationTimeline) : fetchIncidentTimeline(incidentId),
    enabled: validIncidentId,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const entitiesQuery = useQuery({
    queryKey: ['incident', incidentId, 'entities'],
    queryFn: () => fixtureMode ? Promise.resolve(foundationEntities) : getIncidentEntities(incidentId),
    enabled: validIncidentId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const evidenceQuery = useQuery({
    queryKey: ['incident', incidentId, 'evidence-items'],
    queryFn: () => fixtureMode ? Promise.resolve(foundationEvidence) : fetchEvidenceItems(incidentId),
    enabled: activeTab === 'evidence' && validIncidentId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const alertsQuery = useQuery({
    queryKey: ['incident', incidentId, 'alerts'],
    queryFn: () => fixtureMode
      ? Promise.resolve({ items: foundationAlerts, total: foundationAlerts.length })
      : fetchIncidentAlerts(incidentId, 50),
    enabled: activeTab === 'alerts' && validIncidentId,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const sessionsQuery = useQuery({
    queryKey: ['incident', incidentId, 'sessions'],
    queryFn: () => fixtureMode
      ? Promise.resolve<InvestigationSession[]>([
          {
            id: 817,
            incidentId,
            createdDate: '2026-08-02T03:47:00Z',
            createdBy: 'Maya Chen',
            status: 'OPEN',
            summary: 'Privileged identity validation and session assessment',
          },
        ])
      : fetchInvestigationSessions(incidentId),
    enabled: activeTab === 'activity' && validIncidentId,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: IncidentStatus) => fixtureMode
      ? Promise.resolve()
      : changeIncidentStatus(incidentId, status),
    onSuccess: (_data, status) => {
      queryClient.setQueryData<IncidentDetail>(['incident', incidentId], (current) =>
        current ? { ...current, incidentStatus: status, incidentLastUpdated: new Date().toISOString() } : current
      );
      if (!fixtureMode) void queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      setIsCloseOpen(false);
    },
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: IncidentDetail['incidentPriority']) => fixtureMode
      ? Promise.resolve()
      : updateIncidentPriority(incidentId, priority),
    onSuccess: (_data, priority) => {
      queryClient.setQueryData<IncidentDetail>(['incident', incidentId], (current) =>
        current ? { ...current, incidentPriority: priority } : current
      );
      if (!fixtureMode) void queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });

  const addEvidenceMutation = useMutation({
    mutationFn: (data: { title: string; itemType: EvidenceItem['itemType']; content: string }) => {
      if (fixtureMode) {
        return Promise.resolve<EvidenceItem>({
          id: Date.now(),
          incidentId,
          sourceRef: null,
          severityHint: null,
          createdBy: 'Maya Chen',
          createdAt: new Date().toISOString(),
          ...data,
        });
      }
      return createEvidenceItem({ incidentId, ...data });
    },
    onSuccess: (created) => {
      if (fixtureMode) {
        queryClient.setQueryData<EvidenceItem[]>(['incident', incidentId, 'evidence-items'], (current) => [
          ...(current ?? foundationEvidence),
          created,
        ]);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['incident', incidentId, 'evidence-items'] });
        void queryClient.invalidateQueries({ queryKey: ['incident', incidentId, 'timeline'] });
      }
      setIsAddEvidenceOpen(false);
      setEvidenceForm({ title: '', itemType: 'NOTE', description: '' });
    },
  });

  const sortedTimeline = useMemo(() => {
    return [...(timelineQuery.data ?? [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [timelineQuery.data]);

  const setActiveTab = (tab: InvestigationTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  if (!validIncidentId) {
    return (
      <div className="incident-workbench__error">
        <ErrorState title="Invalid incident ID" message="Open an incident from the incident queue and try again." />
      </div>
    );
  }

  if (incidentQuery.isLoading) return <IncidentLoadingSkeleton />;

  if (incidentQuery.isError || !incidentQuery.data) {
    const message = incidentQuery.error instanceof Error ? incidentQuery.error.message : '';
    const title = message === 'NOT_FOUND'
      ? 'Incident not found'
      : message === 'ACCESS_DENIED'
        ? 'Access restricted'
        : 'Could not load incident';
    const detail = message === 'NOT_FOUND'
      ? 'This case may have been removed, or the incident ID is incorrect.'
      : message === 'ACCESS_DENIED'
        ? 'Your current role does not have access to this incident.'
        : 'HiveArmor could not retrieve the case record. Existing data has not been changed.';
    return (
      <div className="incident-workbench__error">
        <ErrorState title={title} message={detail} onRetry={() => void incidentQuery.refetch()} />
      </div>
    );
  }

  const incident = incidentQuery.data;
  const entities = entitiesQuery.data ?? [];
  const highRiskEntities = entities.filter((entity) => entity.riskScore >= 80).length;
  const statusActive = incident.incidentStatus === 'open' || incident.incidentStatus === 'in_progress';

  const tabItems: Array<{ key: InvestigationTab; label: string; icon: JSX.Element; count?: number }> = [
    { key: 'overview', label: 'Overview', icon: <Hexagon size={14} aria-hidden="true" /> },
    { key: 'timeline', label: 'Attack story', icon: <History size={14} aria-hidden="true" />, count: timelineQuery.data?.length },
    { key: 'evidence', label: 'Evidence', icon: <FileCheck2 size={14} aria-hidden="true" />, count: evidenceQuery.data?.length },
    { key: 'alerts', label: 'Linked alerts', icon: <Bell size={14} aria-hidden="true" />, count: alertsQuery.data?.total },
    { key: 'events', label: 'Event hunt', icon: <Search size={14} aria-hidden="true" /> },
    { key: 'tasks', label: 'Tasks', icon: <ClipboardList size={14} aria-hidden="true" /> },
    { key: 'response', label: 'Response', icon: <Workflow size={14} aria-hidden="true" /> },
    { key: 'activity', label: 'Activity', icon: <Radio size={14} aria-hidden="true" />, count: sessionsQuery.data?.length },
    { key: 'notes', label: 'Notes', icon: <MessageSquare size={14} aria-hidden="true" /> },
  ];

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = tabItems.length - 1;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;

    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
    tabs?.[nextIndex]?.click();
  };

  return (
    <div className="incident-workbench">
      <IncidentHeader
        incident={incident}
        onAddEvidence={() => setIsAddEvidenceOpen(true)}
        onAskAi={() => setAiChatOpen(true)}
        canEdit={canEdit}
        isRefreshing={incidentQuery.isFetching}
      />

      {fixtureMode && (
        <div className="incident-workbench__fixture-notice">
          <span><strong>Demonstration data</strong> · Stable fictional records for visual validation only.</span>
          <span>Northwind Financial · Identity security</span>
        </div>
      )}

      <nav className="incident-phase-rail" aria-label="Incident response lifecycle">
        <span className="incident-phase-rail__label">Response path</span>
        <button type="button" data-state={incident.incidentStatus === 'open' ? 'active' : 'complete'} onClick={() => setActiveTab('overview')}>
          <span>1</span><strong>Triage</strong><small>{incident.incidentStatus === 'open' ? 'Current' : 'Started'}</small>
        </button>
        <button type="button" data-state={entities.length > 0 ? 'active' : 'pending'} onClick={() => setActiveTab('overview')}>
          <span>2</span><strong>Scope</strong><small>{entities.length > 0 ? `${String(entities.length)} entities` : 'Pending'}</small>
        </button>
        <button type="button" data-state="pending" onClick={() => setActiveTab('evidence')}>
          <span>3</span><strong>Preserve</strong><small>Evidence</small>
        </button>
        <button type="button" data-state="pending" onClick={() => setActiveTab('response')}>
          <span>4</span><strong>Contain</strong><small>Preview first</small>
        </button>
        <button type="button" data-state={statusActive ? 'pending' : 'complete'} onClick={() => setIsCloseOpen(statusActive)}>
          <span>5</span><strong>Resolve</strong><small>{statusActive ? 'Gated' : 'Complete'}</small>
        </button>
      </nav>

      <div className="incident-workbench__layout">
        <section className="incident-workbench__main" aria-label="Primary investigation content">
          <section className="incident-panel" aria-label="Investigation workspace">
            <div className="incident-tabs" role="tablist" aria-label="Incident investigation views">
              {tabItems.map((tab, index) => (
                <button
                  className="incident-tabs__button"
                  type="button"
                  role="tab"
                  id={`incident-tab-${tab.key}`}
                  aria-selected={activeTab === tab.key}
                  aria-controls={`incident-panel-${tab.key}`}
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {tab.icon} {tab.label}
                  {tab.count !== undefined && <span className="incident-tabs__count">{tab.count}</span>}
                </button>
              ))}
            </div>

            <div
              className="incident-tab-panel"
              role="tabpanel"
              id={`incident-panel-${activeTab}`}
              aria-labelledby={`incident-tab-${activeTab}`}
            >
              {activeTab === 'overview' && (
                <div className="incident-overview">
                  <div className="incident-overview__summary">
                    <section className="incident-overview__narrative">
                      <span className="incident-panel__eyebrow">Case narrative</span>
                      <h2>{incident.incidentName}</h2>
                      <p>{incident.incidentDescription || 'No incident description is available.'}</p>
                    </section>
                    <div className="incident-overview__stat">
                      <span>First observed</span>
                      <strong>{formatShortDate(incident.incidentCreatedDate)}</strong>
                      <small>{formatDateTime(incident.incidentCreatedDate)}</small>
                    </div>
                    <div className="incident-overview__stat">
                      <span>Last activity</span>
                      <strong>{formatShortDate(incident.incidentLastUpdated)}</strong>
                      <small>{sortedTimeline[0]?.actor ?? 'Case record'}</small>
                    </div>
                  </div>

                  <section className="incident-overview__decision-grid" aria-label="Incident decision context">
                    <article className="incident-decision-card incident-decision-card--wide">
                      <div className="incident-decision-card__heading">
                        <FileSearch size={15} aria-hidden="true" />
                        <div><span>Situation</span><strong>What is happening</strong></div>
                      </div>
                      <p>{incident.incidentDescription || 'No case narrative has been recorded yet.'}</p>
                    </article>
                    <article className="incident-decision-card">
                      <div className="incident-decision-card__heading">
                        <ShieldX size={15} aria-hidden="true" />
                        <div><span>Risk</span><strong>Why it matters</strong></div>
                      </div>
                      <ul>
                        <li>{incident.incidentSeverity}/10 severity · {incident.incidentPriority} priority</li>
                        <li>{highRiskEntities > 0 ? `${highRiskEntities} high-risk ${highRiskEntities === 1 ? 'entity' : 'entities'} in scope` : 'No entity risk above 80'}</li>
                        <li>{statusLabels[incident.incidentStatus] ?? incident.incidentStatus}</li>
                      </ul>
                    </article>
                    <article className="incident-decision-card">
                      <div className="incident-decision-card__heading">
                        <ShieldCheck size={15} aria-hidden="true" />
                        <div><span>Outcome</span><strong>Recommended objective</strong></div>
                      </div>
                      <p>{incident.incidentSolution || 'Document containment, impact, root cause, and validation before resolving this incident.'}</p>
                    </article>
                  </section>

                  <section className="incident-scope-section" aria-labelledby="affected-scope-title">
                    <div className="incident-section-heading">
                      <h2 id="affected-scope-title"><Users size={15} aria-hidden="true" /> Affected scope</h2>
                      <span>{entities.length} linked · {highRiskEntities} high risk</span>
                    </div>
                    {entitiesQuery.isLoading && <InlineLoading rows={3} />}
                    {entitiesQuery.isError && <div className="incident-inline-error">Entity scope is temporarily unavailable.</div>}
                    {!entitiesQuery.isLoading && !entitiesQuery.isError && entities.length === 0 && (
                      <div className="incident-empty-inline">No entities have been linked to this incident.</div>
                    )}
                    {entities.length > 0 && (
                      <div className="incident-scope-grid">
                        {entities.slice(0, 8).map((entity) => (
                          <a className="incident-scope-entity" href={`/entities/${encodeURIComponent(entity.id)}`} key={entity.id}>
                            <span className="incident-entity__icon"><EntityTypeIcon type={entity.type} size={15} /></span>
                            <span className="incident-entity__copy">
                              <strong>{entity.label}</strong>
                              <span>{entity.type} · {entity.alertCount} alert{entity.alertCount === 1 ? '' : 's'}</span>
                            </span>
                            <span className="incident-risk-score" data-level={entity.riskScore >= 90 ? 'critical' : 'high'}>{entity.riskScore}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>

                  <section aria-labelledby="investigation-focus-title">
                    <div className="incident-section-heading">
                      <h2 id="investigation-focus-title"><Network size={15} aria-hidden="true" /> Investigation focus</h2>
                    </div>
                    <div className="incident-investigation-focus">
                      <div className="incident-focus-card">
                        <span className="incident-focus-card__icon"><UserRound size={14} aria-hidden="true" /></span>
                        <strong>Validate identity</strong>
                        <span>Confirm the observed activity with the identity owner through an approved channel.</span>
                      </div>
                      <div className="incident-focus-card">
                        <span className="incident-focus-card__icon"><Fingerprint size={14} aria-hidden="true" /></span>
                        <strong>Verify context</strong>
                        <span>Compare linked hosts, addresses, and processes with the established baseline.</span>
                      </div>
                      <div className="incident-focus-card">
                        <span className="incident-focus-card__icon"><ShieldCheck size={14} aria-hidden="true" /></span>
                        <strong>Contain safely</strong>
                        <span>Preserve evidence and validate business impact before disruptive response actions.</span>
                      </div>
                    </div>
                  </section>

                  <div className="incident-ai-slot">
                    <Suspense fallback={<InlineLoading rows={2} />}>
                      <AiIncidentSummaryCard incidentId={String(incidentId)} />
                    </Suspense>
                  </div>

                  <section aria-labelledby="recent-activity-title">
                    <div className="incident-section-heading">
                      <h2 id="recent-activity-title"><History size={15} aria-hidden="true" /> Recent investigation activity</h2>
                      <button className="incident-text-action" type="button" onClick={() => setActiveTab('timeline')}>
                        View full timeline
                      </button>
                    </div>
                    {timelineQuery.isLoading && <InlineLoading rows={4} />}
                    {timelineQuery.isError && (
                      <div className="incident-inline-error">Activity could not be loaded. The case record remains available.</div>
                    )}
                    {!timelineQuery.isLoading && !timelineQuery.isError && (
                      <IncidentTimelinePanel
                        events={sortedTimeline}
                        isLoading={false}
                        isError={false}
                        onRetry={() => void timelineQuery.refetch()}
                        compact
                        limit={5}
                      />
                    )}
                  </section>

                  <div className="incident-operational-panel incident-operational-panel--related">
                    <Suspense fallback={<InlineLoading rows={3} />}>
                      <SimilarIncidentsPanel incidentId={String(incidentId)} />
                    </Suspense>
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <IncidentTimelinePanel
                  events={sortedTimeline}
                  isLoading={timelineQuery.isLoading}
                  isError={timelineQuery.isError}
                  onRetry={() => void timelineQuery.refetch()}
                />
              )}

              {activeTab === 'evidence' && (
                <IncidentEvidencePanel
                  items={evidenceQuery.data}
                  isLoading={evidenceQuery.isLoading}
                  isError={evidenceQuery.isError}
                  onRetry={() => void evidenceQuery.refetch()}
                  onAddEvidence={() => setIsAddEvidenceOpen(true)}
                  canEdit={canEdit}
                />
              )}

              {activeTab === 'alerts' && (
                <div className="incident-alerts">
                  {alertsQuery.isLoading && <LoadingState message="Loading linked alerts…" rows={8} />}
                  {alertsQuery.isError && (
                    <ErrorState message="Linked alerts could not be loaded" onRetry={() => void alertsQuery.refetch()} />
                  )}
                  {!alertsQuery.isLoading && !alertsQuery.isError && (alertsQuery.data?.items.length ?? 0) === 0 && (
                    <EmptyState
                      icon={<Bell size={42} />}
                      title="No alerts linked"
                      description="Alerts appear here when they are correlated with or manually attached to this incident."
                    />
                  )}
                  {!alertsQuery.isLoading && !alertsQuery.isError && (alertsQuery.data?.items.length ?? 0) > 0 && (
                    <>
                      <div className="incident-alerts__meta">
                        <span>{alertsQuery.data?.total ?? 0} linked alerts · newest first</span>
                        {(alertsQuery.data?.total ?? 0) > 50 && <span>Showing first 50 for faster review</span>}
                      </div>
                      <div className="incident-alerts__grid">
                        <Suspense fallback={<LoadingState message="Preparing alert grid…" rows={8} />}>
                          <SiemDataGrid
                            columnDefs={ALERT_COLUMNS_DEFAULT}
                            rowData={alertsQuery.data?.items ?? []}
                            rowHeight={34}
                            rowModelType="clientSide"
                            height="100%"
                            onRowClicked={(event: RowClickedEvent) => {
                              const alert = event.data as UtmAlert | undefined;
                              if (alert?.id) setDrawerAlertId(alert.id);
                            }}
                            defaultColDef={{ sortable: true, resizable: true, filter: false }}
                          />
                        </Suspense>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'events' && (
                <div className="incident-operational-panel">
                  <div className="incident-operational-note">
                    <Search size={15} aria-hidden="true" />
                    <div>
                      <strong>Incident-bounded event hunt</strong>
                      <span>Search is constrained to linked entities and a bounded projection. Pivot to Search &amp; Hunt for broader analysis.</span>
                    </div>
                    <a href={`/search?incidentId=${encodeURIComponent(String(incidentId))}`}>Open full hunt</a>
                  </div>
                  <Suspense fallback={<InlineLoading rows={6} />}>
                    <EventSearchPanel incidentId={String(incidentId)} linkedEntities={entities.map((entity) => entity.label)} />
                  </Suspense>
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="incident-operational-panel">
                  <Suspense fallback={<InlineLoading rows={6} />}>
                    <TaskPanel incidentId={String(incidentId)} />
                  </Suspense>
                </div>
              )}

              {activeTab === 'response' && (
                <div className="incident-operational-panel">
                  <div className="incident-operational-note" data-tone="warning">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <div>
                      <strong>Preview before execution</strong>
                      <span>Disruptive actions require a current target preview, an unexpired token, role authorization, and any configured approval gate.</span>
                    </div>
                    <a href="/response/authority">Review authority</a>
                  </div>
                  <Suspense fallback={<InlineLoading rows={6} />}>
                    <ResponseActionsPanel incidentId={String(incidentId)} />
                  </Suspense>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="incident-operational-panel incident-operational-panel--split">
                  <Suspense fallback={<InlineLoading rows={6} />}>
                    <ActivityFeed
                      incidentId={String(incidentId)}
                    />
                  </Suspense>
                  <section className="incident-sessions" aria-labelledby="incident-sessions-title">
                    <div className="incident-section-heading">
                      <h2 id="incident-sessions-title"><Radio size={15} aria-hidden="true" /> Investigation sessions</h2>
                      <span>{sessionsQuery.data?.length ?? 0}</span>
                    </div>
                    {sessionsQuery.isLoading && <LoadingState message="Loading investigation sessions…" />}
                    {sessionsQuery.isError && (
                      <ErrorState message="Investigation sessions could not be loaded" onRetry={() => void sessionsQuery.refetch()} />
                    )}
                    {!sessionsQuery.isLoading && !sessionsQuery.isError && (sessionsQuery.data?.length ?? 0) === 0 && (
                      <div className="incident-empty-inline">No structured investigation sessions have been linked to this case.</div>
                    )}
                    {sessionsQuery.data?.map((session) => (
                      <article className="incident-session" key={session.id}>
                        <span className="incident-session__icon"><Radio size={14} aria-hidden="true" /></span>
                        <div>
                          <strong>{session.summary || `Investigation session ${String(session.id)}`}</strong>
                          <span>{session.createdBy} · {(session.status ?? 'unknown').toLowerCase()}</span>
                        </div>
                        <time dateTime={session.createdDate}>{formatShortDate(session.createdDate)}</time>
                      </article>
                    ))}
                  </section>
                </div>
              )}

              {activeTab === 'notes' && (
                <Suspense fallback={<InlineLoading rows={6} />}>
                  <IncidentNotesPanel incidentId={String(incidentId)} />
                </Suspense>
              )}
            </div>
          </section>
        </section>

        <aside className="incident-workbench__rail incident-workbench__rail--actions" aria-label="Incident actions and control">
          <section className="incident-panel" data-tone="accent">
            <div className="incident-panel__header">
              <h2 className="incident-panel__heading"><ShieldCheck size={15} aria-hidden="true" /> Do this now</h2>
            </div>
            <div className="incident-panel__body">
              <div className="incident-action-stack">
                {incident.incidentStatus === 'open' && (
                  <button
                    className="incident-action"
                    data-variant="primary"
                    type="button"
                    disabled={!canEdit || statusMutation.isPending}
                    onClick={() => statusMutation.mutate('in_progress')}
                  >
                    <Play size={14} aria-hidden="true" /> Start investigation
                  </button>
                )}
                {incident.incidentStatus === 'in_progress' && (
                  <button className="incident-action" data-variant="primary" type="button" onClick={() => setActiveTab('timeline')}>
                    <Radio size={14} aria-hidden="true" /> Continue investigation
                    <span className="incident-action__hint">Attack story</span>
                  </button>
                )}
                <button className="incident-action" type="button" onClick={() => setActiveTab('tasks')}>
                  <ClipboardList size={14} aria-hidden="true" /> Review analyst tasks
                </button>
                <button className="incident-action" type="button" onClick={() => setActiveTab('response')}>
                  <Workflow size={14} aria-hidden="true" /> Preview response
                </button>
                <button
                  className="incident-action"
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setIsAddEvidenceOpen(true)}
                >
                  <FileCheck2 size={14} aria-hidden="true" /> Preserve evidence
                </button>
                <button className="incident-action" type="button" onClick={() => setAiChatOpen(true)}>
                  <Sparkles size={14} aria-hidden="true" /> Ask Hive Intelligence
                </button>
                <button className="incident-action" type="button" onClick={() => setActiveTab('events')}>
                  <Search size={14} aria-hidden="true" /> Hunt scoped events
                </button>
              </div>
            </div>
          </section>

          <section className="incident-panel">
            <div className="incident-panel__header">
              <h2 className="incident-panel__heading"><Hexagon size={15} aria-hidden="true" /> Case control</h2>
            </div>
            <div className="incident-panel__body">
              <div className="incident-control-list">
                <div className="incident-control-row">
                  <span>Status</span>
                  <strong>{statusLabels[incident.incidentStatus] ?? incident.incidentStatus}</strong>
                </div>
                <label className="incident-control-row">
                  <span>Priority</span>
                  <select
                    value={incident.incidentPriority}
                    disabled={!canEdit || priorityMutation.isPending}
                    onChange={(event) => priorityMutation.mutate(event.target.value as IncidentDetail['incidentPriority'])}
                    aria-label="Incident priority"
                  >
                    {priorityOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="incident-control-row">
                  <span>Owner</span>
                  <strong>{incident.incidentAssignedTo ?? 'Unassigned'}</strong>
                </div>
                <div className="incident-control-row">
                  <span>Opened</span>
                  <time dateTime={incident.incidentCreatedDate}>{formatShortDate(incident.incidentCreatedDate)}</time>
                </div>
              </div>
              {(statusMutation.isError || priorityMutation.isError) && (
                <div className="incident-inline-error" role="alert">The case update was not saved. Retry after checking connectivity.</div>
              )}
              <div className="incident-action-stack incident-action-stack--separated">
                {statusActive ? (
                  <button
                    className="incident-action"
                    data-variant="danger"
                    type="button"
                    disabled={!canEdit || statusMutation.isPending}
                    onClick={() => setIsCloseOpen(true)}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" /> Resolve and close
                  </button>
                ) : (
                  <button
                    className="incident-action"
                    type="button"
                    disabled={!canEdit || statusMutation.isPending}
                    onClick={() => statusMutation.mutate('open')}
                  >
                    <RefreshCw size={14} aria-hidden="true" /> Reopen case
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="incident-panel">
            <div className="incident-panel__header">
              <h2 className="incident-panel__heading"><Clock3 size={15} aria-hidden="true" /> Latest activity</h2>
              <button className="incident-text-action" type="button" onClick={() => setActiveTab('timeline')}>All</button>
            </div>
            <div className="incident-panel__body">
              {timelineQuery.isLoading && <InlineLoading rows={3} />}
              {timelineQuery.isError && <div className="incident-empty-inline">Activity is temporarily unavailable.</div>}
              {sortedTimeline.length > 0 && (
                <div className="incident-activity-mini">
                  {sortedTimeline.slice(0, 4).map((event: TimelineEvent, index) => (
                    <div className="incident-activity-mini__item" key={`${String(event.id)}-${String(index)}`}>
                      <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                      <p>{event.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <footer className="incident-status-dock" aria-label="Incident workbench status">
        <span><i data-state="connected" aria-hidden="true" /> Case record loaded</span>
        <span><Radio size={12} aria-hidden="true" /> {fixtureMode ? 'Stable design fixture' : incidentQuery.isFetching ? 'Refreshing snapshot' : 'Current snapshot'}</span>
        <span>{entities.length} entities · {timelineQuery.data?.length ?? 0} timeline events · updated {formatShortDate(incident.incidentLastUpdated)}</span>
      </footer>

      <HaConfirmationModal
        isOpen={isCloseOpen}
        title="Resolve and close incident"
        message="Confirm that containment, impact, root cause, and validation have been documented. Closing the case changes its operational status for the SOC."
        confirmLabel={statusMutation.isPending ? 'Closing…' : 'Close incident'}
        cancelLabel="Keep investigating"
        variant="danger"
        onConfirm={() => statusMutation.mutate('resolved')}
        onCancel={() => setIsCloseOpen(false)}
      />

      <HaDrawer
        isOpen={isAddEvidenceOpen}
        onClose={() => setIsAddEvidenceOpen(false)}
        title="Preserve evidence"
        subtitle={`INC-${String(incidentId)} · Add to the auditable case record`}
        footer={
          <div className="incident-drawer-actions">
            <HaButton variant="secondary" onClick={() => setIsAddEvidenceOpen(false)}>Cancel</HaButton>
            <HaButton
              variant="primary"
              isDisabled={!evidenceForm.title.trim() || addEvidenceMutation.isPending}
              onClick={() => addEvidenceMutation.mutate({
                title: evidenceForm.title.trim(),
                itemType: evidenceForm.itemType,
                content: evidenceForm.description.trim(),
              })}
            >
              {addEvidenceMutation.isPending ? 'Preserving…' : 'Preserve evidence'}
            </HaButton>
          </div>
        }
      >
        <div className="incident-drawer-form">
          <div className="incident-field">
            <label htmlFor="evidence-type">Evidence type</label>
            <HaSelect
              id="evidence-type"
              options={evidenceTypeOptions}
              value={evidenceForm.itemType}
              onChange={(value) => setEvidenceForm((current) => ({
                ...current,
                itemType: value as EvidenceItem['itemType'],
              }))}
            />
          </div>
          <div className="incident-field">
            <label htmlFor="evidence-title">Title</label>
            <input
              id="evidence-title"
              type="text"
              value={evidenceForm.title}
              onChange={(event) => setEvidenceForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="What was observed or preserved?"
              autoComplete="off"
            />
            <span className="incident-field__hint">Use a specific, searchable title. Avoid conclusions not supported by the evidence.</span>
          </div>
          <div className="incident-field">
            <label htmlFor="evidence-description">Analyst context</label>
            <textarea
              id="evidence-description"
              value={evidenceForm.description}
              onChange={(event) => setEvidenceForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Record provenance, relevance, and any validation already completed."
            />
          </div>
          {addEvidenceMutation.isError && (
            <div className="incident-inline-error" role="alert">Evidence was not saved. Your entered text is still available.</div>
          )}
        </div>
      </HaDrawer>

      {drawerAlertId && (
        <aside className="incident-workbench__drawer-host" aria-label="Alert detail">
          <Suspense fallback={<LoadingState message="Loading alert detail…" rows={8} />}>
            <AlertDetailDrawer alertId={drawerAlertId} onClose={() => setDrawerAlertId(null)} />
          </Suspense>
        </aside>
      )}

      {aiChatOpen && (
        <Suspense fallback={null}>
          <AiChatPanel
            open
            onClose={() => setAiChatOpen(false)}
            contextType="incident"
            contextId={String(incidentId)}
            contextSummary={incident.incidentName}
          />
        </Suspense>
      )}
    </div>
  );
}
