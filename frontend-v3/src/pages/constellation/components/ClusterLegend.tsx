/**
 * ClusterLegend — color-coded legend for detected clusters.
 */

import type { Cluster } from '../types/constellation.types';

interface ClusterLegendProps {
  clusters: Cluster[];
}

export function ClusterLegend({ clusters }: ClusterLegendProps): JSX.Element | null {
  if (clusters.length === 0) return null;

  return (
    <div className="ha-cluster-legend" aria-label="Cluster legend">
      <h4 className="ha-cluster-legend__title">Clusters</h4>
      <ul className="ha-cluster-legend__list">
        {clusters.map((cluster) => (
          <li key={cluster.id} className="ha-cluster-legend__item">
            <span
              className="ha-cluster-legend__swatch"
              style={{ backgroundColor: cluster.color }}
              aria-hidden="true"
            />
            <span className="ha-cluster-legend__label">
              {cluster.label}
            </span>
            <span className="ha-cluster-legend__count">
              {cluster.nodeCount} nodes
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
