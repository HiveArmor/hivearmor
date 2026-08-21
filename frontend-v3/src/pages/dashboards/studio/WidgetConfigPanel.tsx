/**
 * WidgetConfigPanel — Right-side config drawer for selected widget
 * Session S32 — Dashboard Studio config panel
 */

import { useState } from 'react';

import { TimesIcon } from '@patternfly/react-icons';

import type { WidgetType } from './widgetTypes.constants';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  name: string;
  description: string;
  // Type-specific config
  visualizationId?: number;
  chartType?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  label?: string;
  trendIndicator?: boolean;
  maxRows?: number;
  severityFilter?: string[];
  statusFilter?: string[];
  content?: string;
  fontSize?: 'small' | 'medium' | 'large';
  feedType?: 'EPS_COUNTER' | 'LIVE_ALERT_COUNT';
  displayStyle?: 'METRIC_TILE' | 'MINI_CHART';
}

export interface WidgetConfigPanelProps {
  widget: WidgetConfig | null;
  onClose: () => void;
  onSave: (config: WidgetConfig) => void;
}

export function WidgetConfigPanel({ widget, onClose, onSave }: WidgetConfigPanelProps): JSX.Element {
  const [localConfig, setLocalConfig] = useState<WidgetConfig | null>(widget);

  if (!widget || !localConfig) return <></>;

  const handleFieldChange = (field: keyof WidgetConfig, value: unknown): void => {
    setLocalConfig((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleSave = (): void => {
    if (localConfig) {
      onSave(localConfig);
      onClose();
    }
  };

  const renderTypeSpecificFields = (): JSX.Element => {
    switch (widget.type) {
      case 'CHART':
        return (
          <>
            <FormGroup label="Visualization">
              <select
                value={localConfig.visualizationId ?? ''}
                onChange={(e) => handleFieldChange('visualizationId', Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Select visualization</option>
                {/* TODO: Populate from GET /api/ha-visualizations */}
              </select>
            </FormGroup>
            <FormGroup label="Chart Type">
              <select
                value={localConfig.chartType ?? 'Line'}
                onChange={(e) => handleFieldChange('chartType', e.target.value)}
                style={inputStyle}
              >
                <option value="Line">Line</option>
                <option value="Bar">Bar</option>
                <option value="Pie">Pie</option>
                <option value="Area">Area</option>
              </select>
            </FormGroup>
            <FormGroup label="X-Axis Label">
              <input
                type="text"
                value={localConfig.xAxisLabel ?? ''}
                onChange={(e) => handleFieldChange('xAxisLabel', e.target.value)}
                style={inputStyle}
              />
            </FormGroup>
            <FormGroup label="Y-Axis Label">
              <input
                type="text"
                value={localConfig.yAxisLabel ?? ''}
                onChange={(e) => handleFieldChange('yAxisLabel', e.target.value)}
                style={inputStyle}
              />
            </FormGroup>
            <FormGroup label="Show Legend">
              <input
                type="checkbox"
                checked={localConfig.showLegend ?? true}
                onChange={(e) => handleFieldChange('showLegend', e.target.checked)}
              />
            </FormGroup>
          </>
        );

      case 'METRIC':
        return (
          <>
            <FormGroup label="Visualization">
              <select
                value={localConfig.visualizationId ?? ''}
                onChange={(e) => handleFieldChange('visualizationId', Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Select visualization</option>
                {/* TODO: Populate from GET /api/ha-visualizations */}
              </select>
            </FormGroup>
            <FormGroup label="Label Override">
              <input
                type="text"
                value={localConfig.label ?? ''}
                onChange={(e) => handleFieldChange('label', e.target.value)}
                style={inputStyle}
              />
            </FormGroup>
            <FormGroup label="Trend Indicator">
              <input
                type="checkbox"
                checked={localConfig.trendIndicator ?? true}
                onChange={(e) => handleFieldChange('trendIndicator', e.target.checked)}
              />
            </FormGroup>
          </>
        );

      case 'ALERT_TABLE':
        return (
          <>
            <FormGroup label="Max Rows">
              <input
                type="number"
                min={5}
                max={50}
                value={localConfig.maxRows ?? 20}
                onChange={(e) => handleFieldChange('maxRows', Number(e.target.value))}
                style={inputStyle}
              />
            </FormGroup>
            <FormGroup label="Severity Filter">
              <select
                multiple
                value={localConfig.severityFilter ?? []}
                onChange={(e) =>
                  handleFieldChange(
                    'severityFilter',
                    Array.from(e.target.selectedOptions, (option) => option.value)
                  )
                }
                style={{ ...inputStyle, height: '80px' }}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </FormGroup>
            <FormGroup label="Status Filter">
              <select
                multiple
                value={localConfig.statusFilter ?? []}
                onChange={(e) =>
                  handleFieldChange(
                    'statusFilter',
                    Array.from(e.target.selectedOptions, (option) => option.value)
                  )
                }
                style={{ ...inputStyle, height: '80px' }}
              >
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </FormGroup>
          </>
        );

      case 'TEXT':
        return (
          <>
            <FormGroup label="Content (Markdown)">
              <textarea
                value={localConfig.content ?? ''}
                onChange={(e) => handleFieldChange('content', e.target.value)}
                maxLength={2000}
                rows={10}
                style={{ ...inputStyle, fontFamily: 'var(--ha-font-mono)', resize: 'vertical' }}
              />
            </FormGroup>
            <FormGroup label="Font Size">
              <select
                value={localConfig.fontSize ?? 'medium'}
                onChange={(e) => handleFieldChange('fontSize', e.target.value)}
                style={inputStyle}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </FormGroup>
          </>
        );

      case 'LIVE_FEED':
        return (
          <>
            <FormGroup label="Feed Type">
              <select
                value={localConfig.feedType ?? 'EPS_COUNTER'}
                onChange={(e) => handleFieldChange('feedType', e.target.value)}
                style={inputStyle}
              >
                <option value="EPS_COUNTER">EPS Counter</option>
                <option value="LIVE_ALERT_COUNT">Live Alert Count</option>
              </select>
            </FormGroup>
            <FormGroup label="Display Style">
              <select
                value={localConfig.displayStyle ?? 'METRIC_TILE'}
                onChange={(e) => handleFieldChange('displayStyle', e.target.value)}
                style={inputStyle}
              >
                <option value="METRIC_TILE">Metric Tile</option>
                <option value="MINI_CHART">Mini Chart (sparkline)</option>
              </select>
            </FormGroup>
          </>
        );

      default:
        return <></>;
    }
  };

  return (
    <div
      style={{
        width: '320px',
        backgroundColor: 'var(--ha-surface-primary)',
        borderLeft: '1px solid var(--ha-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--ha-border)',
          backgroundColor: 'var(--ha-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          {widget.type} Configuration
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: 'var(--ha-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close config panel"
        >
          <TimesIcon />
        </button>
      </div>

      {/* Form body */}
      <div style={{ padding: '16px', flex: 1, overflow: 'auto' }}>
        <FormGroup label="Widget Name" required>
          <input
            type="text"
            value={localConfig.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            maxLength={80}
            style={inputStyle}
            required
          />
        </FormGroup>

        <FormGroup label="Description">
          <textarea
            value={localConfig.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            maxLength={200}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </FormGroup>

        {renderTypeSpecificFields()}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--ha-border)',
          backgroundColor: 'var(--ha-surface-raised)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '8px 16px',
            fontSize: 'var(--ha-text-base)',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            backgroundColor: 'var(--ha-surface-primary)',
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!localConfig.name.trim()}
          style={{
            flex: 1,
            padding: '8px 16px',
            fontSize: 'var(--ha-text-base)',
            border: '1px solid var(--ha-primary)',
            borderRadius: '4px',
            backgroundColor: 'var(--ha-primary)',
            color: 'var(--ha-foreground-on-action)',
            cursor: localConfig.name.trim() ? 'pointer' : 'not-allowed',
            opacity: localConfig.name.trim() ? 1 : 0.5,
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// Helper component for form groups
interface FormGroupProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

function FormGroup({ label, required, children }: FormGroupProps): JSX.Element {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 500,
          color: 'var(--ha-text-primary)',
          marginBottom: '4px',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--ha-critical)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  fontSize: 'var(--ha-text-base)',
  backgroundColor: 'var(--ha-surface-raised)',
  border: '1px solid var(--ha-border)',
  borderRadius: '4px',
  color: 'var(--ha-text-primary)',
};
