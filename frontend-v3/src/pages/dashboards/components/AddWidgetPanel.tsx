/**
 * AddWidgetPanel — Placeholder for dashboard studio widget palette
 * This component is used in DSH-03 (Dashboard Studio) edit mode only.
 * Not needed for DSH-02 (Dashboard View) read-only mode.
 */

export interface AddWidgetPanelProps {
  onAddWidget?: (type: 'CHART' | 'TABLE' | 'MAP' | 'METRIC') => void;
}

export function AddWidgetPanel({ onAddWidget }: AddWidgetPanelProps): JSX.Element {
  const widgetTypes: Array<{ type: 'CHART' | 'TABLE' | 'MAP' | 'METRIC'; label: string }> = [
    { type: 'CHART', label: 'Chart' },
    { type: 'METRIC', label: 'Metric' },
    { type: 'TABLE', label: 'Alert Table' },
    { type: 'MAP', label: 'Map' },
  ];

  return (
    <div
      style={{
        width: '240px',
        background: 'var(--ha-surface-primary)',
        borderRight: '1px solid var(--ha-border)',
        padding: '16px',
      }}
    >
      <h3
        style={{
          fontSize: 'var(--ha-text-md)',
          fontWeight: 600,
          color: 'var(--ha-text-primary)',
          marginBottom: '16px',
        }}
      >
        Widgets
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {widgetTypes.map((widget) => (
          <button
            key={widget.type}
            type="button"
            onClick={() => onAddWidget?.(widget.type)}
            style={{
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: '12px',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            {widget.label}
          </button>
        ))}
      </div>
    </div>
  );
}
