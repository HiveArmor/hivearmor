/**
 * NodeDetailPanel — entity info (type, value, risk badge), alert count,
 * pivots as buttons, "Expand" button for unexpanded nodes.
 */

import type { GraphNode } from '../types/constellation.types';

interface NodeDetailPanelProps {
  node: GraphNode;
  onExpand: (nodeId: string) => void;
  onClose: () => void;
}

function riskBadgeClass(level: string): string {
  return `ha-node-detail__risk-badge ha-node-detail__risk-badge--${level}`;
}

export function NodeDetailPanel({ node, onExpand, onClose }: NodeDetailPanelProps): JSX.Element {
  return (
    <aside className="ha-node-detail" aria-label={`Details for ${node.displayName}`}>
      <header className="ha-node-detail__header">
        <div>
          <small className="ha-node-detail__type">{node.type.toUpperCase()}</small>
          <h4 className="ha-node-detail__value">{node.displayName || node.value}</h4>
          <code className="ha-node-detail__id">{node.entityId}</code>
        </div>
        <button
          type="button"
          className="ha-node-detail__close"
          onClick={onClose}
          aria-label="Close node detail"
        >
          ✕
        </button>
      </header>

      <div className="ha-node-detail__stats">
        <span className={riskBadgeClass(node.riskLevel)}>
          {node.riskScore} — {node.riskLevel}
        </span>
        <span className="ha-node-detail__alerts">
          {node.alertCount} alert{node.alertCount !== 1 ? 's' : ''}
        </span>
      </div>

      {node.pivots.length > 0 && (
        <section className="ha-node-detail__pivots" aria-label="Navigation pivots">
          <h5>Pivots</h5>
          <div className="ha-node-detail__pivot-list">
            {node.pivots.map((pivot) => (
              <a
                key={pivot.id}
                href={pivot.route}
                className={`ha-node-detail__pivot ha-node-detail__pivot--${pivot.type}`}
                title={pivot.label}
              >
                {pivot.label}
              </a>
            ))}
          </div>
        </section>
      )}

      {node.expandable && !node.expanded && (
        <button
          type="button"
          className="ha-node-detail__expand"
          onClick={() => onExpand(node.id)}
        >
          Expand connections
        </button>
      )}

      {node.expanded && (
        <p className="ha-node-detail__expanded-note">Node already expanded</p>
      )}
    </aside>
  );
}
