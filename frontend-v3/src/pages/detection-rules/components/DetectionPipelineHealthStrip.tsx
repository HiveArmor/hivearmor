/**
 * DET-OBS-001 — pipeline health strip for Detection Engineering.
 */

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Gauge, RefreshCw, ShieldAlert } from 'lucide-react';

import { DET_OBS_PIPELINE_HEALTH } from '../detectionRules.capabilities';

import { fetchDetectionPipelineHealth } from '@/services/detectionPipeline.service';

export function DetectionPipelineHealthStrip(): JSX.Element | null {
  const query = useQuery({
    queryKey: ['detection-pipeline-health'],
    queryFn: ({ signal }) => fetchDetectionPipelineHealth(signal),
    enabled: DET_OBS_PIPELINE_HEALTH,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!DET_OBS_PIPELINE_HEALTH) return null;

  const health = query.data;
  const status = health?.status ?? (query.isError ? 'error' : 'loading');

  return (
    <section className="detection-pipeline" aria-label="Detection pipeline health" data-status={status}>
      <header>
        <Activity size={14} aria-hidden="true" />
        <strong>Pipeline health</strong>
        <span>{health?.mode ?? '…'}</span>
        <button
          type="button"
          aria-label="Refresh pipeline health"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={12} className={query.isFetching ? 'detection-spin' : ''} />
        </button>
      </header>

      {query.isError && (
        <p className="detection-pipeline__error" role="alert">
          <AlertTriangle size={13} />
          {query.error instanceof Error ? query.error.message : 'Pipeline health unavailable'}
        </p>
      )}

      {health && (
        <>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>Loaded</dt>
              <dd>{health.loadReport?.loaded ?? '—'}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{health.loadReport?.skipped ?? '—'}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{health.activeRuleCount ?? '—'}</dd>
            </div>
            <div>
              <dt>afterEvents misses</dt>
              <dd>{health.afterEventsMisses ?? '—'}</dd>
            </div>
            <div>
              <dt>Correlation checks</dt>
              <dd>{health.correlationChecks ?? '—'}</dd>
            </div>
          </dl>
          <p className="detection-pipeline__honesty" role="status">
            <ShieldAlert size={12} />
            <span>{health.honesty}</span>
          </p>
          <p className="detection-pipeline__index">
            <Gauge size={12} />
            Index constraint: {health.indexPatternConstraint}
          </p>
        </>
      )}
    </section>
  );
}
