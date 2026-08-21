/**
 * NodeContextMenu — positioned context menu with pivot links + action buttons.
 * Navigation pivots styled differently from action pivots.
 */

import { useEffect, useRef } from 'react';

import type { GraphNode, GraphPivot } from '../types/constellation.types';

interface NodeContextMenuProps {
  node: GraphNode;
  position: { x: number; y: number };
  onClose: () => void;
}

const NAVIGATION_TYPES = new Set(['dossier', 'hunt', 'alerts', 'incidents']);

function isNavigationPivot(pivot: GraphPivot): boolean {
  return NAVIGATION_TYPES.has(pivot.type);
}

export function NodeContextMenu({ node, position, onClose }: NodeContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const navigationPivots = node.pivots.filter(isNavigationPivot);
  const actionPivots = node.pivots.filter((p) => !isNavigationPivot(p));

  return (
    <div
      ref={menuRef}
      className="ha-context-menu"
      role="menu"
      aria-label={`Actions for ${node.displayName}`}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 1000,
      }}
    >
      <div className="ha-context-menu__header">
        <strong>{node.value}</strong>
        <small>{node.type}</small>
      </div>

      {navigationPivots.length > 0 && (
        <div className="ha-context-menu__section">
          {navigationPivots.map((pivot) => (
            <a
              key={pivot.id}
              href={pivot.route}
              className="ha-context-menu__item ha-context-menu__item--nav"
              role="menuitem"
              onClick={onClose}
            >
              {pivot.label}
            </a>
          ))}
        </div>
      )}

      {actionPivots.length > 0 && (
        <div className="ha-context-menu__section ha-context-menu__section--actions">
          {actionPivots.map((pivot) => (
            <a
              key={pivot.id}
              href={pivot.route}
              className="ha-context-menu__item ha-context-menu__item--action"
              role="menuitem"
              onClick={onClose}
            >
              {pivot.label}
              <small>{pivot.requiredRole}</small>
            </a>
          ))}
        </div>
      )}

      {node.pivots.length === 0 && (
        <div className="ha-context-menu__empty">No actions available</div>
      )}
    </div>
  );
}
