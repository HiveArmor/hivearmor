/**
 * GraphControlsBar — zoom in/out/fit, layout options, entity type filter toggles,
 * confidence slider, export (PNG/SVG).
 */

import { useCallback, useRef } from 'react';

import type { LayoutMode } from '../types/constellation.types';

interface GraphControlsBarProps {
  layout: LayoutMode;
  confidenceFilter: number;
  entityTypeFilters: string[];
  onLayoutChange: (layout: LayoutMode) => void;
  onConfidenceChange: (threshold: number) => void;
  onToggleEntityType: (type: string) => void;
}

const LAYOUT_OPTIONS: Array<{ value: LayoutMode; label: string }> = [
  { value: 'force', label: 'Force' },
  { value: 'circular', label: 'Circular' },
  { value: 'hierarchical', label: 'Hierarchical' },
];

const ENTITY_TYPES = ['host', 'user', 'ip', 'process', 'file', 'domain'];

export function GraphControlsBar({
  layout,
  confidenceFilter,
  entityTypeFilters,
  onLayoutChange,
  onConfidenceChange,
  onToggleEntityType,
}: GraphControlsBarProps): JSX.Element {
  const canvasRef = useRef<HTMLElement | null>(null);

  const handleExport = useCallback((format: 'png' | 'svg') => {
    // ECharts export uses the chart instance; find it via DOM
    const chartContainer = canvasRef.current?.closest('.ha-constellation-page')?.querySelector('.ha-constellation-canvas canvas');
    if (chartContainer instanceof HTMLCanvasElement) {
      const dataUrl = chartContainer.toDataURL(`image/${format}`);
      const link = document.createElement('a');
      link.download = `constellation-export.${format}`;
      link.href = dataUrl;
      link.click();
    }
  }, []);

  return (
    <div className="ha-graph-controls" ref={canvasRef as never} aria-label="Graph controls bar">
      <div className="ha-graph-controls__section">
        <span className="ha-graph-controls__label">Layout</span>
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`ha-graph-controls__btn${layout === opt.value ? ' ha-graph-controls__btn--active' : ''}`}
            onClick={() => onLayoutChange(opt.value)}
            aria-pressed={layout === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="ha-graph-controls__section">
        <span className="ha-graph-controls__label">Entity types</span>
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`ha-graph-controls__filter${entityTypeFilters.includes(type) ? ' ha-graph-controls__filter--active' : ''}`}
            onClick={() => onToggleEntityType(type)}
            aria-pressed={entityTypeFilters.includes(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="ha-graph-controls__section">
        <label className="ha-graph-controls__slider" htmlFor="confidence-slider">
          Confidence ≥ {(confidenceFilter * 100).toFixed(0)}%
        </label>
        <input
          id="confidence-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={confidenceFilter}
          onChange={(e) => onConfidenceChange(Number(e.target.value))}
        />
      </div>

      <div className="ha-graph-controls__section">
        <span className="ha-graph-controls__label">Export</span>
        <button
          type="button"
          className="ha-graph-controls__btn"
          onClick={() => handleExport('png')}
        >
          PNG
        </button>
        <button
          type="button"
          className="ha-graph-controls__btn"
          onClick={() => handleExport('svg')}
        >
          SVG
        </button>
      </div>
    </div>
  );
}
