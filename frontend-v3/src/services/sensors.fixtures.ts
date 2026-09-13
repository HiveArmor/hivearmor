/**
 * sensors.fixtures — fixture-mode SensorGrid seed for SPEC-02 (W2) verification.
 *
 * The SensorGrid reads real backend data, so fixture mode has no fleet to show.
 * This seed provides one row per telemetry.fixtures vitals state, keyed by an
 * agentId the vitals fixture recognises (`getFixtureVitals` substring-matches
 * healthy/degraded/errored/stale/offline/novitals), so the Health column renders
 * every composite/sparkline/freshness state offline. DEV-only; never ships.
 */

import type { SensorDTO } from './sensorsService';

function row(agentId: string, hostname: string, status: SensorDTO['connectionStatus'], agoMin: number): SensorDTO {
  return {
    agentId,
    hostname,
    platform: 'linux',
    osVersion: 'Ubuntu 22.04',
    agentVersion: '3.1.0',
    connectionStatus: status,
    lastSeen: new Date(Date.now() - agoMin * 60_000).toISOString(),
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: null,
  };
}

export function getFixtureSensors(): SensorDTO[] {
  return [
    row('fixture-healthy', 'web-prod-01', 'ONLINE', 0),
    row('fixture-degraded', 'db-prod-02', 'ONLINE', 0),
    row('fixture-errored', 'app-prod-03', 'ONLINE', 0),
    row('fixture-stale', 'edge-04', 'ONLINE', 3),
    row('fixture-offline', 'branch-vpn-05', 'OFFLINE', 20),
    row('fixture-novitals', 'newly-enrolled-06', 'ONLINE', 0),
  ];
}
