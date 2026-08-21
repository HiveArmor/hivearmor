/**
 * CoverageMatrixPanel — ATT&CK heatmap grid (tactics as columns, techniques as rows)
 * with green/yellow/red cells; gap list with recommendations (Sprint 47 DET-015)
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Target } from 'lucide-react';

import { fetchCoverage } from '@/pages/detection-rules/services/detection.service';
import type { CoverageGap, CoverageRecommendation, CoverageStatus, TacticCoverage } from '@/pages/detection-rules/types/detection.types';

function cellColor(status: CoverageStatus): string {
  if (status === 'covered') return 'var(--ha-severity-low)';
  if (status === 'partial') return 'var(--ha-severity-medium)';
  return 'var(--ha-severity-critical)';
}

export function CoverageMatrixPanel(): JSX.Element {
  const [scope, setScope] = useState<string>('all');

  const coverageQuery = useQuery({
    queryKey: ['detection-coverage', scope],
    queryFn: ({ signal }) => fetchCoverage(scope, signal),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const matrix = coverageQuery.data?.matrix ?? [];
  const overallScore = coverageQuery.data?.overallScore ?? 0;
  const gaps = coverageQuery.data?.gaps ?? [];
  const recommendations = coverageQuery.data?.recommendations ?? [];

  return (
    <section className="coverage-matrix-panel" aria-label="ATT&CK coverage matrix">
      <header className="coverage-matrix-panel__header">
        <div>
          <Target size={16} />
          <strong>ATT&CK Coverage Matrix</strong>
          <span className="coverage-matrix-panel__score">
            Overall: {overallScore}%
          </span>
        </div>
        <div className="coverage-matrix-panel__controls">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Coverage scope filter"
          >
            <option value="all">All rules</option>
            <option value="managed">Managed only</option>
            <option value="custom">Custom only</option>
          </select>
          <button
            type="button"
            onClick={() => void coverageQuery.refetch()}
            disabled={coverageQuery.isFetching}
            aria-label="Refresh coverage"
          >
            <RefreshCw size={14} className={coverageQuery.isFetching ? 'detection-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="coverage-matrix-panel__legend">
        <span data-status="covered"><i /> Covered</span>
        <span data-status="partial"><i /> Partial</span>
        <span data-status="uncovered"><i /> Uncovered</span>
      </div>

      {coverageQuery.isLoading ? (
        <div className="detection-grid-loading" aria-label="Loading coverage">
          {Array.from({ length: 6 }, (_, i) => <span key={i} />)}
        </div>
      ) : (
        <>
          <div
            className="coverage-matrix-panel__grid"
            role="region"
            aria-label="Scrollable coverage heatmap"
            tabIndex={0}
          >
            {matrix.map((tactic: TacticCoverage) => (
              <div key={tactic.tacticId} className="coverage-matrix-panel__tactic">
                <header>
                  <span>{tactic.tacticName}</span>
                  <strong>{tactic.coveragePercent}%</strong>
                </header>
                <div className="coverage-matrix-panel__techniques">
                  {tactic.techniques.map((technique) => (
                    <button
                      key={technique.techniqueId}
                      type="button"
                      className="coverage-matrix-panel__cell"
                      style={{ backgroundColor: cellColor(technique.status) }}
                      title={`${technique.techniqueId} ${technique.techniqueName}: ${technique.ruleCount} rules, ${technique.alertCount30d} alerts/30d`}
                      aria-label={`${technique.techniqueId} ${technique.techniqueName}, ${technique.status}`}
                    >
                      <code>{technique.techniqueId}</code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {gaps.length > 0 && (
            <section className="coverage-matrix-panel__gaps" aria-label="Coverage gaps">
              <header>
                <AlertTriangle size={14} />
                <strong>Coverage Gaps ({gaps.length})</strong>
              </header>
              <ul>
                {gaps.map((gap: CoverageGap) => (
                  <li key={gap.techniqueId} data-priority={gap.priority}>
                    <span className="coverage-gap-priority" data-priority={gap.priority}>
                      {gap.priority}
                    </span>
                    <div>
                      <strong>{gap.techniqueId} — {gap.techniqueName}</strong>
                      <small>{gap.reason}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recommendations.length > 0 && (
            <section className="coverage-matrix-panel__recommendations" aria-label="Recommendations">
              <header>
                <CheckCircle2 size={14} />
                <strong>Recommendations</strong>
              </header>
              <ul>
                {recommendations.map((rec: CoverageRecommendation) => (
                  <li key={rec.techniqueId}>
                    <div>
                      <strong>{rec.techniqueId}</strong>
                      <span>{rec.recommendation}</span>
                    </div>
                    <span className="coverage-effort-badge" data-effort={rec.effort}>
                      {rec.effort}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
