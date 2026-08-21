/**
 * BaselineMetricsPanel — Sprint 46
 * Displays current vs baseline metrics with deviation indicators
 * showing how far the entity has deviated from normal behavior.
 */

import { Gauge } from 'lucide-react';

import type { BaselineData } from '../types/dossier.types';

import './BaselineMetricsPanel.css';

export interface BaselineMetricsPanelProps {
  baseline: BaselineData;
}

function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value: number, _unit?: string): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}G`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function BaselineMetricsPanel({ baseline }: BaselineMetricsPanelProps): JSX.Element {
  return (
    <section className="ha-baseline-panel">
      <header className="ha-baseline-panel__header">
        <Gauge size={14} />
        <h2>Baseline Metrics</h2>
        <span className="ha-baseline-panel__period">
          Learning: {baseline.learningPeriod}
        </span>
      </header>

      {baseline.metrics.length === 0 ? (
        <p className="ha-baseline-panel__empty">No baseline metrics available.</p>
      ) : (
        <div className="ha-baseline-panel__metrics">
          {baseline.metrics.map(metric => {
            const ratio = metric.baseline > 0 ? metric.current / metric.baseline : 0;
            const barWidth = Math.min(100, (ratio / 10) * 100);
            return (
              <div key={metric.name} className="ha-baseline-panel__metric" data-status={metric.status}>
                <div className="ha-baseline-panel__metric-header">
                  <span className="ha-baseline-panel__metric-name">{formatMetricName(metric.name)}</span>
                  <span className="ha-baseline-panel__metric-status">{metric.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="ha-baseline-panel__metric-values">
                  <span className="ha-baseline-panel__current">
                    {formatValue(metric.current, metric.unit)}
                  </span>
                  <span className="ha-baseline-panel__separator">vs</span>
                  <span className="ha-baseline-panel__baseline-val">
                    {formatValue(metric.baseline, metric.unit)} baseline
                  </span>
                  <span className="ha-baseline-panel__ratio">
                    {ratio.toFixed(1)}×
                  </span>
                </div>
                <div className="ha-baseline-panel__bar">
                  <i style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {baseline.deviations.length > 0 && (
        <div className="ha-baseline-panel__deviations">
          <h3>Active Deviations</h3>
          {baseline.deviations.map(dev => (
            <div key={dev.metric} className="ha-baseline-panel__deviation" data-significance={dev.significance}>
              <span className="ha-baseline-panel__dev-metric">{formatMetricName(dev.metric)}</span>
              <span className="ha-baseline-panel__dev-value">
                {dev.deviation.toFixed(1)}× {dev.direction}
              </span>
              <span className="ha-baseline-panel__dev-significance">{dev.significance}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
