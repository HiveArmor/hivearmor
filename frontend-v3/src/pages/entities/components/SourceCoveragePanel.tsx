/**
 * SourceCoveragePanel — Sprint 46
 * Grid of data sources with status indicators (active/stale/gap),
 * event counts, and last event timestamps.
 */

import { Database } from 'lucide-react';

import type { SourceCoverage } from '../types/dossier.types';

import './SourceCoveragePanel.css';

export interface SourceCoveragePanelProps {
  sourceCoverage: SourceCoverage;
}

function formatRelativeTime(value: string | null): string {
  if (!value) return 'Never';
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return 'Unknown';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function formatEventCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function SourceCoveragePanel({ sourceCoverage }: SourceCoveragePanelProps): JSX.Element {
  return (
    <section className="ha-source-panel">
      <header className="ha-source-panel__header">
        <Database size={14} />
        <h2>Source Coverage</h2>
        <span className="ha-source-panel__count">
          {sourceCoverage.sources.length} sources · {sourceCoverage.gaps.length} gaps
        </span>
      </header>

      <div className="ha-source-panel__grid">
        {sourceCoverage.sources.map(source => (
          <div key={source.name} className="ha-source-panel__source" data-status={source.status}>
            <div className="ha-source-panel__status-dot" />
            <div className="ha-source-panel__source-info">
              <span className="ha-source-panel__source-name">{source.name}</span>
              <span className="ha-source-panel__source-type">{source.type}</span>
            </div>
            <div className="ha-source-panel__source-meta">
              <span className="ha-source-panel__event-count">{formatEventCount(source.eventCount)} events</span>
              <span className="ha-source-panel__last-event">{formatRelativeTime(source.lastEvent)}</span>
            </div>
          </div>
        ))}
      </div>

      {sourceCoverage.gaps.length > 0 && (
        <div className="ha-source-panel__gaps">
          <h3>Coverage Gaps</h3>
          {sourceCoverage.gaps.map(gap => (
            <div key={gap.source} className="ha-source-panel__gap" data-severity={gap.severity}>
              <span className="ha-source-panel__gap-name">{gap.source}</span>
              <span className="ha-source-panel__gap-interval">Expected: {gap.expectedInterval}</span>
              <span className="ha-source-panel__gap-severity">{gap.severity}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
