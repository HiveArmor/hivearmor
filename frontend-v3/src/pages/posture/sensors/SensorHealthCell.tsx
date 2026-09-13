/**
 * SensorHealthCell.tsx — SensorGrid health cell (SPEC-02, W2).
 *
 * A self-contained cell that fetches ITS agent's vitals from the existing
 * `GET /api/ha-telemetry/vitals/{agentId}` endpoint (via react-query, so rows
 * dedupe/cache and cancel on unmount), computes the composite health, and
 * renders the compact `AgentHealthBadge` + an inline CPU sparkline.
 *
 * Honest states (spec §5):
 *   - loading         → a quiet "Checking…" (never a premature green)
 *   - fetch error     → the badge's explicit error state (never blank)
 *   - no vitals yet   → "No data" via the unknown level (never a fake green)
 *
 * Keeping the fetch in the cell means SensorGridPage's own data flow is
 * untouched — this is additive wiring, not a rewrite of the grid.
 */

import { useQuery } from '@tanstack/react-query';
import type { ICellRendererParams } from 'ag-grid-community';

import { AgentHealthBadge } from '@/components/agent-health-badge';
import { AgentVitalsSparkline } from '@/components/agent-vitals-sparkline';
import {
  computeCompositeHealth,
  computeFreshness,
  extractSparklineSeries,
} from '@/services/agentHealth';
import type { SensorDTO } from '@/services/sensorsService';
import { fetchAgentVitals } from '@/services/telemetryService';

export function SensorHealthCell(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const agentId = params.data?.agentId ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-vitals', agentId],
    queryFn: ({ signal }) => fetchAgentVitals(agentId as string, signal),
    enabled: Boolean(agentId),
    staleTime: 30_000,
    retry: false,
  });

  if (!agentId) {
    return <span className="sensor-fleet-page__health-muted">—</span>;
  }

  if (isLoading) {
    return (
      <span className="sensor-fleet-page__health-muted" role="status">
        Checking…
      </span>
    );
  }

  if (isError) {
    // Explicit error state — never a blank cell or a misleading green.
    return (
      <AgentHealthBadge
        variant="compact"
        errored
        health={computeCompositeHealth([])}
        freshness={computeFreshness([])}
      />
    );
  }

  const samples = data ?? [];
  const health = computeCompositeHealth(samples);
  const freshness = computeFreshness(samples);
  const cpuSeries = extractSparklineSeries(samples, 'cpu');

  return (
    <div className="sensor-fleet-page__health-cell">
      <AgentHealthBadge variant="compact" health={health} freshness={freshness} />
      {cpuSeries.length > 1 && (
        <span className="sensor-fleet-page__health-spark" aria-hidden="true">
          <AgentVitalsSparkline
            series={cpuSeries}
            level={health.level}
            height={22}
            ariaLabel="CPU trend"
          />
        </span>
      )}
    </div>
  );
}
