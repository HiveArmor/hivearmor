/**
 * RelationshipGraphPanel — Sprint 46
 * ECharts force-directed graph showing the entity at center
 * with connected entities. Edge thickness represents relationship strength.
 * Click on a node to navigate to its dossier.
 */

import { lazy, Suspense, useCallback } from 'react';

import { Spinner } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { getRelationships } from '../services/dossier.service';
import type { EntityRelationship } from '../types/dossier.types';

import './RelationshipGraphPanel.css';

const HaChart = lazy(() =>
  import('@/components/ha-chart/HaChart').then(m => ({ default: m.HaChart })),
);

export interface RelationshipGraphPanelProps {
  entityId: string;
}

function getRiskColor(level: string): string {
  switch (level) {
    case 'critical': return 'var(--ha-severity-critical)';
    case 'high': return 'var(--ha-severity-high)';
    case 'medium': return 'var(--ha-severity-medium)';
    case 'low': return 'var(--ha-severity-low)';
    default: return 'var(--ha-foreground-tertiary)';
  }
}

function buildGraphOption(entityId: string, relationships: EntityRelationship[]): EChartsOption {
  const nodes: Array<{
    id: string;
    name: string;
    symbolSize: number;
    itemStyle: { color: string };
    category: number;
  }> = [];
  const links: Array<{
    source: string;
    target: string;
    lineStyle: { width: number; opacity: number };
    label?: { show: boolean; formatter: string };
  }> = [];

  // Center node
  nodes.push({
    id: entityId,
    name: entityId,
    symbolSize: 40,
    itemStyle: { color: 'var(--ha-action-primary)' },
    category: 0,
  });

  const seen = new Set<string>([entityId]);

  for (const rel of relationships) {
    const related = rel.relatedEntity;
    if (!seen.has(related.id)) {
      seen.add(related.id);
      nodes.push({
        id: related.id,
        name: `${related.value} (${related.type})`,
        symbolSize: 20 + Math.min(20, rel.eventCount / 5),
        itemStyle: { color: getRiskColor(related.riskLevel) },
        category: 1,
      });
    }

    links.push({
      source: rel.direction === 'inbound' ? related.id : entityId,
      target: rel.direction === 'inbound' ? entityId : related.id,
      lineStyle: {
        width: 1 + rel.strength * 4,
        opacity: 0.6,
      },
      label: {
        show: false,
        formatter: rel.relationshipType.replace(/_/g, ' '),
      },
    });
  }

  return {
    animation: true,
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { dataType?: string; data?: { name?: string; label?: { formatter?: string } } };
        if (p.dataType === 'edge') return p.data?.label?.formatter ?? '';
        return p.data?.name ?? '';
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      force: {
        repulsion: 300,
        edgeLength: [80, 200],
        gravity: 0.1,
      },
      data: nodes,
      links,
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 8,
      label: {
        show: true,
        fontSize: 10,
        position: 'bottom',
      },
      lineStyle: {
        curveness: 0.1,
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 4 },
      },
      categories: [
        { name: 'Primary Entity' },
        { name: 'Related Entity' },
      ],
    }],
  };
}

export function RelationshipGraphPanel({ entityId }: RelationshipGraphPanelProps): JSX.Element {
  const navigate = useNavigate();

  const relQuery = useQuery({
    queryKey: ['entity-relationships', entityId],
    queryFn: ({ signal }) => getRelationships(entityId, { limit: 50 }, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const handleChartClick = useCallback((params: unknown) => {
    const p = params as { dataType?: string; data?: { id?: string } };
    if (p.dataType === 'node' && p.data?.id && p.data.id !== entityId) {
      navigate(`/entities/${encodeURIComponent(p.data.id)}/dossier`);
    }
  }, [entityId, navigate]);

  const relationships = relQuery.data?.items ?? [];
  const graphOption = buildGraphOption(entityId, relationships);

  return (
    <section className="ha-relationship-panel">
      <header className="ha-relationship-panel__header">
        <GitBranch size={14} />
        <h2>Entity Relationships</h2>
        <span className="ha-relationship-panel__total">
          {relQuery.data?.total ?? 0} connections
        </span>
      </header>

      {relQuery.isLoading ? (
        <div className="ha-relationship-panel__loading">
          <Spinner size="md" aria-label="Loading relationships" />
        </div>
      ) : relationships.length === 0 ? (
        <div className="ha-relationship-panel__empty">
          <p>No relationships found for this entity.</p>
        </div>
      ) : (
        <div className="ha-relationship-panel__graph">
          <Suspense fallback={<Spinner size="md" aria-label="Loading chart" />}>
            <HaChart
              option={graphOption}
              height={400}
              onChartClick={handleChartClick}
              ariaLabel="Entity relationship graph"
              ariaDescription="Force-directed graph showing entity connections"
            />
          </Suspense>
        </div>
      )}

      {relationships.length > 0 && (
        <div className="ha-relationship-panel__list">
          {relationships.map(rel => (
            <div key={rel.id} className="ha-relationship-panel__item">
              <span className="ha-relationship-panel__entity-value">{rel.relatedEntity.value}</span>
              <span className="ha-relationship-panel__rel-type">
                {rel.relationshipType.replace(/_/g, ' ')}
              </span>
              <span className="ha-relationship-panel__direction">{rel.direction}</span>
              <span className="ha-relationship-panel__strength">
                {(rel.strength * 100).toFixed(0)}%
              </span>
              <span className="ha-relationship-panel__events">{rel.eventCount} events</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
