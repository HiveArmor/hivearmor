/**
 * ConstellationPage — Sprint 48 full-page layout for bounded graph exploration.
 * Canvas (80% width), side panels (20%), controls bar (top), info bar (bottom).
 * Uses Zustand for graph state, TanStack Query for API mutations.
 */

import { useCallback, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';

import { ClusterLegend } from './ClusterLegend';
import { ConstellationCanvas } from './ConstellationCanvas';
import { EdgeEvidencePanel } from './EdgeEvidencePanel';
import { ExplorePanel } from './ExplorePanel';
import { GraphControlsBar } from './GraphControlsBar';
import { NodeContextMenu } from './NodeContextMenu';
import { NodeDetailPanel } from './NodeDetailPanel';
import { SnapshotInfoBar } from './SnapshotInfoBar';
import { useConstellationStore } from '../hooks/useConstellationStore';
import { useConstellationStream } from '../hooks/useConstellationStream';
import * as constellationApi from '../services/constellation.service';
import type { ExpandOptions, ExploreOptions, SeedDescriptor } from '../types/constellation.types';

import './ConstellationPage.css';

export function ConstellationPage(): JSX.Element {
  const [evidenceEdgeId, setEvidenceEdgeId] = useState<string | null>(null);

  const store = useConstellationStore();
  const snapshotId = store.snapshotId;

  // SSE connection for live updates
  useConstellationStream(snapshotId);

  // CON-001: Explore mutation
  const exploreMutation = useMutation({
    mutationFn: ({ seed, options }: { seed: SeedDescriptor; options: ExploreOptions }) =>
      constellationApi.explore(seed, options),
    onSuccess: (response) => {
      store.setGraph(response.graph, response.metadata, response.snapshotId);
    },
  });

  // CON-002: Expand mutation
  const expandMutation = useMutation({
    mutationFn: ({ snapshotId: snapId, options }: { snapshotId: string; options: ExpandOptions }) =>
      constellationApi.expand(snapId, options),
    onSuccess: (result) => {
      store.addNodes(result.addedNodes);
      store.addEdges(result.addedEdges);
      if (result.removedNodes?.length) {
        store.removeNodes(result.removedNodes);
      }
    },
  });

  // CON-003: Relationship evidence query (only when edge selected for evidence)
  const evidenceQuery = useQuery({
    queryKey: ['relationship-evidence', evidenceEdgeId],
    queryFn: ({ signal }) =>
      evidenceEdgeId
        ? constellationApi.getRelationshipEvidence(evidenceEdgeId, signal)
        : Promise.reject(new Error('No edge selected')),
    enabled: Boolean(evidenceEdgeId),
    staleTime: 60_000,
  });

  const handleExplore = useCallback(
    (seed: SeedDescriptor, options: ExploreOptions) => {
      exploreMutation.mutate({ seed, options });
    },
    [exploreMutation]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      if (!snapshotId) return;
      const node = store.nodes.find((n) => n.id === nodeId);
      if (!node || node.expanded) return;
      expandMutation.mutate({
        snapshotId,
        options: { nodeId, hopDepth: 1, nodeLimit: 50, edgeLimit: 100, direction: 'both' },
      });
    },
    [snapshotId, store.nodes, expandMutation]
  );

  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      store.selectEdge(edgeId);
      setEvidenceEdgeId(edgeId);
    },
    [store]
  );

  const handleCloseEvidence = useCallback(() => {
    setEvidenceEdgeId(null);
    store.selectEdge(null);
  }, [store]);

  const selectedNode = store.selectedNodeId
    ? store.nodes.find((n) => n.id === store.selectedNodeId) ?? null
    : null;

  return (
    <div className="ha-constellation-page">
      <GraphControlsBar
        layout={store.layout}
        confidenceFilter={store.confidenceFilter}
        entityTypeFilters={store.entityTypeFilters}
        onLayoutChange={store.setLayout}
        onConfidenceChange={store.setConfidenceFilter}
        onToggleEntityType={store.toggleEntityType}
      />

      <div className="ha-constellation-page__body">
        <aside className="ha-constellation-page__sidebar">
          <ExplorePanel
            onExplore={handleExplore}
            isLoading={exploreMutation.isPending}
          />
          {selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              onExpand={handleNodeDoubleClick}
              onClose={() => store.selectNode(null)}
            />
          )}
        </aside>

        <main className="ha-constellation-page__canvas">
          <ConstellationCanvas
            nodes={store.nodes}
            edges={store.edges}
            clusters={store.clusters}
            selectedNodeId={store.selectedNodeId}
            selectedEdgeId={store.selectedEdgeId}
            layout={store.layout}
            confidenceFilter={store.confidenceFilter}
            entityTypeFilters={store.entityTypeFilters}
            onNodeClick={store.selectNode}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={store.setContextMenu}
            onEdgeClick={handleEdgeClick}
          />
          {store.clusters.length > 0 && (
            <ClusterLegend clusters={store.clusters} />
          )}
        </main>

        {evidenceEdgeId && (
          <EdgeEvidencePanel
            evidence={evidenceQuery.data?.relationship ?? null}
            isLoading={evidenceQuery.isLoading}
            onClose={handleCloseEvidence}
          />
        )}
      </div>

      <SnapshotInfoBar metadata={store.metadata} snapshotId={store.snapshotId} />

      {store.contextMenuNode && store.contextMenuPosition && (
        <NodeContextMenu
          node={store.contextMenuNode}
          position={store.contextMenuPosition}
          onClose={() => store.setContextMenu(null, null)}
        />
      )}
    </div>
  );
}
