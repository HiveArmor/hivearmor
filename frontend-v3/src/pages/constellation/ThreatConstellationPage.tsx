import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Clock3, Database, GitBranch, List, Network, Radio, RefreshCw, ShieldAlert,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ConstellationToolbar } from './ConstellationToolbar';
import { useConstellationSnapshotStream } from './hooks/useConstellationSnapshotStream';
import { NodeDetailPanel } from './NodeDetailPanel';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { constellationService } from '@/services/constellation.service';
import type {
  ConstellationFilters, ConstellationResponse, EdgeType, GraphNodeDTO,
} from '@/types/constellation.types';

import './ThreatConstellationPage.css';

const ThreatConstellationCanvas = lazy(() => import('./ThreatConstellationCanvas').then((module) => ({ default: module.ThreatConstellationCanvas })));
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const ALL_EDGE_TYPES: EdgeType[] = ['CONNECTED_TO', 'SPAWNED', 'LOGGED_IN_FROM', 'RESOLVED_TO', 'CONTAINS', 'ACCESSED', 'AUTHENTICATED_TO', 'COMMUNICATED_WITH', 'EXECUTED_ON'];

function defaultFilters(seedEntity?: string): ConstellationFilters {
  return { entityTypes: ['user', 'host', 'ip', 'process', 'file', 'domain', 'service', 'cloud'], edgeTypes: ALL_EDGE_TYPES, depth: 2, timeRange: '24h', minRisk: 0, seedEntity, limit: 150, includeNonAlerting: true };
}

function riskLevel(score: number): string {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function formatSnapshot(value?: string): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unavailable';
}

function huntField(node: GraphNodeDTO): string {
  return ({ host: 'host.name', user: 'user.name', ip: 'source.ip', process: 'process.name', file: 'file.name', domain: 'dns.question.name', service: 'service.name', cloud: 'cloud.account.name' } as const)[node.entityType];
}

function WorkspaceState({ title, message, retry }: { title: string; message: string; retry?: () => void }): JSX.Element {
  return <div className="constellation-state"><Network size={28} /><h2>{title}</h2><p>{message}</p>{retry && <button type="button" onClick={retry}>Retry</button>}</div>;
}

export function ThreatConstellationPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const seedEntity = searchParams.get('entity') ?? undefined;
  const [filters, setFilters] = useState<ConstellationFilters>(() => defaultFilters(seedEntity));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [railMode, setRailMode] = useState<'entities' | 'relationships'>('entities');
  const [paused, setPaused] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitRevision, setFitRevision] = useState(0);
  const [expandedProjection, setExpandedProjection] = useState<ConstellationResponse | null>(null);
  const appliedSeedRef = useRef<string | undefined>(undefined);
  const epsStream = useEpsStream();

  const graphQuery = useQuery({
    queryKey: ['threat-constellation', filters],
    queryFn: ({ signal }) => constellationService.getConstellation(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => setExpandedProjection(graphQuery.data ?? null), [graphQuery.data]);

  const graph = expandedProjection ?? graphQuery.data;
  const nodes = useMemo(() => graph?.nodes ?? [], [graph?.nodes]);
  const edges = useMemo(() => graph?.edges ?? [], [graph?.edges]);
  const snapshotStream = useConstellationSnapshotStream(graph?.snapshotId);

  const evidenceQuery = useQuery({
    queryKey: ['constellation-relationship-evidence', selectedEdgeId],
    queryFn: ({ signal }) => constellationService.getRelationshipEvidence(selectedEdgeId as string, signal),
    enabled: Boolean(selectedEdgeId),
    staleTime: 60_000,
    retry: false,
  });

  const expandMutation = useMutation({
    mutationFn: (nodeId: string) => {
      if (!graph?.snapshotId) throw new Error('The graph snapshot is unavailable. Refresh the workspace and try again.');
      return constellationService.expandConstellation(graph.snapshotId, nodeId);
    },
    onSuccess: (result, expandedNodeId) => {
      setExpandedProjection((current) => {
        if (!current) return current;
        const removed = new Set(result.removedNodes);
        const nodeMap = new Map(current.nodes.filter((node) => !removed.has(node.id)).map((node) => [node.id, node]));
        result.addedNodes.forEach((node) => nodeMap.set(node.id, node));
        const expandedNode = nodeMap.get(expandedNodeId);
        if (expandedNode) nodeMap.set(expandedNodeId, { ...expandedNode, expandable: false });
        const edgeMap = new Map(current.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)).map((edge) => [edge.id, edge]));
        result.addedEdges.forEach((edge) => edgeMap.set(edge.id, edge));
        return {
          ...current,
          nodes: [...nodeMap.values()],
          edges: [...edgeMap.values()],
          totalNodes: Math.max(current.totalNodes ?? 0, nodeMap.size),
          totalEdges: Math.max(current.totalEdges ?? 0, edgeMap.size),
          snapshotExpiresAt: result.snapshotExpiresAt ?? current.snapshotExpiresAt,
        };
      });
      setFitRevision((revision) => revision + 1);
    },
  });

  useEffect(() => {
    if (!nodes.length || !seedEntity || appliedSeedRef.current === seedEntity) return;
    const seeded = nodes.find((node) => node.entityId === seedEntity || node.id === seedEntity);
    if (seeded) {
      appliedSeedRef.current = seedEntity;
      setSelectedNodeId(seeded.id);
    }
  }, [nodes, seedEntity]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId(null);
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [edges, nodes, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    if (!focusMode) return undefined;
    const exitFocusMode = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', exitFocusMode);
    return () => window.removeEventListener('keydown', exitFocusMode);
  }, [focusMode]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;
  const selectedEdgeEndpoints = useMemo(() => selectedEdge ? [nodeById.get(selectedEdge.source), nodeById.get(selectedEdge.target)].filter((node): node is GraphNodeDTO => Boolean(node)) : [], [nodeById, selectedEdge]);
  const hasSelection = Boolean(selectedNode || selectedEdge);
  const connected = useMemo(() => selectedNodeId ? edges.flatMap((edge) => {
    if (edge.source === selectedNodeId) { const node = nodeById.get(edge.target); return node ? [{ edge, node }] : []; }
    if (edge.target === selectedNodeId) { const node = nodeById.get(edge.source); return node ? [{ edge, node }] : []; }
    return [];
  }).sort((a, b) => (b.edge.confidence ?? 0) - (a.edge.confidence ?? 0)) : [], [edges, nodeById, selectedNodeId]);

  const highestRisk = nodes.reduce((maximum, node) => Math.max(maximum, node.riskScore), 0);
  const activeAlerts = nodes.reduce((total, node) => total + node.alertCount, 0);
  const externalCount = nodes.filter((node) => node.scope === 'external').length;

  const selectNode = useCallback((nodeId: string) => { setSelectedNodeId(nodeId); setSelectedEdgeId(null); }, []);
  const selectEdge = useCallback((edgeId: string) => { setSelectedEdgeId(edgeId); setSelectedNodeId(null); }, []);
  const updateFilters = (partial: Partial<ConstellationFilters>) => {
    setFilters((current) => ({ ...current, ...partial }));
    setSelectedEdgeId(null);
  };
  const refreshSnapshot = () => {
    snapshotStream.clearPendingChanges();
    setExpandedProjection(null);
    void graphQuery.refetch();
  };
  const resetWorkspace = () => {
    setFilters(defaultFilters()); setSelectedNodeId(null); setSelectedEdgeId(null); setSearchParams({}, { replace: true }); setZoom(1); setFitRevision((revision) => revision + 1);
  };

  const navigateRail = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key)) return;
    event.preventDefault();
    const items = railMode === 'entities' ? nodes.map((node) => node.id) : edges.map((edge) => edge.id);
    const active = railMode === 'entities' ? selectedNodeId : selectedEdgeId;
    const index = Math.max(0, items.indexOf(active ?? items[0]));
    const direction = event.key === 'ArrowUp' || event.key === 'k' ? -1 : 1;
    const next = items[(index + direction + items.length) % items.length];
    if (next) railMode === 'entities' ? selectNode(next) : selectEdge(next);
  };

  return <section className={`constellation-page${focusMode ? ' constellation-page--focus' : ''}`} aria-keyshortcuts={focusMode ? 'Escape' : undefined}>
    <header className="constellation-page__identity"><span className="constellation-page__icon"><Network size={20} /></span><div><small>INVESTIGATION</small><h1>Threat Constellation</h1><p>Evidence-backed entity and activity relationships</p></div><div className="constellation-page__header-status"><span data-state={snapshotStream.connected ? graph?.freshness ?? 'fresh' : 'degraded'}><Radio size={12} />{snapshotStream.connected ? 'Snapshot live' : graphQuery.isLoading ? 'Loading' : 'Snapshot only'}</span><button type="button" onClick={refreshSnapshot} disabled={graphQuery.isFetching}><RefreshCw size={14} className={graphQuery.isFetching ? 'constellation-spin' : undefined} /> Refresh</button></div></header>
    {fixtureMode && <div className="constellation-page__fixture"><span><strong>Design fixture:</strong> fictional entity relationships are enabled for visual review.</span><span>Production never receives these records.</span></div>}
    {graph?.partialFailures?.length ? <div className="constellation-page__partial" role="status"><AlertTriangle size={14} /><strong>Partial graph:</strong>{graph.partialFailures.map((failure) => failure.message).join(' ')}</div> : null}
    {snapshotStream.pendingChanges > 0 ? <div className="constellation-page__updates" role="status"><Radio size={13} /><span>{snapshotStream.pendingChanges} graph {snapshotStream.pendingChanges === 1 ? 'change is' : 'changes are'} available. The current investigation view remains stable.</span><button type="button" onClick={refreshSnapshot}>Load updates</button></div> : null}
    {snapshotStream.expired ? <div className="constellation-page__partial" role="alert"><AlertTriangle size={14} /><strong>Snapshot expired:</strong><span>Refresh to create a new authorized investigation projection.</span><button type="button" onClick={refreshSnapshot}>Refresh snapshot</button></div> : null}
    {expandMutation.isError ? <div className="constellation-page__partial" role="alert"><AlertTriangle size={14} /><strong>Expansion failed:</strong><span>{expandMutation.error instanceof Error ? expandMutation.error.message : 'The selected node could not be expanded.'}</span><button type="button" onClick={() => expandMutation.reset()}>Dismiss</button></div> : null}
    <section className="constellation-summary" aria-label="Relationship graph summary">
      <article><span><Database size={12} /> Visible entities</span><strong>{nodes.length}</strong><small>{externalCount} external</small></article>
      <article><span><GitBranch size={12} /> Relationships</span><strong>{edges.length}</strong><small>{graph?.totalEdges ?? edges.length} authorized</small></article>
      <article data-level={riskLevel(highestRisk)}><span><ShieldAlert size={12} /> Highest risk</span><strong>{highestRisk || '—'}</strong><small>normalized /100</small></article>
      <article><span><AlertTriangle size={12} /> Alert references</span><strong>{activeAlerts}</strong><small>across visible entities</small></article>
      <article><span><Clock3 size={12} /> Activity window</span><strong>{filters.timeRange}</strong><small>{filters.depth} relationship hops</small></article>
      <article><span><RefreshCw size={12} /> Snapshot</span><strong>{formatSnapshot(graph?.snapshotAt)}</strong><small>{graph?.queryDurationMs ? `${graph.queryDurationMs} ms query` : 'Awaiting data'}</small></article>
    </section>
    <ConstellationToolbar filters={filters} paused={paused} focusMode={focusMode} onFiltersChange={updateFilters} onResetView={resetWorkspace} onFitView={() => { setZoom(1); setFitRevision((revision) => revision + 1); }} onZoomIn={() => setZoom((value) => Math.min(2.2, value + .2))} onZoomOut={() => setZoom((value) => Math.max(.45, value - .2))} onTogglePaused={() => setPaused((value) => !value)} onToggleFocusMode={() => setFocusMode((value) => !value)} />

    <main className={`constellation-workspace${hasSelection ? ' constellation-workspace--detail' : ''}${focusMode ? ' constellation-workspace--focus' : ''}`}>
      <aside className="constellation-rail" aria-label="Accessible graph inventory">
        <header><div role="tablist" aria-label="Graph inventory"><button role="tab" aria-selected={railMode === 'entities'} onClick={() => setRailMode('entities')}><List size={13} /> Entities <span>{nodes.length}</span></button><button role="tab" aria-selected={railMode === 'relationships'} onClick={() => setRailMode('relationships')}><GitBranch size={13} /> Links <span>{edges.length}</span></button></div></header>
        <div className="constellation-rail__list" role="listbox" aria-label={railMode === 'entities' ? 'Visible entities' : 'Visible relationships'} onKeyDown={navigateRail} tabIndex={0}>
          {railMode === 'entities' ? nodes.map((node) => <button key={node.id} type="button" role="option" aria-selected={selectedNodeId === node.id} onClick={() => selectNode(node.id)}><span className="constellation-rail__entity-icon"><EntityTypeIcon type={node.entityType} size={20} /></span><span><strong>{node.entityValue}</strong><small>{entityTypeLabel(node.entityType)} · {node.alertCount} alerts</small></span><em data-level={riskLevel(node.riskScore)}>{node.riskScore}</em></button>) : edges.map((edge) => <button key={edge.id} type="button" role="option" aria-selected={selectedEdgeId === edge.id} onClick={() => selectEdge(edge.id)}><span className="constellation-rail__link-icon"><GitBranch size={18} /></span><span><strong>{edge.label ?? edge.edgeType.replace(/_/g, ' ')}</strong><small>{nodeById.get(edge.source)?.entityValue ?? edge.source} → {nodeById.get(edge.target)?.entityValue ?? edge.target}</small></span><em>{edge.confidence ?? '—'}%</em></button>)}
          {!nodes.length && !graphQuery.isLoading && <p>No authorized graph records match the active filters.</p>}
        </div>
      </aside>

      <section className="constellation-stage" aria-label="Threat relationship visualization">
        <div className="constellation-legend"><span><i data-scope="internal" /> Internal</span><span><i data-scope="external" /> External</span><span><i data-risk="critical" /> Critical risk</span><span><i data-risk="high" /> High risk</span><span>Node size = alert volume</span><span>Moving arrows = observed direction</span></div>
        {graphQuery.isLoading ? <div className="constellation-loading" aria-busy="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div> : graphQuery.isError ? <WorkspaceState title="Threat relationships unavailable" message={graphQuery.error instanceof Error ? graphQuery.error.message : 'The graph service did not respond.'} retry={() => void graphQuery.refetch()} /> : !nodes.length ? <WorkspaceState title="No relationships in this scope" message="Broaden the time window, lower the risk threshold, or reset entity filters." retry={resetWorkspace} /> : <Suspense fallback={<div className="constellation-loading" aria-busy="true"><i /><i /><i /><i /></div>}><ThreatConstellationCanvas nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} zoom={zoom} paused={paused} fitRevision={fitRevision} onNodeClick={selectNode} onEdgeClick={selectEdge} /></Suspense>}
        {graph?.truncated && <div className="constellation-truncated" role="status">Showing the highest-risk bounded projection. Narrow filters to explore additional relationships.</div>}
      </section>

      <NodeDetailPanel node={selectedNode} edge={selectedEdge} connected={connected} edgeEndpoints={selectedEdgeEndpoints} evidence={evidenceQuery.data ?? null} evidenceLoading={evidenceQuery.isLoading} evidenceError={evidenceQuery.isError ? (evidenceQuery.error instanceof Error ? evidenceQuery.error.message : 'Supporting evidence is unavailable.') : null} expanding={expandMutation.isPending} onRetryEvidence={() => void evidenceQuery.refetch()} onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} onSelectNode={selectNode} onHunt={(node) => navigate(`/search?q=${encodeURIComponent(`${huntField(node)}:"${node.entityValue}"`)}`)} onOpenDossier={(node) => navigate(node.entityId ? `/entities/${encodeURIComponent(node.entityId)}/dossier` : `/entities?search=${encodeURIComponent(node.entityValue)}`)} onExpand={(node) => expandMutation.mutate(node.id)} />
    </main>
    <div className="constellation-status"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={graph?.snapshotAt ? new Date(graph.snapshotAt) : undefined} /><span><GitBranch size={12} /> Snapshot {formatSnapshot(graph?.snapshotAt)} · {graphQuery.isFetching ? 'Updating projection' : 'Projection stable'}</span></div>
  </section>;
}
