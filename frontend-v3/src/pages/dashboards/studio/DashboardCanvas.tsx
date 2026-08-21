/**
 * DashboardCanvas — GridStack.js 13 wrapper for widget layout
 * Session S32 — Dashboard Studio canvas
 */

import { useEffect, useRef } from 'react';

import type { GridStack as GridStackType } from 'gridstack';

import 'gridstack/dist/gridstack.min.css';

export interface WidgetPosition {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardCanvasProps {
  widgets: WidgetPosition[];
  staticGrid?: boolean;
  onWidgetMoved?: (id: string, x: number, y: number) => void;
  onWidgetResized?: (id: string, w: number, h: number) => void;
  onWidgetRemoved?: (id: string) => void;
  children: React.ReactNode;
}

export function DashboardCanvas({
  staticGrid = false,
  onWidgetMoved,
  onWidgetResized,
  onWidgetRemoved,
  children,
}: DashboardCanvasProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridStackRef = useRef<GridStackType | null>(null);

  useEffect(() => {
    if (!gridRef.current) return;

    // Lazy-load GridStack
    import('gridstack').then(({ GridStack }) => {
      if (gridStackRef.current) {
        gridStackRef.current.destroy(false);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const gridElement = gridRef.current!;
      gridStackRef.current = GridStack.init(
        {
          column: 12,
          cellHeight: 60,
          animate: true,
          staticGrid,
          resizable: { handles: 'e,s,se' },
          draggable: { handle: '.widget-drag-handle' },
          float: false,
        },
        gridElement
      );

      // Event handlers
      if (onWidgetMoved && gridStackRef.current) {
        gridStackRef.current.on('change', (_event, items) => {
          items?.forEach((item) => {
            if (item.id && item.x !== undefined && item.y !== undefined) {
              onWidgetMoved(item.id, item.x, item.y);
            }
          });
        });
      }

      if (onWidgetResized && gridStackRef.current) {
        gridStackRef.current.on('resizestop', (_event, el) => {
          const node = el.gridstackNode;
          if (node?.id && node.w !== undefined && node.h !== undefined) {
            onWidgetResized(node.id, node.w, node.h);
          }
        });
      }

      if (onWidgetRemoved && gridStackRef.current) {
        gridStackRef.current.on('removed', (_event, items) => {
          items?.forEach((item) => {
            if (item.id) {
              onWidgetRemoved(item.id);
            }
          });
        });
      }
    });

    return () => {
      if (gridStackRef.current) {
        gridStackRef.current.destroy(false);
        gridStackRef.current = null;
      }
    };
  }, [staticGrid, onWidgetMoved, onWidgetResized, onWidgetRemoved]);

  // Update static mode without recreating grid
  useEffect(() => {
    if (gridStackRef.current) {
      gridStackRef.current.setStatic(staticGrid);
    }
  }, [staticGrid]);

  return (
    <div
      ref={gridRef}
      className="grid-stack"
      style={{
        backgroundColor: 'var(--ha-background)',
        minHeight: '100%',
        padding: '16px',
      }}
    >
      {children}
    </div>
  );
}
