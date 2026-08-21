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
  Database,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FlaskConical,
  History,
  Lightbulb,
  Network,
  Plus,
  Radio,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  convertInvestigationToIncident,
  fetchInvestigation,
  fetchInvestigationItems,
  pinInvestigationItem,
  updateInvestigation,
} from './investigation.service';
import type {
  InvestigationDetail,
  InvestigationItemType,
  InvestigationPhase,
  InvestigationSessionItem,
  InvestigationStatus,
} from './investigation.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';

import './InvestigationDetailPage.css';

type DetailTab = 'workspace' | 'hypotheses' | 'artifacts' | 'activity' | 'knowledge';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const PHASES: Array<{ id: InvestigationPhase; label: string; description: string }> = [
  { id: 'prepare', label: 'Prepare', description: 'Bound hypothesis' },
  { id: 'execute', label: 'Execute', description: 'Collect and query' },
  { id: 'assess', label: 'Assess', description: 'Test evidence' },
  { id: 'act', label: 'Act', description: 'Escalate outcome' },
  { id: 'knowledge', label: 'Knowledge', description: 'Compound learning' },
];

const ITEM_LABELS: Record<InvestigationItemType, string> = {
  LOG_EVENT: 'Event', ALERT: 'Alert', ENTITY: 'Entity', FINDING: 'Finding', NOTE: 'Note',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function safeSnapshot(item: InvestigationSessionItem): Array<[string, string]> {
  if (!item.itemSnapshot) return [];
  try {
    const parsed = JSON.parse(item.itemSnapshot) as Record<string, unknown>;
    return Object.entries(parsed).slice(0, 6).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
  } catch {
    return [['snapshot', item.itemSnapshot.slice(0, 240)]];
  }
}

function phaseIndex(phase: InvestigationPhase | undefined): number {
  return Math.max(0, PHASES.findIndex((item) => item.id === (phase ?? 'prepare')));
}

export function InvestigationDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const investigationId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const epsStream = useEpsStream();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as DetailTab | null;
  const activeTab: DetailTab = requestedTab && ['workspace', 'hypotheses', 'artifacts', 'activity', 'knowledge'].includes(requestedTab) ? requestedTab : 'workspace';
  const [artifactType, setArtifactType] = useState<InvestigationItemType | 'ALL'>('ALL');
  const [noteText, setNoteText] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);

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

  const statusMutation = useMutation({
    mutationFn: (status: InvestigationStatus) => updateInvestigation(investigationId, { status }),
    onSuccess: (updated) => queryClient.setQueryData(['investigation-session', investigationId], (current: InvestigationDetail | undefined) => current ? { ...current, ...updated } : current),
  });
  const noteMutation = useMutation({
    mutationFn: () => pinInvestigationItem(investigationId, { itemType: 'NOTE', itemRef: `note-${Date.now()}`, note: noteText.trim() }),
    onSuccess: () => {
      setNoteText('');
      void queryClient.invalidateQueries({ queryKey: ['investigation-session-items', investigationId] });
      void queryClient.invalidateQueries({ queryKey: ['investigation-session', investigationId] });
    },
  });
  const convertMutation = useMutation({
    mutationFn: () => convertInvestigationToIncident(investigationId),
    onSuccess: ({ incidentId }) => navigate(`/incidents/${incidentId}`),
  });

  const investigation = detailQuery.data;
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const filteredItems = artifactType === 'ALL' ? items : items.filter((item) => item.itemType === artifactType);
  const groupedCount = useMemo(() => items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.itemType]: (counts[item.itemType] ?? 0) + 1 }), {}), [items]);

  if (!Number.isFinite(investigationId)) return <ErrorState title="Invalid investigation reference" message="Open the investigation from the authorized session queue." />;
  if (detailQuery.isLoading) return <div className="investigation-detail-loading" aria-busy="true">{Array.from({ length: 9 }).map((_, index) => <i key={index} />)}</div>;
  if (detailQuery.isError || !investigation) return <ErrorState title="Investigation unavailable" message="The session may not exist or is outside your authorized scope." onRetry={() => void detailQuery.refetch()} />;

  const currentPhaseIndex = phaseIndex(investigation.phase);
  const canConvert = investigation.status === 'ACTIVE' && !investigation.incidentId && investigation.permissions?.convert === true;
  const tabItems: Array<{ id: DetailTab; label: string; icon: JSX.Element; count?: number }> = [
    { id: 'workspace', label: 'Workspace', icon: <Workflow size={14} /> },
    { id: 'hypotheses', label: 'Hypotheses', icon: <BrainCircuit size={14} />, count: investigation.hypotheses.length },
    { id: 'artifacts', label: 'Artifacts', icon: <FileCheck2 size={14} />, count: items.length },
    { id: 'activity', label: 'Activity', icon: <History size={14} />, count: investigation.activity.length },
    { id: 'knowledge', label: 'Knowledge', icon: <Lightbulb size={14} />, count: investigation.artifactsProduced.length },
  ];

  return (
    <section className="investigation-detail-page" aria-label="Investigation workspace">
      <header className="investigation-detail-header">
        <button type="button" className="investigation-detail-back" onClick={() => navigate('/investigations')} aria-label="Back to investigations"><ArrowLeft size={17} /></button>
        <span className="investigation-detail-header__icon"><FlaskConical size={19} /></span>
        <div className="investigation-detail-header__identity"><small>INVESTIGATION SESSION</small><h1>{investigation.sessionName}</h1><span>INV-{investigation.id}</span></div>
        <div className="investigation-detail-header__actions">
          <Link to={`/search?investigationId=${investigation.id}`}><Search size={14} /> Hunt telemetry</Link>
          {investigation.incidentId ? <Link className="investigation-detail-primary" to={`/incidents/${investigation.incidentId}`}><ShieldAlert size={14} /> Open INC-{investigation.incidentId}</Link> : <button type="button" className="investigation-detail-primary" disabled={!canConvert} title={canConvert ? 'Review incident promotion' : 'Governed promotion capability is not available for this session'} onClick={() => setConvertOpen(true)}><ShieldAlert size={14} /> Promote to incident</button>}
        </div>
      </header>

      {fixtureMode && <div className="investigation-detail-fixture"><strong>Design fixture:</strong> fictional hypotheses, artifacts, and investigation activity are enabled.<span>Production never receives these records.</span></div>}

      <nav className="investigation-phase-rail" aria-label="Investigation lifecycle">
        <span>INVESTIGATION PATH</span>
        {PHASES.map((phase, index) => <button type="button" key={phase.id} data-state={index < currentPhaseIndex ? 'complete' : index === currentPhaseIndex ? 'active' : 'pending'} disabled={!fixtureMode} title={fixtureMode ? `Move to ${phase.label}` : 'Phase transitions require the authoritative investigation workflow contract'}><i>{index < currentPhaseIndex ? <CheckCircle2 size={13} /> : index + 1}</i><strong>{phase.label}</strong><small>{phase.description}</small></button>)}
      </nav>

      <div className="investigation-detail-layout">
        <main className="investigation-detail-main">
          <nav className="investigation-detail-tabs" role="tablist" aria-label="Investigation views">
            {tabItems.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setSearchParams({ tab: tab.id })}>{tab.icon}{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}
          </nav>

          {activeTab === 'workspace' && <section className="investigation-tab-panel investigation-workspace-tab" role="tabpanel" aria-label="Workspace">
            <article className="investigation-hypothesis-hero">
              <div><small>PRIMARY HYPOTHESIS</small><h2>{investigation.hypothesis || 'Define a specific, testable and bounded hypothesis'}</h2><p>{investigation.objective || investigation.description || 'Record the analyst objective before collecting evidence.'}</p></div>
              <div><span>Confidence</span><strong>{investigation.confidence ?? '—'}{investigation.confidence !== undefined && '%'}</strong><small>{investigation.confidence !== undefined ? 'analyst assessment' : 'not projected'}</small></div>
            </article>

            <section className="investigation-workspace-grid">
              <article className="investigation-section investigation-section--wide"><header><h2><BrainCircuit size={15} /> Hypothesis board</h2><button type="button" onClick={() => setSearchParams({ tab: 'hypotheses' })}>Review all <ArrowRight size={13} /></button></header>{investigation.hypotheses.length ? <div className="investigation-hypothesis-list">{investigation.hypotheses.slice(0, 3).map((hypothesis) => <div key={hypothesis.id}><span data-outcome={hypothesis.outcome}>{hypothesis.outcome}</span><strong>{hypothesis.statement}</strong><small>{hypothesis.technique} · {hypothesis.confidence}% confidence · {hypothesis.owner}</small></div>)}</div> : <div className="investigation-capability-empty"><BrainCircuit size={22} /><strong>No structured hypotheses available</strong><span>The current backend stores only session metadata and pinned items.</span></div>}</article>

              <article className="investigation-section"><header><h2><Target size={15} /> Investigation scope</h2></header><dl className="investigation-scope-metrics"><div><dt>Entities</dt><dd>{investigation.entityCount ?? '—'}</dd></div><div><dt>Alerts</dt><dd>{investigation.alertCount ?? '—'}</dd></div><div><dt>Events</dt><dd>{investigation.eventCount ?? items.length}</dd></div><div><dt>Artifacts</dt><dd>{items.length}</dd></div></dl><div className="investigation-tag-list">{investigation.dataSources.length ? investigation.dataSources.map((source) => <span key={source}><Database size={11} />{source}</span>) : <span>Data-source projection unavailable</span>}</div></article>

              <article className="investigation-section"><header><h2><Network size={15} /> ATT&amp;CK coverage</h2></header><div className="investigation-techniques">{investigation.techniques.length ? investigation.techniques.map((technique) => <span key={technique}>{technique}</span>) : <div className="investigation-capability-empty"><span>Technique mapping is not projected by the current session API.</span></div>}</div></article>

              <article className="investigation-section investigation-section--wide"><header><h2><ClipboardCheck size={15} /> Next analyst decisions</h2><span>{investigation.taskCompleted ?? 0}/{investigation.taskTotal ?? investigation.nextActions.length} complete</span></header>{investigation.nextActions.length ? <ol className="investigation-next-actions">{investigation.nextActions.map((action, index) => <li key={action}><i>{index + 1}</i><span>{action}</span><button type="button" aria-label={`Open action ${action}`}><ArrowRight size={13} /></button></li>)}</ol> : <div className="investigation-capability-empty"><CheckCircle2 size={20} /><span>No outstanding fixture actions. Confirm the conclusion and preserve a knowledge artifact.</span></div>}</article>
            </section>
          </section>}

          {activeTab === 'hypotheses' && <section className="investigation-tab-panel investigation-hypotheses-tab" role="tabpanel" aria-label="Hypotheses"><header className="investigation-tab-intro"><div><small>TESTABLE CLAIMS</small><h2>Hypothesis ledger</h2><p>Record confirming and denying evidence. Unknown outcomes stay open; confirmed malicious findings should be promoted immediately.</p></div><button type="button" disabled={!fixtureMode}><Plus size={14} /> Add hypothesis</button></header>{investigation.hypotheses.length ? <div className="investigation-hypothesis-cards">{investigation.hypotheses.map((hypothesis) => <article key={hypothesis.id}><header><span data-outcome={hypothesis.outcome}>{hypothesis.outcome}</span><strong>{hypothesis.confidence}%</strong></header><h3>{hypothesis.statement}</h3><small>{hypothesis.technique} · {hypothesis.owner} · updated {formatDate(hypothesis.updatedAt)}</small><div className="investigation-evidence-sides"><div><strong>Confirming</strong>{hypothesis.confirmingEvidence.length ? hypothesis.confirmingEvidence.map((value) => <span key={value}><CheckCircle2 size={12} />{value}</span>) : <span>No confirming evidence</span>}</div><div><strong>Denying</strong>{hypothesis.denyingEvidence.length ? hypothesis.denyingEvidence.map((value) => <span key={value}><X size={12} />{value}</span>) : <span>No denying evidence</span>}</div></div></article>)}</div> : <EmptyState icon={<BrainCircuit size={34} />} title="Structured hypotheses require backend support" description="The session API currently stores only a free-text description. The timestamped backend register defines the required hypothesis ledger." />}</section>}

          {activeTab === 'artifacts' && <section className="investigation-tab-panel investigation-artifacts-tab" role="tabpanel" aria-label="Artifacts"><header className="investigation-tab-intro"><div><small>PRESERVED CONTEXT</small><h2>Investigation artifacts</h2><p>Pinned references remain bounded snapshots. Open raw telemetry through a permission-aware pivot.</p></div><Link to={`/search?investigationId=${investigation.id}`}><Search size={14} /> Find evidence</Link></header><div className="investigation-artifact-filters"><button type="button" data-active={artifactType === 'ALL'} onClick={() => setArtifactType('ALL')}>All <span>{items.length}</span></button>{(Object.keys(ITEM_LABELS) as InvestigationItemType[]).map((type) => <button type="button" key={type} data-active={artifactType === type} onClick={() => setArtifactType(type)}>{ITEM_LABELS[type]} <span>{groupedCount[type] ?? 0}</span></button>)}</div>{itemsQuery.isLoading ? <div className="investigation-detail-loading"><i /><i /><i /></div> : filteredItems.length ? <div className="investigation-artifact-list">{filteredItems.map((item) => <article key={item.id}><header><span data-type={item.itemType.toLowerCase()}>{ITEM_LABELS[item.itemType]}</span><code>{item.itemRef}</code><time>{formatDate(item.addedAt)}</time></header>{item.note && <p>{item.note}</p>}{safeSnapshot(item).length > 0 && <dl>{safeSnapshot(item).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}<footer><span>{item.addedBy}</span>{item.itemType === 'LOG_EVENT' && <Link to={`/search?investigationId=${investigation.id}&eventId=${encodeURIComponent(item.itemRef)}`}>Open event <ExternalLink size={11} /></Link>}</footer></article>)}</div> : <EmptyState icon={<FileSearch size={34} />} title="No artifacts in this view" description="Pin authorized events, alerts, entities, findings, or analyst notes to preserve investigation context." />}</section>}

          {activeTab === 'activity' && <section className="investigation-tab-panel investigation-activity-tab" role="tabpanel" aria-label="Activity"><header className="investigation-tab-intro"><div><small>CASE WALL</small><h2>Investigation activity</h2><p>Chronological analyst, automation, query, evidence, and lifecycle activity.</p></div></header><form className="investigation-note-composer" onSubmit={(event) => { event.preventDefault(); if (noteText.trim()) noteMutation.mutate(); }}><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Record an analyst observation…" aria-label="Investigation note" rows={3} /><button type="submit" disabled={!noteText.trim() || noteMutation.isPending}>Add note</button></form>{investigation.activity.length || items.some((item) => item.itemType === 'NOTE') ? <ol className="investigation-activity-list">{[...investigation.activity.map((item) => ({ id: item.id, actor: item.actor, summary: item.summary, occurredAt: item.occurredAt, kind: item.kind })), ...items.filter((item) => item.itemType === 'NOTE').map((item) => ({ id: `item-${item.id}`, actor: item.addedBy, summary: item.note || item.itemRef, occurredAt: item.addedAt, kind: 'note' as const }))].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((entry) => <li key={entry.id}><i><Activity size={13} /></i><div><header><strong>{entry.actor}</strong><span>{entry.kind}</span><time>{formatDate(entry.occurredAt)}</time></header><p>{entry.summary}</p></div></li>)}</ol> : <EmptyState icon={<History size={34} />} title="No activity projected" description="Add an analyst note to begin the auditable investigation record." />}</section>}

          {activeTab === 'knowledge' && <section className="investigation-tab-panel investigation-knowledge-tab" role="tabpanel" aria-label="Knowledge"><header className="investigation-tab-intro"><div><small>COMPOUND RETURN</small><h2>Knowledge outcomes</h2><p>Every investigation should yield a detection, a coverage gap, or a documented negative result.</p></div></header><article className="investigation-conclusion"><span>Conclusion</span><h3>{investigation.conclusion || 'No authoritative conclusion recorded'}</h3><p>{investigation.conclusion ? 'This outcome is preserved with the investigation context.' : 'Complete the hypothesis assessment before closing this session.'}</p></article><div className="investigation-knowledge-grid">{investigation.artifactsProduced.map((artifact) => <article key={artifact.label}><span data-status={artifact.status}>{artifact.status}</span><strong>{artifact.label}</strong><small>{artifact.type.replace('_', ' ')}</small>{artifact.type === 'detection' && <Link to={`/detection-rules/new?investigationId=${investigation.id}`}>Open rule draft <ArrowRight size={12} /></Link>}</article>)}<button type="button" disabled={!fixtureMode}><Plus size={16} /><strong>Create knowledge artifact</strong><span>Detection, coverage gap, or negative result</span></button></div></section>}
        </main>

        <aside className="investigation-control-rail" aria-label="Investigation controls">
          <section><header><h2><CircleDot size={14} /> Session control</h2></header><dl><div><dt>Status</dt><dd><select aria-label="Investigation status" value={investigation.status} onChange={(event) => statusMutation.mutate(event.target.value as InvestigationStatus)} disabled={investigation.status === 'CONVERTED'}><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option><option value="CONVERTED" disabled>Converted</option></select></dd></div><div><dt>Owner</dt><dd><UserRound size={12} /> {investigation.assignedTo || 'Unassigned'}</dd></div><div><dt>Updated</dt><dd><Clock3 size={12} /> {formatDate(investigation.updatedAt)}</dd></div><div><dt>Artifacts</dt><dd><FileCheck2 size={12} /> {items.length}</dd></div></dl></section>
          <section className="investigation-ai-card"><header><h2><Sparkles size={14} /> Hive Intelligence</h2><span>Review required</span></header><p>Propose alternative hypotheses, summarize cited evidence, and identify missing telemetry without making autonomous decisions.</p><button type="button" disabled={!fixtureMode}><BrainCircuit size={14} /> Generate alternatives</button><button type="button" disabled={!fixtureMode}><FileSearch size={14} /> Summarize evidence</button></section>
          <section><header><h2><Radio size={14} /> Operational pivots</h2></header><div className="investigation-control-actions"><Link to={`/search?investigationId=${investigation.id}`}><Search size={14} /><span>Hunt scoped telemetry<small>Bound to this session</small></span></Link><button type="button" onClick={() => setSearchParams({ tab: 'activity' })}><Plus size={14} /><span>Add analyst note<small>Append-only record</small></span></button><button type="button" onClick={() => setSearchParams({ tab: 'knowledge' })}><Lightbulb size={14} /><span>Record outcome<small>Detection or coverage gap</small></span></button></div></section>
          <section className="investigation-readiness"><header><h2><ShieldAlert size={14} /> Promotion readiness</h2></header><ul><li data-ready={Boolean(investigation.hypothesis)}><CheckCircle2 size={12} /> Bounded hypothesis</li><li data-ready={items.length > 0}><CheckCircle2 size={12} /> Preserved artifacts</li><li data-ready={(investigation.openHypothesisCount ?? 1) === 0}><CheckCircle2 size={12} /> Hypothesis decision</li><li data-ready={Boolean(investigation.assignedTo)}><CheckCircle2 size={12} /> Assigned owner</li></ul><button type="button" className="investigation-promote" disabled={!canConvert} onClick={() => setConvertOpen(true)}><ShieldAlert size={14} /> Promote to incident</button></section>
        </aside>
      </div>

      <footer className="investigation-detail-dock" aria-label="Investigation status"><span><i /> Session loaded</span><span>{fixtureMode ? 'Stable design fixture' : 'Current backend snapshot'}</span><span>{items.length} pinned artifacts · INV-{investigation.id}</span></footer>
      <StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="live" lastUpdated={new Date(investigation.updatedAt)} />

      <HaConfirmationModal isOpen={convertOpen} title="Promote investigation to incident" message="Create a formal incident from this investigation. The current backend creates a P3 incident and links this session; review the resulting incident before response actions." confirmLabel={convertMutation.isPending ? 'Promoting…' : 'Create incident'} cancelLabel="Keep investigating" onConfirm={() => convertMutation.mutate()} onCancel={() => setConvertOpen(false)} />
    </section>
  );
}
