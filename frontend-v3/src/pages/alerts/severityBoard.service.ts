import type { AlertQueueRecord } from './alertTriage.types';
import type {
  SeverityBoardAlert,
  SeverityBoardAlertStatus,
  SeverityBoardFilters,
  SeverityBoardResponse,
  SeverityTrendBucket,
} from './severityBoard.types';

import { apiClient } from '@/lib/apiClient';
import { numericToSeverityLevel, type SeverityLevel } from '@/lib/severity';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const severityOrder: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info'];
const BOARD_ALERT_LIMIT = 4;
const TREND_BUCKET_COUNT = 12;

function statusLabel(status: number): string {
  return ({
    1: 'Auto review',
    2: 'Open',
    3: 'In review',
    5: 'Completed',
    6: 'True positive',
    7: 'False positive',
  } as Record<number, string>)[status] ?? 'Unknown';
}

function canonicalStatus(status: number): SeverityBoardAlertStatus {
  if (status === 2) return 'open';
  if (status === 1 || status === 3) return 'in_review';
  if (status === 6) return 'true_positive';
  if (status === 7) return 'false_positive';
  return 'closed';
}

function toBoardAlert(alert: AlertQueueRecord): SeverityBoardAlert {
  return {
    id: alert.id,
    title: alert.name,
    summary: alert.summary ?? null,
    severity: numericToSeverityLevel(alert.severity),
    riskScore: alert.riskScore ?? null,
    confidence: alert.confidence ?? null,
    detectedAt: alert['@timestamp'],
    status: canonicalStatus(alert.status),
    statusLabel: statusLabel(alert.status),
    category: alert.category ?? null,
    primaryEntity: alert.primaryEntity ? {
      type: alert.primaryEntity.type,
      label: alert.primaryEntity.label,
    } : null,
    assigneeName: alert.assigneeName ?? null,
    slaStatus: alert.slaStatus ?? 'none',
    threatIntelMatched: Boolean(alert.threatIntelMatched),
    relatedAlertCount: alert.relatedAlertCount ?? 0,
    mitreTechniqueId: alert.mitreTechniqueId ?? null,
    tenantName: alert.tenantName ?? null,
    tags: alert.tags ?? [],
  };
}

function buildTrend(alerts: AlertQueueRecord[], from: number, to: number): SeverityTrendBucket[] {
  const duration = Math.max(TREND_BUCKET_COUNT, to - from);
  const bucketDuration = duration / TREND_BUCKET_COUNT;
  return Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => {
    const bucketStart = from + index * bucketDuration;
    const bucketEnd = index === TREND_BUCKET_COUNT - 1 ? to + 1 : bucketStart + bucketDuration;
    const bucketAlerts = alerts.filter((alert) => {
      const timestamp = new Date(alert['@timestamp']).getTime();
      return timestamp >= bucketStart && timestamp < bucketEnd;
    });
    const counts = Object.fromEntries(severityOrder.map((severity) => [
      severity,
      bucketAlerts.filter((alert) => numericToSeverityLevel(alert.severity) === severity).length,
    ])) as Record<SeverityLevel, number>;
    return {
      start: new Date(bucketStart).toISOString(),
      end: new Date(Math.min(bucketEnd, to)).toISOString(),
      label: new Date(bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      total: bucketAlerts.length,
      ...counts,
    };
  });
}

export function buildSeverityBoardFixture(
  sourceAlerts: AlertQueueRecord[],
  filters: SeverityBoardFilters
): SeverityBoardResponse {
  const from = new Date(filters.from).getTime();
  const to = new Date(filters.to).getTime();
  const filtered = sourceAlerts.filter((alert) => {
    const timestamp = new Date(alert['@timestamp']).getTime();
    if (timestamp < from || timestamp > to) return false;
    if (filters.scope === 'active' && alert.status >= 5) return false;
    if (filters.ownership === 'mine' && alert.assigneeId !== 41) return false;
    if (filters.ownership === 'unassigned' && alert.assigneeName) return false;
    return true;
  });
  const sorted = [...filtered].sort((left, right) => {
    const riskDifference = (right.riskScore ?? 0) - (left.riskScore ?? 0);
    return riskDifference || new Date(right['@timestamp']).getTime() - new Date(left['@timestamp']).getTime() || left.id.localeCompare(right.id);
  });

  return {
    overview: {
      total: filtered.length,
      active: filtered.filter((alert) => alert.status < 5).length,
      criticalOpen: filtered.filter((alert) => alert.status < 5 && numericToSeverityLevel(alert.severity) === 'critical').length,
      needsTriage: filtered.filter((alert) => alert.status === 2).length,
      slaPressure: filtered.filter((alert) => alert.status < 5 && (alert.slaStatus === 'at_risk' || alert.slaStatus === 'breached')).length,
      unassigned: filtered.filter((alert) => alert.status < 5 && !alert.assigneeName).length,
      threatIntelMatched: filtered.filter((alert) => alert.threatIntelMatched).length,
      highestRisk: filtered.reduce<number | null>((highest, alert) => highest === null ? alert.riskScore ?? null : Math.max(highest, alert.riskScore ?? 0), null),
    },
    lanes: severityOrder.map((severity) => {
      const laneAlerts = sorted.filter((alert) => numericToSeverityLevel(alert.severity) === severity);
      return {
        severity,
        count: laneAlerts.length,
        activeCount: laneAlerts.filter((alert) => alert.status < 5).length,
        slaPressure: laneAlerts.filter((alert) => alert.status < 5 && (alert.slaStatus === 'at_risk' || alert.slaStatus === 'breached')).length,
        unassigned: laneAlerts.filter((alert) => alert.status < 5 && !alert.assigneeName).length,
        alerts: laneAlerts.slice(0, BOARD_ALERT_LIMIT).map(toBoardAlert),
      };
    }),
    trend: buildTrend(filtered, from, to),
    snapshotAt: filters.to,
    totalApproximate: false,
    dataCompleteness: 'complete',
  };
}

export async function fetchSeverityBoard(
  filters: SeverityBoardFilters,
  signal?: AbortSignal
): Promise<SeverityBoardResponse> {
  if (fixtureMode) {
    const { foundationAlertQueue } = await import('@/pages/alerts/alertTriage.fixtures');
    return buildSeverityBoardFixture(foundationAlertQueue, filters);
  }

  return apiClient.get<SeverityBoardResponse>('/ha-alerts/severity-board', {
    signal,
    params: filters as unknown as Record<string, string | number | boolean | string[] | undefined>,
  });
}

export { fixtureMode as severityBoardFixtureMode };
