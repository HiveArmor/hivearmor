import { useEffect, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Crosshair,
  ExternalLink,
  FileKey2,
  GitBranch,
  Hexagon,
  Network,
  Radar,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  findingUiStatusToOffenseStatus,
} from './correlatedFindings.service';
import type {
  CorrelatedFindingDTO,
  CorrelatedFindingStatus,
  FindingEntity,
} from './correlatedFindings.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { getSeverityLabel } from '@/lib/severity';
import {
  canMutateFindingStatus,
  findingStatusBlockedTitle,
} from '@/services/findingStatus.capabilities';
import { updateOffenseStatus } from '@/services/offenses.service';
import { useAuthStore } from '@/store/auth.store';

import './FindingWorkbench.css';

type WorkbenchTab = 'story' | 'evidence' | 'relationships';

const statusLabels: Record<CorrelatedFindingStatus, string> = {
  open: 'Open', investigating: 'Investigating', incident_created: 'Incident created', resolved: 'Resolved', false_positive: 'False positive',
};

const STATUS_MUTATE_OPTIONS: Array<{ value: CorrelatedFindingStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'incident_created', label: 'Incident created' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False positive' },
];

const entityIcons: Record<FindingEntity['type'], LucideIcon> = {
  host: Boxes, user: UserRound, ip: Network, domain: Radar, process: Activity, file: FileKey2, cloud: Hexagon,
};

function relativeTime(value: string): string {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function duration(first: string, last: string): string {
  const minutes = Math.max(1, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ''}`;
}

function sourceLabel(source: CorrelatedFindingDTO['narrative']['source']): string {
  if (source === 'ai_assisted') return 'AI-assisted summary';
  if (source === 'analyst') return 'Analyst-authored';
  return 'Correlation-engine narrative';
}

function RelationshipMap({ finding }: { finding: CorrelatedFindingDTO }): JSX.Element {
  const nodeMap = new Map(finding.relationshipNodes.map((node) => [node.id, node]));
  return (
    <div className="finding-relationship-map">
      <svg viewBox="0 0 100 100" role="img" aria-labelledby={`relationship-map-title-${finding.id}`}>
        <title id={`relationship-map-title-${finding.id}`}>Relationship map for {finding.title}</title>
        {finding.relationshipEdges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 1}>{edge.confidence}%</text></g>;
        })}
        {finding.relationshipNodes.map((node) => {
          const points = `${node.x},${node.y - 6} ${node.x + 5.2},${node.y - 3} ${node.x + 5.2},${node.y + 3} ${node.x},${node.y + 6} ${node.x - 5.2},${node.y + 3} ${node.x - 5.2},${node.y - 3}`;
          return (
            <g key={node.id} className="finding-relationship-map__node" data-type={node.type} data-severity={node.severity ?? undefined}>
              <polygon points={points} />
              <text x={node.x} y={node.y + 0.7} className="finding-relationship-map__type">{node.type === 'finding' ? 'F' : node.type === 'alert' ? 'A' : node.type.slice(0, 1).toUpperCase()}</text>
              <text x={node.x} y={node.y + 9} className="finding-relationship-map__label">{node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="finding-relationship-map__legend"><span data-type="finding">Finding</span><span data-type="alert">Alert</span><span data-type="entity">Entity</span><em>Edge labels show correlation confidence</em></div>
    </div>
  );
}

export interface FindingWorkbenchProps {
  finding: CorrelatedFindingDTO;
  compact?: boolean;
  onPromote?: () => void;
}

export function FindingWorkbench({ finding, compact = false, onPromote }: FindingWorkbenchProps): JSX.Element {
  const [tab, setTab] = useState<WorkbenchTab>('story');
  const roles = useAuthStore((state) => state.user?.roles);
  const canMutateStatus = canMutateFindingStatus(roles);
  const statusDenyTitle = findingStatusBlockedTitle(roles);
  const addToast = useToastStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const promotion = finding.availableActions.find((action) => action.id === 'promote_incident');

  useEffect(() => setTab('story'), [finding.id]);

  const statusMutation = useMutation({
    mutationFn: (next: CorrelatedFindingStatus) =>
      updateOffenseStatus(finding.id, { status: findingUiStatusToOffenseStatus(next) }),
    onSuccess: async (_data, next) => {
      addToast({ variant: 'success', title: 'Finding status updated', description: `Status set to ${statusLabels[next]} via PUT /api/offenses/{id}/status.` });
      await queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Status update failed';
      addToast({ variant: 'danger', title: 'Status update blocked', description: message.includes('403') ? statusDenyTitle || message : message });
    },
  });

  return (
    <article className="finding-workbench" data-compact={compact} aria-labelledby={`finding-title-${finding.id}`}>
      <header className="finding-workbench__header">
        <div className="finding-workbench__identity">
          <span className="finding-workbench__hex" data-severity={finding.severity} aria-hidden="true"><GitBranch size={19} /></span>
          <div>
            <div className="finding-workbench__badges"><span data-severity={finding.severity}>{getSeverityLabel(finding.severity)}</span><span data-status={finding.status}>{statusLabels[finding.status]}</span><code>{finding.id}</code></div>
            <h2 id={`finding-title-${finding.id}`}>{finding.title}</h2>
            <p>{finding.summary}</p>
          </div>
        </div>
        <div className="finding-workbench__actions">
          <div className="finding-workbench__status" title={canMutateStatus ? 'PUT /api/offenses/{id}/status (SEC-03 allowlisted)' : statusDenyTitle}>
            <HaCompactSelect
              ariaLabel="Finding status"
              label="Status"
              value={finding.status}
              options={STATUS_MUTATE_OPTIONS}
              onChange={(value) => {
                if (!canMutateStatus || statusMutation.isPending) return;
                statusMutation.mutate(value as CorrelatedFindingStatus);
              }}
              disabled={!canMutateStatus || statusMutation.isPending}
            />
          </div>
          {finding.incident ? (
            <Link to={`/incidents/${encodeURIComponent(finding.incident.id)}`} className="finding-workbench__incident"><CheckCircle2 size={14} />{finding.incident.id}</Link>
          ) : onPromote ? (
            <button
              type="button"
              onClick={onPromote}
              disabled={!promotion?.allowed}
              title={promotion?.reason ?? 'Preview and promote this finding to an incident'}
            >
              <ShieldAlert size={14} />Promote
            </button>
          ) : null}
          <Link to="/incidents" className="finding-workbench__open" title="Incidents own case response workflow">Incidents</Link>
          {compact && <Link to={`/correlated-findings/${encodeURIComponent(finding.id)}`} className="finding-workbench__open">Full investigation <ExternalLink size={13} /></Link>}
        </div>
      </header>

      {!canMutateStatus && (
        <p className="finding-workbench__deny" role="status" title={statusDenyTitle}>
          Status changes disabled — {statusDenyTitle}
        </p>
      )}

      <section className="finding-workbench__metrics" aria-label="Finding priority and scope">
        <div data-tone={finding.riskScore !== null && finding.riskScore >= 90 ? 'critical' : finding.riskScore !== null && finding.riskScore >= 75 ? 'high' : 'normal'}><span>Risk</span><strong>{finding.riskScore ?? '—'}</strong><em>{finding.riskScore === null ? 'not projected' : '/100'}</em></div>
        <div><span>Confidence</span><strong>{finding.confidence}</strong><em>%</em></div>
        <div><span>Alerts</span><strong>{finding.alertCount}</strong><em>{finding.dataSourceCount} sources</em></div>
        <div><span>Entities</span><strong>{finding.entities.length}</strong><em>{finding.entities.filter((entity) => entity.criticality === 'critical').length} critical</em></div>
        <div><span>Activity span</span><strong>{duration(finding.firstSeen, finding.lastSeen)}</strong><em>{relativeTime(finding.lastSeen)}</em></div>
      </section>

      <nav className="finding-workbench__tabs" role="tablist" aria-label="Finding investigation views">
        {([
          ['story', BrainCircuit, 'Attack story'],
          ['evidence', Crosshair, `Evidence ${finding.signals.length}`],
          ['relationships', GitBranch, `Relationships ${finding.relationshipNodes.length}`],
        ] as const).map(([id, Icon, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={14} aria-hidden="true" />{label}</button>)}
      </nav>

      <div className="finding-workbench__body">
        {tab === 'story' && (
          <div className="finding-story" role="tabpanel" aria-label="Attack story">
            <section className="finding-story__narrative">
              <header><div><span>Assessment</span><h3>What the correlation means</h3></div><span className="finding-story__source"><Sparkles size={12} />{sourceLabel(finding.narrative.source)}</span></header>
              <p>{finding.narrative.summary}</p>
              <ul>{finding.narrative.keyJudgments.map((judgment) => <li key={judgment}><CheckCircle2 size={13} aria-hidden="true" />{judgment}</li>)}</ul>
              <footer>Generated {new Date(finding.narrative.generatedAt).toLocaleString()} · {finding.narrative.confidence}% narrative confidence · completeness {finding.dataCompleteness}</footer>
            </section>

            <section className="finding-story__reasons">
              <header><div><span>Explainability</span><h3>Why these signals are linked</h3></div><GitBranch size={15} aria-hidden="true" /></header>
              <div>{finding.correlationReasons.map((reason) => <article key={reason.id}><span><strong>{reason.strength}%</strong><em>strength</em></span><div><h4>{reason.label}</h4><p>{reason.detail}</p><small>{reason.evidenceCount.toLocaleString()} supporting observations</small></div></article>)}</div>
            </section>

            {finding.stages.length > 0 && (
              <section className="finding-story__progression">
                <header><div><span>Chronology</span><h3>Attack progression</h3></div><span>{finding.mitreTactics.length} ATT&amp;CK stages</span></header>
                <ol>{finding.stages.map((stage, index) => <li key={stage.id}><span className="finding-stage__marker">{index + 1}</span><time>{new Date(stage.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{stage.tactic}</strong><p>{stage.title}</p><code>{stage.technique ?? 'Technique pending'}</code></div>{index < finding.stages.length - 1 && <ArrowRight size={13} aria-hidden="true" />}</li>)}</ol>
              </section>
            )}

            <aside className="finding-story__scope">
              <header><div><span>Scope</span><h3>Impacted entities</h3></div><Boxes size={15} aria-hidden="true" /></header>
              {finding.entities.length === 0 ? (
                <p className="finding-story__empty">No entity projection on this offense document.</p>
              ) : (
                <div>{finding.entities.map((entity) => { const Icon = entityIcons[entity.type]; return <article key={entity.id}><span aria-hidden="true"><Icon size={14} /></span><div><strong>{entity.label}</strong><small>{entity.type} · {entity.role}</small></div><em data-risk={entity.riskScore !== null && entity.riskScore >= 85 ? 'high' : undefined}>{entity.riskScore ?? '—'}</em></article>; })}</div>
              )}
              <footer><span>{finding.tenantName}</span><span>{finding.owner?.name ?? 'Unassigned'}</span><span data-sla={finding.slaStatus}>{finding.slaStatus === 'breached' ? 'SLA breached' : finding.slaStatus === 'at_risk' ? 'SLA at risk' : 'SLA on track'}</span></footer>
            </aside>
          </div>
        )}

        {tab === 'evidence' && (
          <section className="finding-evidence" role="tabpanel" aria-label="Supporting evidence">
            <header>
              <div>
                <span>Supporting alerts</span>
                <h3>Signals contributing to this finding</h3>
                <p>Loaded from GET /api/offenses/{'{id}'}/alerts when available. Open an alert for full inventory context.</p>
              </div>
              <strong>{finding.signals.length}</strong>
            </header>
            {finding.signals.length === 0 ? (
              <div className="finding-evidence__empty" role="status">
                <AlertTriangle size={16} />
                <strong>No related alerts returned</strong>
                <p>Honest empty — the offense document has no resolvable alert ids, or GET /api/offenses/{'{id}'}/alerts returned none.</p>
                <Link to="/alerts">Open Alerts inventory</Link>
              </div>
            ) : (
              <div className="finding-evidence__table" role="table" aria-label="Correlated alerts">
                <div role="row" className="finding-evidence__head"><span role="columnheader">Detected</span><span role="columnheader">Severity</span><span role="columnheader">Alert and rule</span><span role="columnheader">Entity</span><span role="columnheader">ATT&amp;CK</span><span role="columnheader">Open</span></div>
                {finding.signals.map((signal) => (
                  <div role="row" key={signal.id}>
                    <time role="cell">{new Date(signal.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    <span role="cell" data-severity={signal.severity}>{getSeverityLabel(signal.severity)}</span>
                    <div role="cell"><strong>{signal.title}</strong><code>{signal.ruleName}</code></div>
                    <span role="cell">{signal.entityLabel}</span>
                    <span role="cell"><strong>{signal.tactic ?? '—'}</strong><code>{signal.technique ?? '—'}</code></span>
                    <Link role="cell" to={`/alerts/${encodeURIComponent(signal.alertId)}`} aria-label={`Open ${signal.title}`}><ExternalLink size={13} /></Link>
                  </div>
                ))}
              </div>
            )}
            {finding.alertCount > finding.signals.length && (
              <footer><AlertTriangle size={13} />{finding.alertCount - finding.signals.length} additional alerts are counted on the offense but were not returned in the related-alerts projection.</footer>
            )}
          </section>
        )}

        {tab === 'relationships' && (
          <section className="finding-relationships" role="tabpanel" aria-label="Correlation relationships">
            <div className="finding-relationships__canvas">
              <header><div><span>Relationship canvas</span><h3>Signals, pivots, and shared entities</h3></div><Radar size={15} /></header>
              {finding.relationshipNodes.length === 0 ? (
                <p className="finding-story__empty">No relationship projection for this offense document.</p>
              ) : (
                <RelationshipMap finding={finding} />
              )}
            </div>
            <aside className="finding-relationships__provenance">
              <header><div><span>Provenance</span><h3>Correlation controls</h3></div><ShieldAlert size={15} /></header>
              <dl>
                <div><dt>Engine</dt><dd>{finding.correlationEngine.version}</dd></div>
                <div><dt>Evaluated</dt><dd>{new Date(finding.correlationEngine.evaluatedAt).toLocaleString()}</dd></div>
                <div><dt>Rules</dt><dd>{finding.correlationEngine.ruleIds.length}</dd></div>
                <div><dt>Completeness</dt><dd>{finding.dataCompleteness}</dd></div>
                <div><dt>Version</dt><dd>{finding.version}</dd></div>
              </dl>
              <ul>{finding.correlationEngine.ruleIds.map((rule) => <li key={rule}><code>{rule}</code></li>)}</ul>
              <p><Clock3 size={12} />Relationship confidence is evidence strength, not attack certainty. Preserve source evidence for analyst verification.</p>
            </aside>
          </section>
        )}
      </div>
    </article>
  );
}
