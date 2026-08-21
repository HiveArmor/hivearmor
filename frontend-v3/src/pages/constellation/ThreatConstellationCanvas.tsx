import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ECharts, EChartsOption } from 'echarts';

import { HaChart } from '@/components/ha-chart/HaChart';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import { numericToSeverityLevel } from '@/lib/severity';
import type { EntityType, GraphEdgeDTO, GraphNodeDTO } from '@/types/constellation.types';

interface ThreatConstellationCanvasProps {
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  zoom: number;
  paused: boolean;
  fitRevision: number;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
}

const CHART_TOKENS = ['--ha-background', '--ha-surface-primary', '--ha-surface-raised', '--ha-border', '--ha-primary', '--ha-critical', '--ha-high', '--ha-medium', '--ha-positive', '--ha-text-primary', '--ha-text-secondary'] as const;
const ENTITY_ICON_PATHS: Record<EntityType, string> = {
  host: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ip: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.6 8.6m7-8.6 4.6 8.6M7.5 18h9"/>',
  process: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  file: '<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13l2 2-2 2m4 0h3"/>',
  domain: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  service: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
  cloud: '<path d="M6.5 19h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 6.5 19Z"/>',
};

function entityBadgeSymbol(type: EntityType, background: string, border: string, foreground: string, external: boolean): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="${background}" stroke="${border}" stroke-width="3"${external ? ' stroke-dasharray="6 4"' : ''}/><g transform="translate(12 12)" fill="none" stroke="${foreground}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ENTITY_ICON_PATHS[type]}</g></svg>`;
  return `image://data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

function nodeSize(node: GraphNodeDTO): number {
  return Math.min(40, 30 + Math.log2(node.alertCount + 1) * 2.4 + node.riskScore / 45);
}

type NodePosition = [number, number];

function buildNodePositions(nodes: GraphNodeDTO[], edges: GraphEdgeDTO[]): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  if (!nodes.length) return positions;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const root = [...nodes].sort((left, right) => right.riskScore - left.riskScore || left.id.localeCompare(right.id))[0];
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  });

  const depth = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const nextDepth = (depth.get(current) ?? 0) + 1;
    [...(adjacency.get(current) ?? [])].sort().forEach((neighbor) => {
      if (depth.has(neighbor)) return;
      depth.set(neighbor, nextDepth);
      queue.push(neighbor);
    });
  }

  positions.set(root.id, [50, 50]);
  const rings = new Map<number, GraphNodeDTO[]>();
  nodes.filter((node) => node.id !== root.id).forEach((node) => {
    const ring = Math.min(2, depth.get(node.id) ?? 2);
    rings.set(ring, [...(rings.get(ring) ?? []), node]);
  });
  const radii: Record<number, NodePosition> = { 1: [24, 21], 2: [43, 38] };
  rings.forEach((ringNodes, ring) => {
    const [radiusX, radiusY] = radii[ring] ?? radii[2];
    ringNodes.sort((left, right) => left.entityValue.localeCompare(right.entityValue)).forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / ringNodes.length + ring * 0.22;
      positions.set(node.id, [50 + Math.cos(angle) * radiusX, 50 + Math.sin(angle) * radiusY]);
    });
  });
  return positions;
}

export function ThreatConstellationCanvas({
  nodes, edges, selectedNodeId, selectedEdgeId, zoom, paused, fitRevision, onNodeClick, onEdgeClick,
}: ThreatConstellationCanvasProps): JSX.Element {
  const colors = useHaThemeTokens(CHART_TOKENS);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [manualPositions, setManualPositions] = useState<Map<string, NodePosition>>(() => new Map());
  const chartRef = useRef<ECharts | null>(null);
  const dragSyncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(media.matches);
    media.addEventListener('change', updateMotionPreference);
    return () => media.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => setManualPositions(new Map()), [fitRevision]);

  const severityColor = useCallback((score: number): string => {
    const level = numericToSeverityLevel(Math.max(1, Math.ceil(score / 10)));
    if (level === 'critical') return colors['--ha-critical'];
    if (level === 'high') return colors['--ha-high'];
    if (level === 'medium') return colors['--ha-medium'];
    return colors['--ha-positive'];
  }, [colors]);

  const option = useMemo<EChartsOption>(() => {
    const positions = buildNodePositions(nodes, edges);
    manualPositions.forEach((position, nodeId) => {
      if (nodes.some((node) => node.id === nodeId)) positions.set(nodeId, position);
    });
    const span = 100 / zoom;
    const axisMin = 50 - span / 2;
    const axisMax = 50 + span / 2;
    // Deduplicate nodes by ID (prevents ECharts crash on duplicate node references)
    const seenIds = new Set<string>();
    const uniqueNodes = nodes.filter((node) => {
      if (seenIds.has(node.id)) return false;
      seenIds.add(node.id);
      return true;
    });
    const graphNodes = uniqueNodes.map((node) => {
      const [x, y] = positions.get(node.id) ?? [50, 50];
      return {
        id: node.id,
        name: node.entityValue,
        value: [x, y, node.riskScore],
        symbol: entityBadgeSymbol(
          node.entityType,
          selectedNodeId === node.id ? colors['--ha-primary'] : colors['--ha-surface-raised'],
          selectedNodeId === node.id ? colors['--ha-primary'] : severityColor(node.riskScore),
          selectedNodeId === node.id ? colors['--ha-text-primary'] : severityColor(node.riskScore),
          node.scope === 'external',
        ),
        symbolSize: nodeSize(node),
        draggable: true,
        itemStyle: {
          opacity: selectedNodeId && selectedNodeId !== node.id ? 0.7 : 1,
          shadowBlur: selectedNodeId === node.id ? 9 : 0,
          shadowColor: colors['--ha-primary'],
        },
        label: { show: false },
        emphasis: {
          focus: 'adjacency' as const,
          scale: false,
          itemStyle: { shadowBlur: 9, shadowColor: colors['--ha-primary'] },
          label: { show: false },
        },
        _node: node,
      };
    });

    const graphNodeIdSet = new Set(graphNodes.map((n) => n.id));

    return ({
    backgroundColor: 'transparent',
    grid: { left: 46, right: 46, top: 45, bottom: 52, containLabel: false },
    xAxis: { type: 'value', min: axisMin, max: axisMax, show: false },
    yAxis: { type: 'value', min: axisMin, max: axisMax, inverse: true, show: false },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: colors['--ha-surface-raised'],
      borderColor: colors['--ha-border'],
      textStyle: { color: colors['--ha-text-primary'], fontSize: 11 },
      formatter: (params: unknown) => {
        const raw = (params as { data?: { _node?: GraphNodeDTO; _edge?: GraphEdgeDTO } }).data;
        if (raw?._node) {
          const node = raw._node;
          return `<strong>${escapeHtml(node.entityValue)}</strong><br/><span>${escapeHtml(node.entityType)} · ${escapeHtml(node.scope ?? 'unknown')} scope</span><br/>Risk ${node.riskScore}/100 · ${node.alertCount} alerts`;
        }
        if (raw?._edge) {
          const edge = raw._edge;
          return `<strong>${escapeHtml(edge.label ?? edge.edgeType.replace(/_/g, ' '))}</strong><br/>${edge.eventCount ?? edge.weight} events · ${edge.confidence ?? '—'}% confidence<br/>Last seen ${new Date(edge.lastSeen).toLocaleString()}`;
        }
        return '';
      },
    },
    series: [{
      id: `relationship-graph-${fitRevision}`,
      type: 'graph',
      animation: false,
      coordinateSystem: 'cartesian2d',
      layout: 'none',
      roam: false,
      draggable: true,
      data: graphNodes,
      edges: edges.filter((edge) => graphNodeIdSet.has(edge.source) && graphNodeIdSet.has(edge.target)).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        value: edge.weight,
        symbol: edge.directed === false ? ['none', 'none'] : ['none', 'arrow'],
        symbolSize: 7,
        lineStyle: {
          color: selectedEdgeId === edge.id ? colors['--ha-primary'] : colors['--ha-border'],
          width: selectedEdgeId === edge.id ? 3.2 : Math.min(2.6, 1 + Math.log2(edge.weight + 1) / 2),
          opacity: selectedEdgeId && selectedEdgeId !== edge.id ? 0.38 : 0.88,
          curveness: 0.08,
          type: (edge.confidence ?? 100) < 70 ? 'dashed' : 'solid',
          shadowBlur: selectedEdgeId === edge.id ? 7 : 0,
          shadowColor: colors['--ha-primary'],
        },
        label: {
          show: selectedEdgeId === edge.id,
          formatter: edge.label ?? edge.edgeType.replace(/_/g, ' '),
          color: colors['--ha-text-primary'],
          backgroundColor: colors['--ha-surface-raised'],
          borderColor: colors['--ha-border'],
          borderWidth: 1,
          borderRadius: 3,
          padding: [3, 5],
          fontSize: 9,
        },
        emphasis: { label: { show: true }, lineStyle: { color: colors['--ha-primary'], width: 3, opacity: 1 } },
        _edge: edge,
      })),
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      emphasis: { focus: 'adjacency', scale: false },
      z: 3,
    }, {
      id: `relationship-flow-${fitRevision}`,
      type: 'lines',
      coordinateSystem: 'cartesian2d',
      silent: true,
      animation: !paused && !reducedMotion,
      lineStyle: { opacity: 0, curveness: 0.08 },
      data: edges.filter((edge) => edge.directed !== false).flatMap((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return [];
        const selected = selectedEdgeId === edge.id;
        return [{
          name: edge.label ?? edge.edgeType.replace(/_/g, ' '),
          coords: [source, target],
          effect: {
            show: !paused && !reducedMotion,
            constantSpeed: selected ? 28 : 17,
            symbol: 'arrow',
            symbolSize: selected ? 8 : 6,
            trailLength: selected ? 0.14 : 0.07,
            color: colors['--ha-primary'],
          },
        }];
      }),
      z: 5,
    }, {
      id: `relationship-labels-${fitRevision}`,
      type: 'scatter',
      coordinateSystem: 'cartesian2d',
      silent: true,
      animation: false,
      symbol: 'circle',
      symbolSize: 2,
      itemStyle: { color: colors['--ha-surface-primary'] },
      data: nodes.map((node) => {
        const [x, y] = positions.get(node.id) ?? [50, 50];
        return { value: [x, y], name: node.entityValue };
      }),
      label: {
        show: true,
        position: 'bottom',
        distance: 20,
        formatter: '{b}',
        width: 112,
        overflow: 'truncate',
        color: colors['--ha-text-secondary'],
        fontSize: 10,
        fontWeight: 520,
      },
      z: 6,
    }],
  });
  }, [colors, edges, fitRevision, manualPositions, nodes, paused, reducedMotion, selectedEdgeId, selectedNodeId, severityColor, zoom]);

  const persistDraggedPositions = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const originalPositions = buildNodePositions(nodes, edges);
    const chartModel = (chart as unknown as {
      getModel: () => { getSeriesByIndex: (index: number) => unknown };
    }).getModel();
    const graphSeries = chartModel.getSeriesByIndex(0) as {
      getData: () => {
        count: () => number;
        getId: (index: number) => string;
        getItemLayout: (index: number) => unknown;
      };
    };
    const graphData = graphSeries.getData();

    setManualPositions((current) => {
      const next = new Map(current);
      let changed = false;

      for (let index = 0; index < graphData.count(); index += 1) {
        const layout = graphData.getItemLayout(index);
        if (!Array.isArray(layout) || typeof layout[0] !== 'number' || typeof layout[1] !== 'number') continue;
        const converted = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, layout);
        if (!Array.isArray(converted) || !Number.isFinite(converted[0]) || !Number.isFinite(converted[1])) continue;

        const nodeId = graphData.getId(index);
        const nextPosition: NodePosition = [
          Math.max(3, Math.min(97, converted[0])),
          Math.max(3, Math.min(97, converted[1])),
        ];
        const existing = current.get(nodeId) ?? originalPositions.get(nodeId);
        if (existing && Math.abs(existing[0] - nextPosition[0]) < .1 && Math.abs(existing[1] - nextPosition[1]) < .1) continue;
        next.set(nodeId, nextPosition);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [edges, nodes]);

  dragSyncRef.current = persistDraggedPositions;

  const syncDraggedPositions = useCallback(() => dragSyncRef.current(), []);

  const handleChartReady = useCallback((readyChart: unknown) => {
    const chart = readyChart as ECharts;
    chartRef.current = chart;
    const renderer = chart.getZr();
    if (!renderer) return;
    renderer.off('mouseup', syncDraggedPositions);
    renderer.on('mouseup', syncDraggedPositions);
  }, [syncDraggedPositions]);

  useEffect(() => () => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    chart.getZr()?.off('mouseup', syncDraggedPositions);
  }, [syncDraggedPositions]);

  return (
    <div className="constellation-canvas" aria-label="Threat relationship graph workspace">
      <HaChart
        option={option}
        notMerge
        lazyUpdate
        onChartReady={handleChartReady}
        onChartClick={(params) => {
          const data = (params as { data?: { _node?: GraphNodeDTO; _edge?: GraphEdgeDTO } }).data;
          if (data?._node) onNodeClick(data._node.id);
          else if (data?._edge) onEdgeClick(data._edge.id);
        }}
        ariaLabel="Threat constellation relationship graph"
        ariaDescription={`${nodes.length} entities and ${edges.length} evidence-backed relationships. Use the adjacent entity list for complete keyboard navigation.`}
      />
    </div>
  );
}
