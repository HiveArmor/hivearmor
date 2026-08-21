/**
 * Sprint 44 — Entity Graph Panel.
 * Force-directed graph rendering entities as nodes with risk-colored borders,
 * edges with relationship type labels. Uses ECharts graph type.
 */

import { useMemo } from 'react';

import ReactEChartsCore from 'echarts-for-react';

import type { RelationshipGraph } from '../types/correlation.types';

function getRiskColor(riskScore: number): string {
  if (riskScore >= 90) return 'var(--ha-severity-critical)';
  if (riskScore >= 75) return 'var(--ha-severity-high)';
  if (riskScore >= 50) return 'var(--ha-severity-medium)';
  return 'var(--ha-severity-low)';
}

function getEntitySymbol(type: string): string {
  switch (type) {
    case 'ip': return 'circle';
    case 'host': return 'rect';
    case 'user': return 'diamond';
    case 'process': return 'triangle';
    case 'file': return 'pin';
    case 'domain': return 'roundRect';
    default: return 'circle';
  }
}

export interface EntityGraphPanelProps {
  graph: RelationshipGraph;
}

export function EntityGraphPanel({ graph }: EntityGraphPanelProps): JSX.Element {
  const option = useMemo(() => {
    const nodes = graph.nodes.map((node) => ({
      id: node.id,
      name: node.value,
      symbol: getEntitySymbol(node.type),
      symbolSize: Math.max(30, Math.min(60, node.riskScore * 0.6)),
      itemStyle: {
        borderColor: getRiskColor(node.riskScore),
        borderWidth: 3,
        color: 'var(--ha-surface-elevated)',
      },
      label: {
        show: true,
        formatter: `{name|${node.value}}\n{type|${node.type}}`,
        rich: {
          name: {
            fontSize: 11,
            color: 'var(--ha-foreground-primary)',
            lineHeight: 14,
          },
          type: {
            fontSize: 9,
            color: 'var(--ha-foreground-tertiary)',
            lineHeight: 12,
          },
        },
      },
      tooltip: {
        formatter: `<strong>${node.value}</strong><br/>Type: ${node.type}<br/>Risk: ${node.riskScore}`,
      },
    }));

    const edges = graph.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      label: {
        show: true,
        formatter: edge.type.replace(/_/g, ' '),
        fontSize: 9,
        color: 'var(--ha-foreground-secondary)',
      },
      lineStyle: {
        color: 'var(--ha-border-default)',
        width: 1.5,
        type: 'solid' as const,
        curveness: 0.2,
      },
      tooltip: {
        formatter: `${edge.type.replace(/_/g, ' ')}<br/>Evidence: ${edge.evidence.join(', ')}`,
      },
    }));

    return {
      tooltip: { trigger: 'item' as const },
      series: [
        {
          type: 'graph' as const,
          layout: 'force' as const,
          animation: true,
          data: nodes,
          links: edges,
          roam: true,
          draggable: true,
          force: {
            repulsion: 200,
            gravity: 0.1,
            edgeLength: [100, 200],
            layoutAnimation: true,
          },
          emphasis: {
            focus: 'adjacency' as const,
            lineStyle: { width: 3 },
          },
        },
      ],
    };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="entity-graph-panel entity-graph-panel--empty">
        <p>No entity relationships available for this finding.</p>
      </div>
    );
  }

  return (
    <div className="entity-graph-panel">
      <header className="entity-graph-panel__header">
        <h3>Entity Relationship Graph</h3>
        <p>{graph.nodes.length} entities, {graph.edges.length} relationships</p>
      </header>
      <div className="entity-graph-panel__canvas">
        <ReactEChartsCore
          option={option}
          style={{ width: '100%', height: '500px' }}
          notMerge
        />
      </div>
      <footer className="entity-graph-panel__legend">
        <span data-shape="circle">IP</span>
        <span data-shape="rect">Host</span>
        <span data-shape="diamond">User</span>
        <span data-shape="triangle">Process</span>
        <span data-shape="pin">File</span>
        <span data-shape="roundRect">Domain</span>
      </footer>
    </div>
  );
}
