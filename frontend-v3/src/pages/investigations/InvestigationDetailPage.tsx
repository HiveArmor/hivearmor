/**
 * Investigation detail — pin evidence, narrative notes/tasks, INV-012 promote to incident.
 */

import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FlaskConical,
  History,
  Lightbulb,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  INV_CONVERT_TO_INCIDENT,
  INV_GOVERNED_PROMOTION,
  INV_PROMOTE_DENIED,
  INV_PROMOTE_ROLES,
  INV_PROMOTION_DISABLED_TITLE,
} from './investigation.capabilities';
import {
  InvestigationApiError,
  createInvestigationTask,
  fetchInvestigation,
  fetchInvestigationItems,
  fetchInvestigationTasks,
  pinInvestigationItem,
  previewInvestigationPromotion,
  promoteInvestigationToIncident,
  unpinInvestigationItem,
  updateInvestigation,
  updateInvestigationTask,
} from './investigation.service';
import type {
  InvestigationDetail,
  InvestigationItemType,
  InvestigationPromotionPreview,
  InvestigationSessionItem,
  InvestigationSessionTask,
  InvestigationStatus,
  InvestigationTaskStatus,
} from './investigation.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';

import './InvestigationDetailPage.css';

type DetailTab = 'artifacts' | 'workspace' | 'activity' | 'tasks' | 'knowledge';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const ITEM_LABELS: Record<InvestigationItemType, string> = {
  LOG_EVENT: 'Event',
  ALERT: 'Alert',
  ENTITY: 'Entity',
  FINDING: 'Finding',
  NOTE: 'Note',
};

const PIN_TYPE_OPTIONS: InvestigationItemType[] = ['NOTE', 'ALERT', 'LOG_EVENT', 'ENTITY', 'FINDING'];

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeSnapshot(item: InvestigationSessionItem): Array<[string, string]> {
  if (!item.itemSnapshot) return [];
  try {
    const parsed = JSON.parse(item.itemSnapshot) as Record<string, unknown>;
    return Object.entries(parsed)
      .slice(0, 6)
      .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
  } catch {
    return [['snapshot', item.itemSnapshot.slice(0, 240)]];
  }
}

function isSafeTicketUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function nextTaskStatus(status: InvestigationTaskStatus): InvestigationTaskStatus {
  return status === 'OPEN' ? 'DONE' : 'OPEN';
}

function promoteErrorMessage(error: unknown): string {
  if (error instanceof InvestigationApiError && error.status === 403) {
    return INV_PROMOTE_DENIED;
  }
  if (error instanceof Error) return error.message;
  return 'Promotion failed';
}

export function InvestigationDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const investigationId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const epsStream = useEpsStream();
  const hasAnyRole = useAuthStore((state) => state.hasAnyRole);
  const canPromoteRole = hasAnyRole([...INV_PROMOTE_ROLES]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as DetailTab | null;
  const activeTab: DetailTab =
    requestedTab && ['artifacts', 'workspace', 'activity', 'tasks', 'knowledge'].includes(requestedTab)
      ? requestedTab
      : 'artifacts';
  const [artifactType, setArtifactType] = useState<InvestigationItemType | 'ALL'>('ALL');
  const [pinType, setPinType] = useState<InvestigationItemType>('NOTE');
  const [pinRef, setPinRef] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTicketUrl, setTaskTicketUrl] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [promoteReason, setPromoteReason] = useState('');
  const [promotionPreview, setPromotionPreview] = useState<InvestigationPromotionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['investigation-session', investigationId],
    queryFn: ({ signal }) => fetchInvestigation(investigationId, signal),
    enabled: Number.isFinite(investigationId),
    staleTime: 15_000,
  });
  const itemsQuery = useQuery({
    queryKey: ['investigation-session-items', investigationId],
    queryFn: ({ signal }) => fetchInvestigationItems(investigationId, signal),
    enabled: Number.isFinite(investigationId),
    staleTime: 10_000,
  });
  const tasksQuery = useQuery({
    queryKey: ['investigation-session-tasks', investigationId],
    queryFn: ({ signal }) => fetchInvestigationTasks(investigationId, signal),
    enabled: Number.isFinite(investigationId),
    staleTime: 10_000,
  });

  const statusMutation = useMutation({
    mutationFn: (status: InvestigationStatus) => updateInvestigation(investigationId, { status }),
    onSuccess: (updated) =>
      queryClient.setQueryData(['investigation-session', investigationId], (current: InvestigationDetail | undefined) =>
        current ? { ...current, ...updated } : current,
      ),
  });
  const pinMutation = useMutation({
    mutationFn: () => {
      const isNote = pinType === 'NOTE';
      const ref = isNote ? (pinRef.trim() || `note-${Date.now()}`) : pinRef.trim();
      if (!ref) throw new Error('Reference is required for this artifact type');
      return pinInvestigationItem(investigationId, {
        itemType: pinType,
        itemRef: ref,
        note: pinNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      setPinRef('');
      setPinNote('');
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-items', investigationId] });
      void queryClient.invalidateQueries({ queryKey: ['investigation-session', investigationId] });
    },
  });
  const unpinMutation = useMutation({
    mutationFn: (itemId: number) => unpinInvestigationItem(investigationId, itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-items', investigationId] });
      void queryClient.invalidateQueries({ queryKey: ['investigation-session', investigationId] });
    },
  });
  const noteMutation = useMutation({
    mutationFn: () =>
      pinInvestigationItem(investigationId, {
        itemType: 'NOTE',
        itemRef: `note-${Date.now()}`,
        note: noteText.trim(),
      }),
    onSuccess: () => {
      setNoteText('');
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-items', investigationId] });
      void queryClient.invalidateQueries({ queryKey: ['investigation-session', investigationId] });
    },
  });
  const createTaskMutation = useMutation({
    mutationFn: () =>
      createInvestigationTask(investigationId, {
        title: taskTitle.trim(),
        externalTicketUrl: taskTicketUrl.trim() || null,
      }),
    onSuccess: () => {
      setTaskTitle('');
      setTaskTicketUrl('');
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-tasks', investigationId] });
    },
  });
  const toggleTaskMutation = useMutation({
    mutationFn: (task: InvestigationSessionTask) =>
      updateInvestigationTask(investigationId, task.id, task, {
        status: nextTaskStatus(task.status),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-tasks', investigationId] });
    },
  });
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!promotionPreview) throw new Error('Request a promotion preview before committing');
      if (!promoteReason.trim()) throw new Error('A promotion reason is required');
      return promoteInvestigationToIncident(investigationId, {
        previewToken: promotionPreview.previewToken,
        expectedVersion: promotionPreview.sessionVersion,
        reason: promoteReason.trim(),
      });
    },
    onSuccess: ({ incidentId }) => {
      setConvertOpen(false);
      setPromotionPreview(null);
      setPromoteReason('');
      navigate(`/incidents/${incidentId}`);
    },
  });

  const openPromotion = async () => {
    setConvertOpen(true);
    setPreviewError(null);
    setPromotionPreview(null);
    setPromoteReason('');
    try {
      const preview = await previewInvestigationPromotion(investigationId);
      setPromotionPreview(preview);
    } catch (error) {
      setPreviewError(promoteErrorMessage(error));
    }
  };

  const investigation = detailQuery.data;
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const taskDoneCount = useMemo(() => tasks.filter((task) => task.status === 'DONE').length, [tasks]);
  const filteredItems = artifactType === 'ALL' ? items : items.filter((item) => item.itemType === artifactType);
  const groupedCount = useMemo(
    () =>
      items.reduce<Record<string, number>>(
        (counts, item) => ({ ...counts, [item.itemType]: (counts[item.itemType] ?? 0) + 1 }),
        {},
      ),
    [items],
  );

  if (!Number.isFinite(investigationId)) {
    return (
      <ErrorState
        title="Invalid investigation reference"
        message="Open the investigation from the authorized session list."
      />
    );
  }
  if (detailQuery.isLoading) {
    return (
      <div className="investigation-detail-loading" aria-busy="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
    );
  }
  if (detailQuery.isError || !investigation) {
    return (
      <ErrorState
        title="Investigation unavailable"
        message="The session may not exist or is outside your authorized scope."
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const promoteAllowed =
    investigation.status === 'ACTIVE' &&
    !investigation.incidentId &&
    canPromoteRole &&
    (fixtureMode ? investigation.permissions?.convert === true : INV_GOVERNED_PROMOTION);
  const promoteBlockedTitle = promoteAllowed
    ? 'Review governed incident promotion'
    : !canPromoteRole
      ? INV_PROMOTE_DENIED
      : !fixtureMode && !INV_GOVERNED_PROMOTION
        ? INV_PROMOTION_DISABLED_TITLE
        : 'Governed promotion is not available for this session';

  const tabItems: Array<{ id: DetailTab; label: string; icon: JSX.Element; count?: number }> = [
    { id: 'artifacts', label: 'Evidence', icon: <FileCheck2 size={14} />, count: items.length },
    { id: 'workspace', label: 'Narrative', icon: <Workflow size={14} /> },
    { id: 'activity', label: 'Notes', icon: <History size={14} />, count: items.filter((i) => i.itemType === 'NOTE').length },
    { id: 'tasks', label: 'Tasks', icon: <ClipboardCheck size={14} />, count: tasks.length },
    { id: 'knowledge', label: 'Outcome', icon: <Lightbulb size={14} /> },
  ];

  return (
    <section className="investigation-detail-page" aria-label="Investigation workspace">
      <header className="investigation-detail-header">
        <button
          type="button"
          className="investigation-detail-back"
          onClick={() => navigate('/investigations')}
          aria-label="Back to investigations"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="investigation-detail-header__icon">
          <FlaskConical size={19} />
        </span>
        <div className="investigation-detail-header__identity">
          <small>Working investigation</small>
          <h1>{investigation.sessionName}</h1>
          <span>INV-{investigation.id}</span>
        </div>
        <div className="investigation-detail-header__actions">
          <Link to={`/search?investigationId=${investigation.id}`}>
            <Search size={14} /> Hunt telemetry
          </Link>
          {investigation.incidentId ? (
            <Link className="investigation-detail-primary" to={`/incidents/${investigation.incidentId}`}>
              <ShieldAlert size={14} /> Open INC-{investigation.incidentId}
            </Link>
          ) : (
            <button
              type="button"
              className="investigation-detail-primary"
              disabled={!promoteAllowed}
              title={promoteBlockedTitle}
              onClick={() => void openPromotion()}
            >
              <ShieldAlert size={14} /> Promote to incident
            </button>
          )}
        </div>
      </header>

      <p className="investigation-detail-meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/search">Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        <span aria-hidden="true">·</span>
        <Link to="/investigations">All sessions</Link>
        {!canPromoteRole && !investigation.incidentId && (
          <>
            <span aria-hidden="true">·</span>
            <span className="investigation-detail-meta__warn" title={INV_PROMOTE_DENIED}>
              Promote gated — {INV_PROMOTE_DENIED}
            </span>
          </>
        )}
      </p>

      {fixtureMode && (
        <div className="investigation-detail-fixture">
          <strong>Design fixture:</strong> fictional hypotheses, artifacts, and investigation activity are enabled.
          <span>Production never receives these records.</span>
        </div>
      )}
      {!fixtureMode && INV_GOVERNED_PROMOTION && !investigation.incidentId && (
        <div className="investigation-detail-fixture" role="status">
          <strong>Governed promotion:</strong> Promote uses preview + commit (`promotion-preview` / `promote`).
          Deprecated `convert-to-incident` stays disabled ({String(INV_CONVERT_TO_INCIDENT)}).
        </div>
      )}
      {!fixtureMode && !INV_GOVERNED_PROMOTION && !investigation.incidentId && (
        <div className="investigation-detail-fixture" role="status">
          <strong>Promotion unavailable:</strong> {INV_PROMOTION_DISABLED_TITLE}
          <span>Create an incident from Alerts or Incidents until the governed promotion contract ships.</span>
        </div>
      )}

      <div className="investigation-detail-layout">
        <main className="investigation-detail-main">
          <nav className="investigation-detail-tabs" role="tablist" aria-label="Investigation views">
            {tabItems.map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                key={tab.id}
                onClick={() => setSearchParams({ tab: tab.id })}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && <span>{tab.count}</span>}
              </button>
            ))}
          </nav>

          {activeTab === 'artifacts' && (
            <section className="investigation-tab-panel investigation-artifacts-tab" role="tabpanel" aria-label="Evidence">
              <header className="investigation-tab-intro">
                <div>
                  <small>PINNED EVIDENCE</small>
                  <h2>Investigation artifacts</h2>
                  <p>
                    Pin authorized events, alerts, entities, findings, or notes via the session items API. Empty means
                    nothing is pinned yet — hunt or triage elsewhere, then pin here.
                  </p>
                </div>
                <Link to={`/search?investigationId=${investigation.id}`}>
                  <Search size={14} /> Find evidence
                </Link>
              </header>

              <form
                className="investigation-pin-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (pinType === 'NOTE' || pinRef.trim()) pinMutation.mutate();
                }}
              >
                <label>
                  <span className="sr-only">Artifact type</span>
                  <select
                    value={pinType}
                    onChange={(event) => setPinType(event.target.value as InvestigationItemType)}
                    aria-label="Artifact type"
                  >
                    {PIN_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {ITEM_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={pinRef}
                  onChange={(event) => setPinRef(event.target.value)}
                  placeholder={pinType === 'NOTE' ? 'Optional note id (auto if blank)' : 'Reference id (required)'}
                  aria-label="Artifact reference"
                />
                <input
                  value={pinNote}
                  onChange={(event) => setPinNote(event.target.value)}
                  placeholder="Analyst note (optional)"
                  aria-label="Pin note"
                />
                <button type="submit" disabled={pinMutation.isPending || (pinType !== 'NOTE' && !pinRef.trim())}>
                  <Plus size={14} /> Pin
                </button>
              </form>
              {pinMutation.isError && (
                <p className="investigation-inline-error" role="alert">
                  {pinMutation.error instanceof InvestigationApiError && pinMutation.error.status === 403
                    ? `Required permission: Analyst or higher to pin (or session owner).`
                    : pinMutation.error instanceof Error
                      ? pinMutation.error.message
                      : 'Pin failed'}
                </p>
              )}

              <div className="investigation-artifact-filters">
                <button type="button" data-active={artifactType === 'ALL'} onClick={() => setArtifactType('ALL')}>
                  All <span>{items.length}</span>
                </button>
                {(Object.keys(ITEM_LABELS) as InvestigationItemType[]).map((type) => (
                  <button
                    type="button"
                    key={type}
                    data-active={artifactType === type}
                    onClick={() => setArtifactType(type)}
                  >
                    {ITEM_LABELS[type]} <span>{groupedCount[type] ?? 0}</span>
                  </button>
                ))}
              </div>

              {itemsQuery.isLoading ? (
                <div className="investigation-detail-loading">
                  <i />
                  <i />
                  <i />
                </div>
              ) : filteredItems.length ? (
                <div className="investigation-artifact-list">
                  {filteredItems.map((item) => (
                    <article key={item.id}>
                      <header>
                        <span data-type={item.itemType.toLowerCase()}>{ITEM_LABELS[item.itemType]}</span>
                        <code>{item.itemRef}</code>
                        <time>{formatDate(item.addedAt)}</time>
                      </header>
                      {item.note && <p>{item.note}</p>}
                      {safeSnapshot(item).length > 0 && (
                        <dl>
                          {safeSnapshot(item).map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <footer>
                        <span>{item.addedBy}</span>
                        <div className="investigation-artifact-actions">
                          {item.itemType === 'LOG_EVENT' && (
                            <Link
                              to={`/search?investigationId=${investigation.id}&eventId=${encodeURIComponent(item.itemRef)}`}
                            >
                              Open event <ExternalLink size={11} />
                            </Link>
                          )}
                          {item.itemType === 'ALERT' && (
                            <Link to={`/alerts/${encodeURIComponent(item.itemRef)}`}>
                              Open alert <ExternalLink size={11} />
                            </Link>
                          )}
                          <button
                            type="button"
                            className="investigation-unpin"
                            disabled={unpinMutation.isPending}
                            title="Unpin artifact"
                            aria-label={`Unpin ${item.itemRef}`}
                            onClick={() => unpinMutation.mutate(item.id)}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<FileSearch size={34} />}
                  title="No pinned evidence yet"
                  description="Pin authorized events, alerts, entities, findings, or analyst notes to build this investigation. Or open Search & Hunt to find telemetry first."
                  action={
                    <Link className="investigation-empty-link" to={`/search?investigationId=${investigation.id}`}>
                      Open Search &amp; Hunt
                    </Link>
                  }
                />
              )}
              {unpinMutation.isError && (
                <p className="investigation-inline-error" role="alert">
                  {unpinMutation.error instanceof InvestigationApiError && unpinMutation.error.status === 403
                    ? 'Required permission: item owner, SOC Manager, or Platform Administrator to unpin.'
                    : unpinMutation.error instanceof Error
                      ? unpinMutation.error.message
                      : 'Unpin failed'}
                </p>
              )}
            </section>
          )}

          {activeTab === 'workspace' && (
            <section className="investigation-tab-panel investigation-workspace-tab" role="tabpanel" aria-label="Narrative">
              <article className="investigation-hypothesis-hero">
                <div>
                  <small>SESSION OBJECTIVE</small>
                  <h2>{investigation.objective || investigation.description || 'Record a bounded investigation objective'}</h2>
                  <p>
                    This session stores metadata and pinned items. Structured hypothesis ledgers are not projected by the
                    current API — use notes and pinned evidence for narrative.
                  </p>
                </div>
                <div>
                  <span>Pinned</span>
                  <strong>{items.length}</strong>
                  <small>artifacts</small>
                </div>
              </article>

              <section className="investigation-workspace-grid">
                <article className="investigation-section investigation-section--wide">
                  <header>
                    <h2>
                      <BrainCircuit size={15} /> Hypothesis board
                    </h2>
                  </header>
                  {investigation.hypotheses.length ? (
                    <div className="investigation-hypothesis-list">
                      {investigation.hypotheses.slice(0, 3).map((hypothesis) => (
                        <div key={hypothesis.id}>
                          <span data-outcome={hypothesis.outcome}>{hypothesis.outcome}</span>
                          <strong>{hypothesis.statement}</strong>
                          <small>
                            {hypothesis.technique} · {hypothesis.confidence}% · {hypothesis.owner}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="investigation-capability-empty">
                      <BrainCircuit size={22} />
                      <strong>No structured hypotheses available</strong>
                      <span>The session API stores description text and pinned items only — not a hypothesis ledger.</span>
                    </div>
                  )}
                </article>
              </section>
            </section>
          )}

          {activeTab === 'activity' && (
            <section className="investigation-tab-panel investigation-activity-tab" role="tabpanel" aria-label="Notes">
              <header className="investigation-tab-intro">
                <div>
                  <small>ANALYST NOTES</small>
                  <h2>Investigation notes</h2>
                  <p>Append notes as pinned NOTE items. Chronological activity walls require a dedicated activity API.</p>
                </div>
              </header>
              <form
                className="investigation-note-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (noteText.trim()) noteMutation.mutate();
                }}
              >
                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Record an analyst observation…"
                  aria-label="Investigation note"
                  rows={3}
                />
                <button type="submit" disabled={!noteText.trim() || noteMutation.isPending}>
                  Add note
                </button>
              </form>
              {items.some((item) => item.itemType === 'NOTE') || investigation.activity.length ? (
                <ol className="investigation-activity-list">
                  {[
                    ...investigation.activity.map((item) => ({
                      id: item.id,
                      actor: item.actor,
                      summary: item.summary,
                      occurredAt: item.occurredAt,
                      kind: item.kind,
                    })),
                    ...items
                      .filter((item) => item.itemType === 'NOTE')
                      .map((item) => ({
                        id: `item-${item.id}`,
                        actor: item.addedBy,
                        summary: item.note || item.itemRef,
                        occurredAt: item.addedAt,
                        kind: 'note' as const,
                      })),
                  ]
                    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
                    .map((entry) => (
                      <li key={entry.id}>
                        <i>
                          <Activity size={13} />
                        </i>
                        <div>
                          <header>
                            <strong>{entry.actor}</strong>
                            <span>{entry.kind}</span>
                            <time>{formatDate(entry.occurredAt)}</time>
                          </header>
                          <p>{entry.summary}</p>
                        </div>
                      </li>
                    ))}
                </ol>
              ) : (
                <EmptyState
                  icon={<History size={34} />}
                  title="No notes yet"
                  description="Add an analyst note to begin the auditable investigation record."
                />
              )}
            </section>
          )}

          {activeTab === 'tasks' && (
            <section className="investigation-tab-panel investigation-workspace-tab" role="tabpanel" aria-label="Tasks">
              <header className="investigation-tab-intro">
                <div>
                  <small>CASE TASKS</small>
                  <h2>Investigation tasks</h2>
                  <p>
                    {taskDoneCount}/{tasks.length} complete · optional external ticket URL
                  </p>
                </div>
              </header>
              <form
                className="investigation-task-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (taskTitle.trim()) createTaskMutation.mutate();
                }}
              >
                <input
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Add a case task…"
                  aria-label="Case task title"
                />
                <input
                  value={taskTicketUrl}
                  onChange={(event) => setTaskTicketUrl(event.target.value)}
                  placeholder="External ticket URL (optional)"
                  aria-label="External ticket URL"
                />
                <button type="submit" disabled={!taskTitle.trim() || createTaskMutation.isPending}>
                  <Plus size={14} /> Add
                </button>
              </form>
              {tasksQuery.isLoading ? (
                <div className="investigation-detail-loading">
                  <i />
                  <i />
                </div>
              ) : tasksQuery.isError ? (
                <EmptyState
                  icon={<ClipboardCheck size={34} />}
                  title="Tasks unavailable"
                  description="The session tasks projection failed. Evidence and promote remain usable."
                />
              ) : tasks.length ? (
                <ul className="investigation-task-list">
                  {tasks.map((task) => (
                    <li key={task.id} data-status={task.status.toLowerCase()}>
                      <button
                        type="button"
                        className="investigation-task-toggle"
                        aria-label={
                          task.status === 'DONE' ? `Reopen task ${task.title}` : `Complete task ${task.title}`
                        }
                        disabled={toggleTaskMutation.isPending || task.status === 'CANCELLED'}
                        onClick={() => toggleTaskMutation.mutate(task)}
                      >
                        {task.status === 'DONE' ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
                      </button>
                      <div>
                        <strong data-done={task.status === 'DONE'}>{task.title}</strong>
                        <small>
                          {task.status}
                          {task.assignee ? ` · ${task.assignee}` : ''}
                        </small>
                      </div>
                      {isSafeTicketUrl(task.externalTicketUrl) ? (
                        <a href={task.externalTicketUrl} target="_blank" rel="noopener noreferrer">
                          Ticket <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="investigation-task-no-ticket">No ticket</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="investigation-capability-empty">
                  <CheckCircle2 size={20} />
                  <span>No case tasks yet. Add a task and optionally link an external ticket.</span>
                </div>
              )}
            </section>
          )}

          {activeTab === 'knowledge' && (
            <section className="investigation-tab-panel investigation-knowledge-tab" role="tabpanel" aria-label="Outcome">
              <header className="investigation-tab-intro">
                <div>
                  <small>SESSION OUTCOME</small>
                  <h2>Close or promote</h2>
                  <p>
                    Knowledge artifacts (detections, coverage gaps) are not stored on the session API yet. Promote when
                    response ownership is required, or close the session when the hypothesis is resolved without an
                    incident.
                  </p>
                </div>
              </header>
              <article className="investigation-conclusion">
                <span>Conclusion</span>
                <h3>{investigation.conclusion || 'No authoritative conclusion recorded'}</h3>
                <p>
                  {investigation.conclusion
                    ? 'This outcome is preserved with the investigation context.'
                    : 'Pin confirming evidence, then promote to an owned incident — or close the session without promotion.'}
                </p>
              </article>
              {investigation.artifactsProduced.length > 0 ? (
                <div className="investigation-knowledge-grid">
                  {investigation.artifactsProduced.map((artifact) => (
                    <article key={artifact.label}>
                      <span data-status={artifact.status}>{artifact.status}</span>
                      <strong>{artifact.label}</strong>
                      <small>{artifact.type.replace('_', ' ')}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="investigation-capability-empty">
                  <Lightbulb size={22} />
                  <strong>No knowledge artifacts projected</strong>
                  <span>Use Detection Engineering separately if a rule draft is required.</span>
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="investigation-control-rail" aria-label="Investigation controls">
          <section>
            <header>
              <h2>
                <CircleDot size={14} /> Session control
              </h2>
            </header>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  <select
                    aria-label="Investigation status"
                    value={investigation.status}
                    onChange={(event) => statusMutation.mutate(event.target.value as InvestigationStatus)}
                    disabled={investigation.status === 'CONVERTED'}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="CLOSED">Closed</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="CONVERTED" disabled>
                      Promoted
                    </option>
                  </select>
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>
                  <UserRound size={12} /> {investigation.assignedTo || 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>
                  <Clock3 size={12} /> {formatDate(investigation.updatedAt)}
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  <FileCheck2 size={12} /> {items.length}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <header>
              <h2>
                <Search size={14} /> Operational pivots
              </h2>
            </header>
            <div className="investigation-control-actions">
              <Link to={`/search?investigationId=${investigation.id}`}>
                <Search size={14} />
                <span>
                  Hunt scoped telemetry
                  <small>Search &amp; Hunt</small>
                </span>
              </Link>
              <Link to="/alerts">
                <ShieldAlert size={14} />
                <span>
                  Alerts inventory
                  <small>Pin alert refs here</small>
                </span>
              </Link>
              <Link to="/incidents">
                <ArrowRight size={14} />
                <span>
                  Owned incidents
                  <small>Post-promote cases</small>
                </span>
              </Link>
              <button type="button" onClick={() => setSearchParams({ tab: 'activity' })}>
                <Plus size={14} />
                <span>
                  Add analyst note
                  <small>Append-only NOTE item</small>
                </span>
              </button>
            </div>
          </section>

          <section className="investigation-readiness">
            <header>
              <h2>
                <ShieldAlert size={14} /> Promotion readiness
              </h2>
            </header>
            <ul>
              <li data-ready={Boolean(investigation.description)}>
                <CheckCircle2 size={12} /> Objective recorded
              </li>
              <li data-ready={items.length > 0}>
                <CheckCircle2 size={12} /> Preserved artifacts
              </li>
              <li data-ready={Boolean(investigation.assignedTo)}>
                <CheckCircle2 size={12} /> Assigned owner
              </li>
              <li data-ready={canPromoteRole}>
                <CheckCircle2 size={12} /> Promote entitlement
              </li>
            </ul>
            <button
              type="button"
              className="investigation-promote"
              disabled={!promoteAllowed}
              title={promoteBlockedTitle}
              onClick={() => void openPromotion()}
            >
              <ShieldAlert size={14} /> Promote to incident
            </button>
          </section>
        </aside>
      </div>

      <footer className="investigation-detail-dock" aria-label="Investigation status">
        <span>
          <i /> Session loaded
        </span>
        <span>{fixtureMode ? 'Stable design fixture' : 'Current backend snapshot'}</span>
        <span>
          {items.length} pinned artifacts · INV-{investigation.id}
        </span>
      </footer>
      <StatusDock
        sseConnected={epsStream.connected}
        eps={epsStream.eps}
        mode={fixtureMode ? 'historical' : 'live'}
        lastUpdated={new Date(investigation.updatedAt)}
      />

      {convertOpen && (
        <div className="investigation-promote-modal" role="dialog" aria-modal="true" aria-label="Promote investigation to incident">
          <div className="investigation-promote-modal__panel">
            <header>
              <h2>Promote investigation to incident</h2>
              <button
                type="button"
                onClick={() => {
                  if (!convertMutation.isPending) {
                    setConvertOpen(false);
                    setPromotionPreview(null);
                  }
                }}
                aria-label="Close promotion dialog"
              >
                <X size={14} /> Close
              </button>
            </header>
            <p className="investigation-promote-modal__hint">
              Governed INV-012 path: preview → confirm with reason. Deprecated convert-to-incident is not used.
            </p>
            {previewError && <p role="alert">{previewError}</p>}
            {!previewError && !promotionPreview && <p>Loading promotion preview…</p>}
            {promotionPreview && (
              <>
                <dl>
                  <div>
                    <dt>Title</dt>
                    <dd>{promotionPreview.incidentSummary.title}</dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>
                      {promotionPreview.incidentSummary.recommendedPriority} · severity{' '}
                      {promotionPreview.incidentSummary.recommendedSeverity}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      {promotionPreview.eligibleEvidence.totalArtifacts} artifacts (
                      {promotionPreview.eligibleEvidence.alertCount} alerts)
                    </dd>
                  </div>
                  <div>
                    <dt>Reasons</dt>
                    <dd>{promotionPreview.incidentSummary.severityReasons.join('; ')}</dd>
                  </div>
                  {promotionPreview.missingPrerequisites.length > 0 && (
                    <div>
                      <dt>Missing</dt>
                      <dd>{promotionPreview.missingPrerequisites.join('; ')}</dd>
                    </div>
                  )}
                </dl>
                {promotionPreview.warnings.length > 0 && (
                  <ul>
                    {promotionPreview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <label>
                  Promotion reason
                  <textarea
                    value={promoteReason}
                    onChange={(event) => setPromoteReason(event.target.value)}
                    rows={3}
                    placeholder="Why is this investigation becoming an owned incident?"
                    disabled={convertMutation.isPending}
                  />
                </label>
                {convertMutation.isError && (
                  <p role="alert">{promoteErrorMessage(convertMutation.error)}</p>
                )}
                <footer>
                  <button
                    type="button"
                    disabled={convertMutation.isPending}
                    onClick={() => {
                      setConvertOpen(false);
                      setPromotionPreview(null);
                    }}
                  >
                    Keep investigating
                  </button>
                  <button
                    type="button"
                    className="investigation-promote"
                    disabled={convertMutation.isPending || !promoteReason.trim()}
                    onClick={() => convertMutation.mutate()}
                  >
                    {convertMutation.isPending ? 'Promoting…' : 'Confirm promotion'}
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
