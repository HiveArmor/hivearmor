import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { EntityGraphPanel } from '../../alerts/components/EntityGraphPanel';
import { fetchPivotEntityGraph } from '../searchHunt.service';

export interface PivotEntityGraphProps {
  entityType: 'ip' | 'host' | 'user' | 'process';
  entityId: string;
  onClose: () => void;
}

/**
 * Item C (relationship graph) — show the entity neighbourhood for a selected pivot cell's entity, REUSING
 * the shipped {@link EntityGraphPanel} renderer and the existing entity-graph endpoint. No new graph library
 * and no new backend: the pivot just feeds an entity into the platform's authoritative graph service.
 */
export function PivotEntityGraph({ entityType, entityId, onClose }: PivotEntityGraphProps): JSX.Element {
  const query = useQuery({
    queryKey: ['pivot-entity-graph', entityType, entityId],
    queryFn: ({ signal }) => fetchPivotEntityGraph(entityType, entityId, signal),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="pivot-entity-graph" aria-label={`Relationship graph for ${entityType} ${entityId}`}>
      <div className="pivot-entity-graph__head">
        <span className="pivot-entity-graph__title">Relationships — <code>{entityType}</code> <code>{entityId}</code></span>
        <button type="button" className="pivot-entity-graph__close" onClick={onClose} aria-label="Close relationship graph">
          <X size={13} />
        </button>
      </div>
      <EntityGraphPanel
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    </div>
  );
}
