/**
 * ConstellationCanvas — ECharts force-directed graph for Sprint 48.
 * Node coloring by riskLevel, edge thickness by strength, cluster shading.
 * Interactions: click to select, double-click to expand, right-click context menu, drag.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ECharts, EChartsOption } from 'echarts';

import type { Cluster, GraphEdge, GraphNode, LayoutMode } from '../types/constellation.types';

import { HaChart } from '@/components/ha-chart/HaChart';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';


interface ConstellationCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  layout: LayoutMode;
  confidenceFilter: number;
  entityTypeFilters: string[];
  onNodeClick: (nodeId: string | null) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onNodeContextMenu: (node: GraphNode | null, position: { x: number; y: number } | null) => void;
  onEdgeClick: (edgeId: string) => void;
}

const THEME_TOKENS = [
  '--ha-surface-primary',
  '--ha-surface-raised',
  '--ha-border',
  '--ha-primary',
  '--ha-critical',
  '--ha-high',
  '--ha-medium',
  '--ha-positive',
  '--ha-text-primary',
  '--ha-text-secondary',
] as const;

function riskColor(riskLevel: string, tokens: Record<string, string>): string {
  switch (riskLevel) {
    case 'critical': return tokens['--ha-critical'];
    case 'high': return tokens['--ha-high'];
    case 'medium': return tokens['--ha-medium'];
    case 'low': return tokens['--ha-positive'];
    default: return tokens['--ha-text-secondary'];
  }
}

function edgeWidth(strength: number): number {
  return Math.max(1, Math.min(5, strength * 5));
}

function layoutConfig(layout: LayoutMode): Partial<EChartsOption> {
  switch (layout) {
    case 'circular':
      return { series: [{ layout: 'circular', circular: { rotateLabel: true } }] };
    case 'hierarchical':
      return { series: [{ layout: 'force', force: { repulsion: 600, gravity: 0.05, edgeLength: [80, 200] } }] };
    case 'force':
    default:
      return { series: [{ layout: 'force', force: { repulsion: 400, gravity: 0.1, edgeLength: [50, 150], friction: 0.6 } }] };
  }
}

export function ConstellationCanvas({
  nodes,
  edges,
  clusters,
  selectedNodeId,
  selectedEdgeId,
  layout,
  confidenceFilter,
  entityTypeFilters,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onEdgeClick,
}: ConstellationCanvasProps): JSX.Element {
  const tokens = useHaThemeTokens(THEME_TOKENS);
  const chartRef = useRef<ECharts | null>(null);
  const doubleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter nodes and edges based on confidence and entity type filters
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (entityTypeFilters.length > 0) {
      result = result.filter((n) => entityTypeFilters.includes(n.type));
    }
    return result;
  }, [nodes, entityTypeFilters]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter(
      (e) =>
        nodeIds.has(e.source) &&
        nodeIds.has(e.target) &&
        e.confidence >= confidenceFilter
    );
  }, [edges, filteredNodes, confidenceFilter]);

  // Build cluster node groups
  const clusterMap = useMemo(() => {
    const map = new Map<string, Cluster>();
    clusters.forEach((c) => map.set(c.id, c));
    return map;
  }, [clusters]);

  // Build ECharts categories from clusters
  const categories = useMemo(() => {
    return clusters.map((c) => ({
      name: c.label,
      itemStyle: { color: c.color, opacity: 0.15 },
    }));
  }, [clusters]);

  const option = useMemo<EChartsOption>(() => {
    const layoutCfg = layoutConfig(layout);

    const graphNodes = filteredNodes.map((node) => ({
      id: node.id,
      name: node.displayName || node.value,
      value: node.riskScore,
      symbolSize: node.size * 12 + 16,
      category: node.group ? clusters.findIndex((c) => c.id === node.group) : undefined,
      itemStyle: {
        color: riskColor(node.riskLevel, tokens),
        borderColor: selectedNodeId === node.id
          ? tokens['--ha-primary']
          : tokens['--ha-border'],
        borderWidth: selectedNodeId === node.id ? 3 : 1,
        shadowBlur: selectedNodeId === node.id ? 12 : 0,
        shadowColor: selectedNodeId === node.id ? tokens['--ha-primary'] : undefined,
      },
      label: {
        show: true,
        position: 'bottom' as const,
        formatter: node.value.length > 16 ? `${node.value.slice(0, 14)}…` : node.value,
        color: tokens['--ha-text-secondary'],
        fontSize: 10,
      },
      draggable: true,
      _graphNode: node,
    }));

    const graphEdges = filteredEdges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      value: edge.strength,
      lineStyle: {
        width: edgeWidth(edge.strength),
        color: selectedEdgeId === edge.id
          ? tokens['--ha-primary']
          : tokens['--ha-border'],
        opacity: selectedEdgeId === edge.id ? 1 : 0.6,
        type: edge.confidence < 0.5 ? ('dashed' as const) : ('solid' as const),
      },
      emphasis: {
        lineStyle: {
          width: edgeWidth(edge.strength) + 1,
          color: tokens['--ha-primary'],
        },
      },
      _graphEdge: edge,
    }));

    const forceConfig = (layoutCfg.series as Array<Record<string, unknown>>)?.[0] ?? {};

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: tokens['--ha-surface-raised'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'], fontSize: 11 },
        formatter: (params: unknown) => {
          const data = params as { data?: { _graphNode?: GraphNode; _graphEdge?: GraphEdge } };
          if (data.data?._graphNode) {
            const n = data.data._graphNode;
            return `<strong>${n.displayName}</strong><br/>Type: ${n.type}<br/>Risk: ${n.riskScore} (${n.riskLevel})<br/>Alerts: ${n.alertCount}`;
          }
          if (data.data?._graphEdge) {
            const e = data.data._graphEdge;
            return `<strong>${e.label}</strong><br/>Type: ${e.relationshipType}<br/>Strength: ${(e.strength * 100).toFixed(0)}%<br/>Events: ${e.eventCount}`;
          }
          return '';
        },
      },
      series: [
        {
          type: 'graph',
          ...forceConfig,
          roam: true,
          draggable: true,
          data: graphNodes,
          edges: graphEdges,
          categories,
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 3 },
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 8],
        },
      ],
    } satisfies EChartsOption;
  }, [filteredNodes, filteredEdges, clusters, categories, layout, selectedNodeId, selectedEdgeId, tokens]);

  const handleChartReady = useCallback((chart: unknown) => {
    chartRef.current = chart as ECharts;
  }, []);

  // Handle right-click for context menu
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;

    const handleContextMenu = (params: { data?: { _graphNode?: GraphNode }; event?: { event: MouseEvent } }) => {
      if (params.data?._graphNode && params.event?.event) {
        params.event.event.preventDefault();
        onNodeContextMenu(
          params.data._graphNode,
          { x: params.event.event.clientX, y: params.event.event.clientY }
        );
      }
    };

    chart.on('contextmenu', handleContextMenu as never);
    return () => {
      if (!chart.isDisposed()) {
        chart.off('contextmenu', handleContextMenu as never);
      }
    };
  }, [onNodeContextMenu, option]);

  const handleClick = useCallback(
    (params: unknown) => {
      const data = (params as { data?: { _graphNode?: GraphNode; _graphEdge?: GraphEdge } }).data;

      if (data?._graphNode) {
        const graphNodeId = data._graphNode.id;
        // Single click: select. Double-click: expand.
        if (doubleClickTimerRef.current) {
          clearTimeout(doubleClickTimerRef.current);
          doubleClickTimerRef.current = null;
          onNodeDoubleClick(graphNodeId);
        } else {
          doubleClickTimerRef.current = setTimeout(() => {
            doubleClickTimerRef.current = null;
            onNodeClick(graphNodeId);
          }, 250);
        }
      } else if (data?._graphEdge) {
        onEdgeClick(data._graphEdge.id);
      } else {
        onNodeClick(null);
      }
    },
    [onNodeClick, onNodeDoubleClick, onEdgeClick]
  );

  void clusterMap;

  return (
    <div
      className="ha-constellation-canvas"
      style={{ width: '100%', height: '100%' }}
      aria-label="Threat constellation graph visualization"
    >
      <HaChart
        option={option}
        notMerge
        lazyUpdate
        onChartReady={handleChartReady}
        onChartClick={handleClick}
        ariaLabel="Force-directed threat constellation graph"
        ariaDescription={`${filteredNodes.length} nodes and ${filteredEdges.length} edges. Click a node to select, double-click to expand, right-click for context menu.`}
      />
    </div>
  );
}
