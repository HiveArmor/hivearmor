import type {
  AlertActivityItem,
  AlertEvidenceField,
  AlertQueueFilters,
  AlertQueueSummary,
  AlertStatusCommand,
  AlertTriageDetail,
  BackendAlertDetail,
} from './alertTriage.types';

import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';
import type { AlertStatus } from '@/constants/status.constants';
import { ALERT_STATUS } from '@/constants/status.constants';
import { apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

function normalizeMitreText(value: unknown, preferredKey: 'id' | 'name'): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[preferredKey];
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  return undefined;
}

function statusToCode(status: AlertDetailDTO['status']): number {
  switch (status) {
    case ALERT_STATUS.IN_PROGRESS:
      return 3;
    case ALERT_STATUS.RESOLVED:
      return 5;
    case ALERT_STATUS.FALSE_POSITIVE:
      return 7;
    case ALERT_STATUS.SUPPRESSED:
      return 5;
    case ALERT_STATUS.OPEN:
    default:
      return 2;
  }
}

/** Map numeric status code from backend to AlertStatus enum value. */
function numericStatusToAlertStatus(code: number): AlertStatus {
  switch (code) {
    case 3:
      return ALERT_STATUS.IN_PROGRESS;
    case 5:
    case 6:
      return ALERT_STATUS.RESOLVED;
    case 7:
      return ALERT_STATUS.FALSE_POSITIVE;
    case 2:
    default:
      return ALERT_STATUS.OPEN;
  }
}

/** Build evidence fields from risk breakdown factors + raw fields. */
function mapEvidenceFields(detail: BackendAlertDetail): AlertEvidenceField[] {
  const riskFields: AlertEvidenceField[] = (detail.riskBreakdown ?? []).map((factor) => ({
    field: factor.name,
    value: `${String(factor.contribution)}/100`,
    source: 'Risk model',
    emphasis: factor.contribution >= 25 ? 'critical' as const : factor.contribution >= 15 ? 'warning' as const : 'neutral' as const,
  }));

  const rawFields: AlertEvidenceField[] = Object.entries(detail.rawFields ?? {}).slice(0, 8).map(([field, value]) => ({
    field,
    value,
    source: 'Alert detail',
    emphasis: 'neutral' as const,
  }));

  return [...riskFields, ...rawFields];
}

/** Convert timeline entries to AlertActivityItem[]. */
function mapTimeline(timeline: BackendAlertDetail['timeline']): AlertActivityItem[] {
  return (timeline ?? []).map((item, index) => ({
    id: String(index),
    at: item.timestamp ?? item.at ?? '',
    actor: item.actor ?? 'system',
    action: item.action ?? 'Status change',
    detail: item.note ?? item.detail ?? '',
  }));
}

/**
 * Normalize a full BackendAlertDetail response into the AlertTriageDetail shape
 * consumed by the drawer UI. Maps all extended fields from the ALT-020 projection.
 *
 * Also accepts a legacy AlertDetailDTO for backward-compat in tests/fixture mode.
 */
export function normalizeAlertTriageDetail(detail: BackendAlertDetail | AlertDetailDTO): AlertTriageDetail {
  // Detect whether we received the new BackendAlertDetail (numeric status) or legacy AlertDetailDTO (string status)
  if (typeof detail.status === 'string') {
    // Legacy AlertDetailDTO path — keeps old behavior for fixture mode & tests
    const legacyDetail = detail as AlertDetailDTO;
    return {
      ...legacyDetail,
      statusCode: statusToCode(legacyDetail.status),
      summary: null,
      reason: null,
      sourceProduct: null,
      assigneeName: null,
      primaryEntity: null,
      relatedAlertCount: null,
      eventCount: null,
      occurrenceCount: null,
      evidenceFields: Object.entries(legacyDetail.rawFields ?? {}).slice(0, 12).map(([field, value]) => ({
        field,
        value,
        source: 'Alert detail',
        emphasis: 'neutral' as const,
      })),
      activity: [],
      version: null,
      dataCompleteness: 'core',
    };
  }

  // New BackendAlertDetail path (numeric status from the real backend)
  const backendDetail = detail as BackendAlertDetail;
  const timeline = backendDetail.timeline ?? [];
  const riskBreakdown = backendDetail.riskBreakdown ?? [];

  // Determine data completeness: 'triage' when extended data is present (3.13)
  const dataCompleteness: 'triage' | 'core' =
    backendDetail.renderedReason != null || riskBreakdown.length > 0 || timeline.length > 0
      ? 'triage'
      : 'core';

  const alertStatus = numericStatusToAlertStatus(backendDetail.status);
  const mitreTacticId = normalizeMitreText(backendDetail.mitreAttack?.tacticId, 'id');
  const mitreTacticName = normalizeMitreText(backendDetail.mitreAttack?.tacticName, 'name');
  const mitreTechniqueId = normalizeMitreText(backendDetail.mitreAttack?.techniqueId, 'id');
  const mitreTechniqueName = normalizeMitreText(backendDetail.mitreAttack?.techniqueName, 'name');

  return {
    // Base AlertDetailDTO fields
    id: backendDetail.id,
    severity: backendDetail.severity,
    timestamp: backendDetail.detectedAt,
    title: backendDetail.title,
    category: backendDetail.category,
    status: alertStatus,
    adversary: backendDetail.adversary ? { ...backendDetail.adversary, networkIds: [] } : null,
    target: backendDetail.target ? { ...backendDetail.target, networkIds: [] } : null,
    tags: backendDetail.tags ?? [],
    ruleId: backendDetail.ruleId ?? null,
    ruleName: backendDetail.ruleName ?? null,
    rawFields: backendDetail.rawFields ?? {},
    // MITRE ATT&CK from nested mitreAttack object (3.14)
    mitreTacticId,
    mitreTacticName,
    mitreTechniqueId,
    mitreTechniqueName,
    mitreTechniqueUrl: mitreTechniqueId
      ? `https://attack.mitre.org/techniques/${mitreTechniqueId.replace('.', '/')}/`
      : undefined,
    // Risk score and confidence
    riskScore: backendDetail.riskScore,
    confidence: backendDetail.confidence,
    // Threat intel
    threatIntelMatched: (backendDetail.threatIntelMatches ?? []).length > 0,
    threatIntelSource: backendDetail.threatIntelMatches?.[0]?.source,
    threatIntelConfidence: backendDetail.threatIntelMatches?.[0]?.confidence,
    threatIntelIndicatorType: backendDetail.threatIntelMatches?.[0]?.type as AlertDetailDTO['threatIntelIndicatorType'],
    // Tenant/SLA
    tenantId: backendDetail.tenant?.id,
    tenantName: backendDetail.tenant?.name,
    slaDeadline: backendDetail.sla?.dueAt,
    slaBreached: backendDetail.sla?.status === 'breached',

    // AlertTriageDetail extended fields
    statusCode: backendDetail.status,
    summary: backendDetail.summary ?? backendDetail.renderedReason ?? null,             // 3.3
    reason: backendDetail.renderedReason ?? null,                                       // 3.4
    sourceProduct: backendDetail.ruleName ?? null,
    assigneeName: backendDetail.assignee?.displayName ?? null,                          // 3.5
    primaryEntity: backendDetail.primaryEntity                                          // 3.6
      ? { id: backendDetail.primaryEntity.id, type: backendDetail.primaryEntity.type as 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file', label: backendDetail.primaryEntity.label, riskScore: backendDetail.primaryEntity.riskScore }
      : null,
    relatedAlertCount: backendDetail.relatedAlerts?.length ?? 0,                        // 3.7
    eventCount: timeline.length ?? 0,                                                    // 3.8
    occurrenceCount: backendDetail.occurrenceCount ?? 1,                                // 3.9
    evidenceFields: mapEvidenceFields(backendDetail),                                   // 3.10
    activity: mapTimeline(timeline),                                                     // 3.11
    version: backendDetail.version,                                                      // 3.12
    dataCompleteness,                                                                    // 3.13
  };
}

export async function fetchAlertTriageDetail(alertId: string, signal?: AbortSignal): Promise<AlertTriageDetail> {
  if (fixtureMode) {
    const { getFoundationAlertDetail } = await import('@/pages/alerts/alertTriage.fixtures');
    return getFoundationAlertDetail(alertId);
  }

  // Cast API response as BackendAlertDetail and pass to the new normalizer (3.15)
  const detail = await apiClient.get<BackendAlertDetail>(`/ha-alerts/${encodeURIComponent(alertId)}`, { signal });
  return normalizeAlertTriageDetail(detail);
}

export async function fetchAlertQueueSummary(filters: AlertQueueFilters, signal?: AbortSignal): Promise<AlertQueueSummary> {
  if (fixtureMode) {
    const { filterFoundationAlertQueue } = await import('@/pages/alerts/alertTriage.fixtures');
    const items = filterFoundationAlertQueue(filters);
    return {
      totalApproximate: items.length,
      criticalOpen: items.filter((item) => item.severity >= 9 && item.status < 5).length,
      slaAtRisk: items.filter((item) => item.slaStatus === 'at_risk' || item.slaStatus === 'breached').length,
      unassigned: items.filter((item) => !item.assigneeName && item.status < 5).length,
      threatIntelMatched: items.filter((item) => item.threatIntelMatched && item.status < 5).length,
      snapshotAt: '2026-08-02T03:48:00.000Z',
      dataCompleteness: 'complete',
    };
  }

  const { queryExpression, ...structuredFilters } = filters;
  return apiClient.get<AlertQueueSummary>('/ha-alerts/summary', {
    signal,
    params: {
      ...structuredFilters,
      q: queryExpression ?? structuredFilters.q,
    } as Record<string, string | number | boolean | string[] | undefined>,
  });
}

export async function updateAlertTriageStatus(command: AlertStatusCommand): Promise<void> {
  if (fixtureMode) return Promise.resolve();

  return apiClient.post<void>('/ha-alerts/status', command);
}

export { fixtureMode as alertTriageFixtureMode };
