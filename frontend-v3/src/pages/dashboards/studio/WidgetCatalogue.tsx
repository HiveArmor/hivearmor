/**
 * WidgetCatalogue — Left palette of draggable widget types
 * Session S32 — Dashboard Studio widget palette
 */

import type { WidgetType } from './widgetTypes.constants';
import { WIDGET_TYPES } from './widgetTypes.constants';

export interface WidgetCatalogueProps {
  onAddWidget: (type: WidgetType) => void;
  isCollapsed: boolean;
}

export function WidgetCatalogue({ onAddWidget, isCollapsed }: WidgetCatalogueProps): JSX.Element {
  if (isCollapsed) return <></>;

  return (
    <div
      style={{
        width: '240px',
        backgroundColor: 'var(--ha-surface-primary)',
        borderRight: '1px solid var(--ha-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--ha-border)',
          backgroundColor: 'var(--ha-surface-raised)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--ha-text-md)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
          }}
        >
          Widgets
        </h2>
      </div>

      <div style={{ padding: '8px' }}>
        {WIDGET_TYPES.map((widgetType) => (
          <button
            key={widgetType.type}
            onClick={() => onAddWidget(widgetType.type)}
            onDoubleClick={() => onAddWidget(widgetType.type)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '8px',
              backgroundColor: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ha-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--ha-border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  color: 'var(--ha-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {widgetType.icon}
              </div>
              <span
                style={{
                  fontSize: 'var(--ha-text-base)',
                  fontWeight: 500,
                  color: 'var(--ha-text-primary)',
                }}
              >
                {widgetType.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-text-secondary)',
                lineHeight: '1.4',
              }}
            >
              {widgetType.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
