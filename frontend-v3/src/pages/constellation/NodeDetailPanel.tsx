import {
  AlertTriangle, ArrowRight, Clock3, ExternalLink, FileSearch, GitBranch, RefreshCw, Search,
  Sparkles, X,
} from 'lucide-react';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import type {
  GraphEdgeDTO, GraphNodeDTO, RelationshipEvidenceDTO,
} from '@/types/constellation.types';

interface NodeDetailPanelProps {
  node: GraphNodeDTO | null;
  edge: GraphEdgeDTO | null;
  connected: Array<{ edge: GraphEdgeDTO; node: GraphNodeDTO }>;
  edgeEndpoints: GraphNodeDTO[];
  evidence: RelationshipEvidenceDTO | null;
  evidenceLoading: boolean;
  evidenceError: string | null;
  expanding: boolean;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onOpenDossier: (node: GraphNodeDTO) => void;
  onHunt: (node: GraphNodeDTO) => void;
  onExpand: (node: GraphNodeDTO) => void;
  onRetryEvidence: () => void;
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';
}

function riskLevel(score: number): string {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function NodeDetailPanel({
  node, edge, connected, edgeEndpoints, evidence, evidenceLoading, evidenceError, expanding, onClose,
  onSelectNode, onOpenDossier, onHunt, onExpand, onRetryEvidence,
}: NodeDetailPanelProps): JSX.Element | null {
  if (!node && !edge) {
    return null;
  }

  if (edge && !node) {
    return <aside className="constellation-detail constellation-detail--edge" aria-label="Selected relationship details" aria-live="polite">
      <header><div><small>RELATIONSHIP EVIDENCE</small><h2>{edge.label ?? edge.edgeType.replace(/_/g, ' ')}</h2></div><button type="button" onClick={onClose} aria-label="Close relationship details"><X size={16} /></button></header>
      <section className="constellation-detail__relationship-score"><GitBranch size={18} /><div><strong>{edge.confidence ?? '—'}%</strong><span>confidence</span></div><div><strong>{edge.eventCount ?? edge.weight}</strong><span>events</span></div><div><strong>{edge.sourceCount ?? '—'}</strong><span>sources</span></div></section>
      <section className="constellation-detail__edge-path"><h3><GitBranch size={13} /> Connected entities</h3>{edgeEndpoints.map((endpoint, index) => <button key={endpoint.id} type="button" onClick={() => onSelectNode(endpoint.id)}><EntityTypeIcon type={endpoint.entityType} size={15} /><span><strong>{endpoint.entityValue}</strong><small>{index === 0 ? 'Source' : 'Target'} · {entityTypeLabel(endpoint.entityType)}</small></span><ArrowRight size={13} /></button>)}</section>
      <section><h3><Clock3 size={13} /> Observation window</h3><dl><div><dt>First seen</dt><dd>{formatDate(edge.firstSeen)}</dd></div><div><dt>Last seen</dt><dd>{formatDate(edge.lastSeen)}</dd></div><div><dt>Evidence records</dt><dd>{edge.evidenceCount ?? 'Unavailable'}</dd></div><div><dt>Direction</dt><dd>{edge.directed === false ? 'Undirected' : 'Source → target'}</dd></div></dl></section>
      <section className="constellation-detail__evidence" aria-busy={evidenceLoading}>
        <h3><FileSearch size={13} /> Supporting evidence</h3>
        {evidenceLoading ? <div className="constellation-detail__evidence-loading" aria-label="Loading supporting evidence"><i /><i /><i /></div> : null}
        {evidenceError ? <div className="constellation-detail__evidence-error" role="alert"><AlertTriangle size={14} /><span>{evidenceError}</span><button type="button" onClick={onRetryEvidence}><RefreshCw size={12} /> Retry</button></div> : null}
        {evidence && !evidenceLoading ? <>
          <div className="constellation-detail__evidence-summary"><span><strong>{evidence.summary.totalEvents}</strong> events</span><span><strong>{evidence.alerts.length}</strong> alerts</span><span><strong>{Math.round((evidence.confidence <= 1 ? evidence.confidence * 100 : evidence.confidence))}%</strong> confidence</span></div>
          {evidence.events.length ? <ol>{evidence.events.slice(0, 5).map((event) => <li key={event.id}><time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time><strong>{event.type.replace(/_/g, ' ')}</strong><span>{event.description}</span><small>{event.source}</small></li>)}</ol> : <p>No supporting events were returned for this authorized projection.</p>}
          {evidence.alerts.length ? <div className="constellation-detail__related-alerts"><h4>Related alerts</h4>{evidence.alerts.slice(0, 3).map((alert) => <div key={alert.id}><span data-severity={alert.severity.toLocaleLowerCase()}>{alert.severity}</span><strong>{alert.title}</strong><time dateTime={alert.timestamp}>{formatDate(alert.timestamp)}</time></div>)}</div> : null}
        </> : null}
        {!evidence && !evidenceLoading && !evidenceError ? <div className="constellation-detail__notice"><Sparkles size={14} /><p>The relationship summary is not treated as proof until supporting evidence is loaded.</p></div> : null}
      </section>
    </aside>;
  }

  const selected = node as GraphNodeDTO;
  return <aside className="constellation-detail" aria-label="Selected entity details" aria-live="polite">
    <header><div><small>{entityTypeLabel(selected.entityType).toLocaleUpperCase()} ENTITY</small><h2><EntityTypeIcon type={selected.entityType} size={17} />{selected.entityValue}</h2><code>{selected.entityId ?? selected.id}</code></div><button type="button" onClick={onClose} aria-label="Close entity details"><X size={16} /></button></header>
    <section className="constellation-detail__risk" data-level={riskLevel(selected.riskScore)}><div><strong>{selected.riskScore}</strong><span>/100 risk</span></div><dl><div><dt>Scope</dt><dd>{selected.scope ?? 'Unknown'}</dd></div><div><dt>Trend</dt><dd>{selected.riskTrend ?? 'Unknown'}</dd></div><div><dt>Alerts</dt><dd>{selected.alertCount}</dd></div><div><dt>Anomalies</dt><dd>{selected.anomalyCount ?? '—'}</dd></div></dl></section>
    <section><h3><Clock3 size={13} /> Entity context</h3><dl><div><dt>Criticality</dt><dd>{selected.criticality ?? 'Not classified'}</dd></div><div><dt>First seen</dt><dd>{formatDate(selected.firstSeen)}</dd></div><div><dt>Last seen</dt><dd>{formatDate(selected.lastSeen)}</dd></div><div><dt>Sources</dt><dd>{selected.sources?.length ?? 'Unavailable'}</dd></div></dl>{selected.sources?.length ? <div className="constellation-detail__tags">{selected.sources.map((source) => <span key={source}>{source}</span>)}</div> : null}</section>
    <section className="constellation-detail__connections"><h3><GitBranch size={13} /> Visible connections <span>{connected.length}</span></h3>{connected.length ? <ul>{connected.map(({ edge: relation, node: related }) => <li key={relation.id}><button type="button" onClick={() => onSelectNode(related.id)}><EntityTypeIcon type={related.entityType} size={14} /><span><strong>{related.entityValue}</strong><small>{relation.label ?? relation.edgeType.replace(/_/g, ' ')} · {relation.eventCount ?? relation.weight} events</small></span><em>{related.riskScore}</em><ArrowRight size={13} /></button></li>)}</ul> : <p>No visible connections match the current filters.</p>}</section>
    <footer><button type="button" onClick={() => onHunt(selected)}><Search size={14} /> Hunt entity</button><button type="button" onClick={() => onExpand(selected)} disabled={!selected.expandable || expanding}><GitBranch size={14} /> {expanding ? 'Expanding…' : 'Expand'}</button><button className="constellation-detail__primary" type="button" onClick={() => onOpenDossier(selected)}>Open dossier <ExternalLink size={13} /></button></footer>
  </aside>;
}
