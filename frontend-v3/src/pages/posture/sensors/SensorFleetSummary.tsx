import { useQuery } from '@tanstack/react-query';

import {
  fetchAgentPackageSummary,
  isAgentVersionBehind,
} from '@/services/agentPackage.service';
import type { SensorDTO } from '@/services/sensorsService';

import './SensorFleetSummary.css';

interface SensorFleetSummaryProps {
  sensors: SensorDTO[];
}

/**
 * Fleet strip above the Sensors grid: running inventory + published package version.
 */
export function SensorFleetSummary(props: SensorFleetSummaryProps): JSX.Element {
  const { sensors } = props;

  const summaryQuery = useQuery({
    queryKey: ['ha-agent-packages-summary'],
    queryFn: fetchAgentPackageSummary,
    retry: false,
    staleTime: 30_000,
  });

  const online = sensors.filter((s) => s.connectionStatus === 'ONLINE').length;
  const offline = sensors.filter((s) => s.connectionStatus === 'OFFLINE').length;
  const latest = summaryQuery.data?.latestVersion ?? null;
  const publishedCount = summaryQuery.data?.publishedCount ?? 0;
  const totalPackages = summaryQuery.data?.totalCount ?? 0;
  const behind = latest
    ? sensors.filter((s) => isAgentVersionBehind(s.agentVersion, latest)).length
    : 0;
  const packagesReady = publishedCount > 0;

  return (
    <section className="sensor-fleet-summary" aria-label="Sensor fleet summary">
      <div className="sensor-fleet-summary__stats">
        <div className="sensor-fleet-summary__stat">
          <span className="sensor-fleet-summary__label">Online</span>
          <strong className="sensor-fleet-summary__value sensor-fleet-summary__value--positive">
            {online}
          </strong>
        </div>
        <div className="sensor-fleet-summary__stat">
          <span className="sensor-fleet-summary__label">Offline</span>
          <strong className="sensor-fleet-summary__value">{offline}</strong>
        </div>
        <div className="sensor-fleet-summary__stat">
          <span className="sensor-fleet-summary__label">Registered</span>
          <strong className="sensor-fleet-summary__value">{sensors.length}</strong>
        </div>
        <div className="sensor-fleet-summary__stat">
          <span className="sensor-fleet-summary__label">Latest published</span>
          <strong className="sensor-fleet-summary__value sensor-fleet-summary__value--mono">
            {summaryQuery.isLoading ? '…' : latest ?? 'Not published'}
          </strong>
        </div>
        <div className="sensor-fleet-summary__stat">
          <span className="sensor-fleet-summary__label">Packages</span>
          <strong className="sensor-fleet-summary__value sensor-fleet-summary__value--mono">
            {summaryQuery.isLoading ? '…' : `${publishedCount}/${totalPackages}`}
          </strong>
        </div>
        {behind > 0 && (
          <div className="sensor-fleet-summary__stat">
            <span className="sensor-fleet-summary__label">Behind latest</span>
            <strong className="sensor-fleet-summary__value sensor-fleet-summary__value--warn">
              {behind}
            </strong>
          </div>
        )}
      </div>

      {!packagesReady && !summaryQuery.isLoading && (
        <p className="sensor-fleet-summary__hint" role="status">
          No installer binaries published yet. Use <strong>Add Agent</strong> after packages are
          synced with staging <code>publish-agent-packages.sh</code>.
        </p>
      )}
    </section>
  );
}
