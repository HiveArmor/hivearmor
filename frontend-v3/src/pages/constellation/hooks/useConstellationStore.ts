/**
 * Constellation Zustand Store — graph manipulation state.
 * Handles nodes, edges, selection, layout, and filters.
 * TanStack Query handles API calls; this store manages UI-driven graph state.
 */

import { create } from 'zustand';

import type {
  Cluster,
  ConstellationGraph,
  GraphEdge,
  GraphNode,
  LayoutMode,
  SnapshotMetadata,
} from '../types/constellation.types';

export interface ConstellationStore {
  // Graph state
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  snapshotId: string | null;
  metadata: SnapshotMetadata | null;

  // Selection state
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  contextMenuNode: GraphNode | null;
  contextMenuPosition: { x: number; y: number } | null;

  // View state
  layout: LayoutMode;
  confidenceFilter: number;
  entityTypeFilters: string[];

  // Actions
  setGraph: (graph: ConstellationGraph, metadata: SnapshotMetadata, snapshotId: string) => void;
  addNodes: (nodes: GraphNode[]) => void;
  addEdges: (edges: GraphEdge[]) => void;
  removeNodes: (nodeIds: string[]) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setContextMenu: (node: GraphNode | null, position: { x: number; y: number } | null) => void;
  updateNodeRisk: (nodeId: string, riskScore: number, riskLevel: string) => void;
  setLayout: (layout: LayoutMode) => void;
  setConfidenceFilter: (threshold: number) => void;
  toggleEntityType: (type: string) => void;
  reset: () => void;
}

const initialState = {
  nodes: [] as GraphNode[],
  edges: [] as GraphEdge[],
  clusters: [] as Cluster[],
  snapshotId: null as string | null,
  metadata: null as SnapshotMetadata | null,
  selectedNodeId: null as string | null,
  selectedEdgeId: null as string | null,
  contextMenuNode: null as GraphNode | null,
  contextMenuPosition: null as { x: number; y: number } | null,
  layout: 'force' as LayoutMode,
  confidenceFilter: 0,
  entityTypeFilters: [] as string[],
};

export const useConstellationStore = create<ConstellationStore>((set) => ({
  ...initialState,

  setGraph: (graph, metadata, snapshotId) =>
    set({
      nodes: graph.nodes,
      edges: graph.edges,
      clusters: graph.clusters,
      metadata,
      snapshotId,
      selectedNodeId: null,
      selectedEdgeId: null,
      contextMenuNode: null,
      contextMenuPosition: null,
    }),

  addNodes: (newNodes) =>
    set((state) => {
      const existingIds = new Set(state.nodes.map((n) => n.id));
      const unique = newNodes.filter((n) => !existingIds.has(n.id));
      return { nodes: [...state.nodes, ...unique] };
    }),

  addEdges: (newEdges) =>
    set((state) => {
      const existingIds = new Set(state.edges.map((e) => e.id));
      const unique = newEdges.filter((e) => !existingIds.has(e.id));
      return { edges: [...state.edges, ...unique] };
    }),

  removeNodes: (nodeIds) =>
    set((state) => {
      const removeSet = new Set(nodeIds);
      return {
        nodes: state.nodes.filter((n) => !removeSet.has(n.id)),
        edges: state.edges.filter(
          (e) => !removeSet.has(e.source) && !removeSet.has(e.target)
        ),
        selectedNodeId: state.selectedNodeId && removeSet.has(state.selectedNodeId)
          ? null
          : state.selectedNodeId,
      };
    }),

  selectNode: (nodeId) =>
    set({ selectedNodeId: nodeId, selectedEdgeId: null, contextMenuNode: null, contextMenuPosition: null }),

  selectEdge: (edgeId) =>
    set({ selectedEdgeId: edgeId, selectedNodeId: null, contextMenuNode: null, contextMenuPosition: null }),

  setContextMenu: (node, position) =>
    set({ contextMenuNode: node, contextMenuPosition: position }),

  updateNodeRisk: (nodeId, riskScore, riskLevel) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, riskScore, riskLevel: riskLevel as GraphNode['riskLevel'] }
          : n
      ),
    })),

  setLayout: (layout) => set({ layout }),

  setConfidenceFilter: (threshold) => set({ confidenceFilter: threshold }),

  toggleEntityType: (type) =>
    set((state) => {
      const current = state.entityTypeFilters;
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      return { entityTypeFilters: next };
    }),

  reset: () => set(initialState),
}));
