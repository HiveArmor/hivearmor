/**
 * EntityGraphPanel — Force-directed entity relationship graph visualization.
 *
 * Renders nodes (host, user, ip, process, file, domain) and directed edges
 * using ECharts graph type with force layout. Node size scales with riskScore,
 * edge style varies by strength (solid/dashed/dotted).
 *
 * Subtasks: 8.1–8.11
 */

import { useMemo, useState } from 'react';

import type { EChartsOption } from 'echarts';

import type { EntityGraphResponse, GraphEdge, GraphNode } from '../alertInvestigation.types';

import { HaChart } from '@/components/ha-chart/HaChart';

// ---------------------------------------------------------------------------
// CSS variable → runtime colour resolution
// ---------------------------------------------------------------------------

type NodeType = 'host' | 'user' | 'ip' | 'process' | 'file' | 'domain';

const NODE_TYPE_TOKEN_MAP: Record<NodeType, string> = {
  host: '--ha-action-primary',
  user: '--ha-intelligence-primary',
  ip: '--ha-severity-high',
  process: '--ha-severity-low',
  file: '--ha-severity-medium',
  domain: '--ha-severity-info',
};

function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resolveNodeColor(type: string): string {
  const token = NODE_TYPE_TOKEN_MAP[type as NodeType];
  if (!token) return resolveToken('--ha-foreground-secondary');
  return resolveToken(token);
}

const NODE_ICON_PATHS: Record<NodeType, string> = {
  host: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ip: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.4 10.8 15M15.8 7.4 13.2 15M8.5 6h7"/>',
  process: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  domain: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
};

function entitySymbol(type: NodeType, color: string): string {
  const contrast = resolveToken('--ha-surface-app');
  const icon = NODE_ICON_PATHS[type];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${color}"/><g fill="none" stroke="${contrast}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</g></svg>`;
  return `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Node size by risk score
// ---------------------------------------------------------------------------

function nodeSizeFromRisk(riskScore: number): number {
  if (riskScore >= 70) return 40;
  if (riskScore >= 30) return 30;
  return 20;
}

// ---------------------------------------------------------------------------
// Edge line style by strength
// ---------------------------------------------------------------------------

function edgeLineType(strength: string): 'solid' | 'dashed' | [number, number] {
  switch (strength) {
    case 'strong':
      return 'solid';
    case 'moderate':
      return 'dashed';
    case 'weak':
      return [2, 4]; // dotted equivalent in ECharts
    default:
      return 'dashed';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DataUnavailableRetry({ label, onRetry }: { label: string; onRetry: () => void }): JSX.Element {
  return (
    <div className="alert-data-unavailable" style={{ flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px' }}>
      <div style={{ textAlign: 'center' }}>
        <strong>{label} unavailable</strong>
        <p style={{ margin: '4px 0 0', color: 'var(--ha-foreground-tertiary)', fontSize: '12px' }}>
          Failed to load entity relationship data. This may be a transient issue.
        </p>
      </div>
      <button
        type="button"
        className="alert-command-button"
        onClick={onRetry}
        style={{ fontSize: '12px' }}
      >
        Retry
      </button>
    </div>
  );
}

function GraphSkeleton(): JSX.Element {
  return (
    <div
      className="alert-investigation-skeleton"
      style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      aria-busy="true"
      aria-label="Building entity graph"
    >
      <span style={{ color: 'var(--ha-foreground-tertiary)', fontSize: '12px' }}>Building entity graph…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail sidebar
// ---------------------------------------------------------------------------

function NodeDetailSidebar({ node, onClose }: { node: GraphNode; onClose: () => void }): JSX.Element {
  const color = resolveNodeColor(node.type);
  const riskPercent = Math.max(0, Math.min(100, node.riskScore));

  return (
    <aside
      className="entity-graph-sidebar"
      aria-label={`Details for ${node.label}`}
      style={{
        width: '280px',
        minWidth: '280px',
        borderLeft: '1px solid var(--ha-border-default)',
        padding: '16px',
        overflow: 'auto',
        background: 'var(--ha-surface-panel)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <strong style={{ color: 'var(--ha-foreground-primary)', fontSize: '14px' }}>{node.label}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail sidebar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ha-foreground-tertiary)' }}
        >
          ✕
        </button>
      </div>

      {/* Type badge */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            color,
          }}
        >
          {node.type}
        </span>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            background: 'var(--ha-surface-elevated)',
            color: 'var(--ha-foreground-secondary)',
          }}
        >
          {node.role}
        </span>
      </div>

      {/* Risk score meter */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ha-foreground-secondary)' }}>Risk score</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-foreground-primary)' }}>{node.riskScore}/100</span>
        </div>
        <div
          style={{
            height: '6px',
            background: 'var(--ha-surface-elevated)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${riskPercent}%`,
              background: riskPercent >= 70
                ? 'var(--ha-severity-critical)'
                : riskPercent >= 30
                  ? 'var(--ha-severity-high)'
                  : 'var(--ha-severity-low)',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Metadata fields */}
      <div style={{ borderTop: '1px solid var(--ha-border-subtle)', paddingTop: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-foreground-secondary)', marginBottom: '8px', display: 'block' }}>
          Metadata
        </span>
        <dl style={{ margin: 0 }}>
          {Object.entries(node.metadata).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--ha-border-subtle)' }}>
              <dt style={{ fontSize: '11px', color: 'var(--ha-foreground-tertiary)' }}>{key}</dt>
              <dd style={{ fontSize: '11px', color: 'var(--ha-foreground-primary)', margin: 0, textAlign: 'right', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

const ALL_NODE_TYPES: NodeType[] = ['host', 'user', 'ip', 'process', 'file', 'domain'];

function FilterControls({
  visibleTypes,
  onToggle,
}: {
  visibleTypes: Set<NodeType>;
  onToggle: (type: NodeType) => void;
}): JSX.Element {
  return (
    <fieldset
      style={{
        border: 'none',
        padding: '8px 12px',
        margin: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      <legend style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ha-foreground-secondary)', padding: 0, marginBottom: '4px' }}>
        Filter by type
      </legend>
      {ALL_NODE_TYPES.map((type) => (
        <label
          key={type}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--ha-foreground-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={visibleTypes.has(type)}
            onChange={() => onToggle(type)}
            style={{ accentColor: resolveNodeColor(type) }}
          />
          {type}
        </label>
      ))}
      <span
        aria-label="Arrows show observed relationship direction"
        style={{
          marginLeft: 'auto',
          color: 'var(--ha-foreground-tertiary)',
          fontSize: '10px',
          whiteSpace: 'nowrap',
        }}
      >
        Arrow = observed direction · select a node for context
      </span>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface EntityGraphPanelProps {
  data: EntityGraphResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function EntityGraphPanel({ data, isLoading, isError, onRetry }: EntityGraphPanelProps): JSX.Element {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(() => new Set(ALL_NODE_TYPES));

  const toggleType = (type: NodeType): void => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Filter nodes and edges based on visible types
  const filteredNodes = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter((n) => visibleTypes.has(n.type as NodeType));
  }, [data, visibleTypes]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter(
      (e) => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId)
    );
  }, [data, filteredNodeIds]);

  // Build ECharts option
  const chartOption: EChartsOption = useMemo(() => {
    if (filteredNodes.length === 0) {
      return { series: [] };
    }

    const echartsNodes = filteredNodes.map((n) => {
      const color = resolveNodeColor(n.type);
      return {
      id: n.id,
      name: n.label,
      symbol: entitySymbol(n.type as NodeType, color),
      symbolSize: nodeSizeFromRisk(n.riskScore),
      category: n.type,
      itemStyle: {
        color,
      },
      label: {
        show: true,
        fontSize: 10,
        color: resolveToken('--ha-foreground-primary'),
      },
      value: n.riskScore,
      };
    });

    const echartsEdges = filteredEdges.map((e: GraphEdge) => ({
      id: e.id,
      name: e.type.replace(/_/g, ' '),
      source: e.sourceId,
      target: e.targetId,
      lineStyle: {
        type: edgeLineType(e.strength),
        color: resolveToken('--ha-foreground-tertiary'),
        opacity: e.strength === 'weak' ? 0.5 : 0.78,
        width: e.strength === 'strong' ? 2.2 : 1.4,
      },
      label: {
        show: false,
        formatter: e.type.replace(/_/g, ' '),
        fontSize: 9,
        color: resolveToken('--ha-foreground-tertiary'),
      },
      emphasis: {
        label: {
          show: true,
        },
      },
    }));

    const categories = ALL_NODE_TYPES
      .filter((t) => visibleTypes.has(t))
      .map((t) => ({ name: t }));

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: resolveToken('--ha-surface-elevated'),
        borderColor: resolveToken('--ha-border-default'),
        textStyle: {
          color: resolveToken('--ha-foreground-primary'),
          fontSize: 11,
        },
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: { id?: string; name?: string }; name?: string };
          if (p.dataType === 'edge') {
            const edgeData = p.data;
            const edge = filteredEdges.find((candidate) => candidate.id === edgeData?.id);
            const evidence = edge?.evidence ? `<br/><span>${edge.evidence}</span>` : '';
            return `<strong>${edgeData?.name ?? 'Relationship'}</strong>${evidence}`;
          }
          return p.name ?? '';
        },
      },
      legend: {
        show: false,
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          data: echartsNodes,
          links: echartsEdges,
          categories,
          roam: true,
          draggable: true,
          force: {
            repulsion: 300,
            gravity: 0.1,
            edgeLength: [80, 200],
            layoutAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [0, 11],
          cursor: 'pointer',
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
            },
          },
          label: {
            position: 'bottom',
            distance: 5,
          },
          lineStyle: {
            curveness: 0.1,
          },
        },
      ],
      backgroundColor: 'transparent',
    };
  }, [filteredNodes, filteredEdges, visibleTypes]);

  // Click handler — resolve node from chart click params
  const handleChartClick = (params: unknown): void => {
    const p = params as { dataType?: string; dataIndex?: number };
    if (p.dataType === 'node' && typeof p.dataIndex === 'number') {
      const node = filteredNodes[p.dataIndex];
      if (node) setSelectedNode(node);
    }
  };

  // --- Render states ---

  if (isLoading) return <GraphSkeleton />;
  if (isError) return <DataUnavailableRetry label="Entity graph" onRetry={onRetry} />;
  if (!data || data.nodes.length === 0) {
    return (
      <div className="alert-data-unavailable">
        <strong>No entity relationships found</strong>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <FilterControls visibleTypes={visibleTypes} onToggle={toggleType} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HaChart
            option={chartOption}
            height={380}
            onChartClick={handleChartClick}
            ariaLabel="Entity relationship graph showing connections between hosts, users, IPs, processes, files, and domains"
            ariaDescription={`Graph with ${filteredNodes.length} nodes and ${filteredEdges.length} edges`}
          />
        </div>
        {selectedNode && (
          <NodeDetailSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
      {data.metadata.truncated && (
        <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--ha-foreground-tertiary)', borderTop: '1px solid var(--ha-border-subtle)' }}>
          Graph truncated — showing {data.metadata.totalNodes} of available nodes and {data.metadata.totalEdges} edges.
        </div>
      )}
    </div>
  );
}
