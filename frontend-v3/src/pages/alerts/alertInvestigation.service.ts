import type {
  ActionPreview,
  AlertInvestigation,
  AlertActivityResponse,
  AlertEventHighlightedResponse,
  AlertEventRawResponse,
  AlertGuideResponse,
  AlertStoryResponse,
  EnhancedAlertDetail,
  EntityGraphResponse,
  IndicatorsResponse,
  InvestigationEntity,
  InvestigationIndicator,
  InvestigationResponseAction,
  InvestigationSeverity,
  NetworkActivityResponse,
  ProcessTreeResponse,
  RelatedAlertsResponse,
  ResponseAction,
  ResponseJob,
} from './alertInvestigation.types';
import { normalizeAlertTriageDetail } from './alertTriage.service';
import type { BackendAlertDetail } from './alertTriage.types';

import type { AlertDetailDTO, AlertSideDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';
import { apiClient } from '@/lib/apiClient';
import { numericToSeverityLevel } from '@/lib/severity';

function severityFromNumber(value: number): InvestigationSeverity {
  return numericToSeverityLevel(value) as InvestigationSeverity;
}

function sidesToEntities(side: AlertSideDTO | null, role: 'actor' | 'target'): InvestigationEntity[] {
  if (!side) return [];
  const candidates: Array<[InvestigationEntity['type'], string | null]> = [
    ['ip', side.ip],
    ['host', side.hostname],
    ['process', side.processName],
    ['user', side.username],
  ];
  return candidates
    .filter((candidate): candidate is [InvestigationEntity['type'], string] => Boolean(candidate[1]))
    .map(([type, label], index) => ({
      id: `${role}-${type}-${index}`,
      type,
      label,
      role,
      riskScore: null,
      evidenceCount: 1,
    }));
}

function threatIndicator(alert: AlertDetailDTO): InvestigationIndicator[] {
  if (!alert.threatIntelMatched || !alert.threatIntelIndicatorType) return [];
  const candidateKeys: Record<string, string[]> = {
    ip: ['source.ip', 'destination.ip', 'src_ip', 'dst_ip'],
    domain: ['destination.domain', 'domain', 'dns.question.name'],
    hash: ['file.hash.sha256', 'sha256', 'file.hash.sha1', 'sha1'],
    url: ['url.full', 'url'],
    email: ['user.email', 'email'],
  };
  const key = candidateKeys[alert.threatIntelIndicatorType]
    ?.find((field) => Boolean(alert.rawFields[field]));
  if (!key) return [];
  const type = alert.threatIntelIndicatorType === 'hash' ? 'sha256' : alert.threatIntelIndicatorType;
  return [{
    id: `ioc-${type}`,
    type,
    value: alert.rawFields[key],
    verdict: 'suspicious',
    confidence: alert.threatIntelConfidence ?? null,
    source: alert.threatIntelSource ?? 'Threat intelligence',
    firstSeen: null,
    lastSeen: alert.timestamp,
    evidenceIds: [],
  }];
}

export function normalizeAlertInvestigation(alert: AlertDetailDTO, enhanced?: EnhancedAlertDetail): AlertInvestigation {
  const severity = severityFromNumber(alert.severity);
  const entities: InvestigationEntity[] = [
    ...sidesToEntities(alert.adversary, 'actor'),
    ...sidesToEntities(alert.target, 'target'),
  ];
  if (entities.length === 0 && enhanced?.primaryEntity?.label) {
    const supportedTypes = new Set<InvestigationEntity['type']>([
      'user', 'host', 'ip', 'process', 'file', 'domain', 'rule',
    ]);
    const primaryType = supportedTypes.has(enhanced.primaryEntity.type as InvestigationEntity['type'])
      ? enhanced.primaryEntity.type as InvestigationEntity['type']
      : 'host';
    entities.push({
      id: enhanced.primaryEntity.id || `primary-${primaryType}`,
      type: primaryType,
      label: enhanced.primaryEntity.label,
      role: 'target',
      riskScore: enhanced.primaryEntity.riskScore,
      evidenceCount: enhanced.counts.events,
    });
  }
  const ruleReason = enhanced?.renderedReason
    ?? enhanced?.summary
    ?? (alert.ruleName
      ? `${alert.ruleName} generated this alert.`
      : 'Detection context is available; a rendered rule reason was not supplied.');
  const actionLabels: Record<string, { label: string; description: string; tone: InvestigationResponseAction['tone'] }> = {
    promote: { label: 'Promote to incident', description: 'Create an incident and preserve the current evidence set.', tone: 'neutral' },
    isolate_host: { label: 'Isolate host', description: 'Restrict endpoint network access through a governed response action.', tone: 'danger' },
    block_indicators: { label: 'Block observed indicators', description: 'Block verified malicious indicators through connected enforcement systems.', tone: 'primary' },
    terminate_process: { label: 'Terminate process tree', description: 'Stop a process and its descendants after impact preview.', tone: 'danger' },
  };
  const availableActions: InvestigationResponseAction[] = (enhanced?.availableActions ?? []).map((action) => {
    const metadata = actionLabels[action.id] ?? {
      label: action.id.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      description: 'Run this governed alert action from the response console.',
      tone: 'neutral' as const,
    };
    return {
      id: action.id,
      ...metadata,
      target: enhanced?.primaryEntity?.label ?? alert.id,
      available: action.allowed,
      unavailableReason: action.reason,
      requiresApproval: action.requiresPreview,
    };
  });

  return {
    id: alert.id,
    title: alert.title,
    summary: ruleReason,
    severity,
    status: String(alert.status).replace(/_/g, ' '),
    verdict: enhanced?.verdict
      ? (enhanced.verdict as AlertInvestigation['verdict'])
      : alert.status === 'false_positive' ? 'benign' : 'unknown',
    riskScore: alert.riskScore ?? null,
    confidence: alert.confidence ?? null,
    occurredAt: alert.timestamp,
    updatedAt: enhanced?.updatedAt ?? alert.timestamp,
    detector: enhanced?.detection?.detector ?? alert.category,
    dataSource: enhanced?.detection?.dataSources?.[0] ?? 'Alert detail API',
    tenant: alert.tenantName ?? alert.tenantId ?? null,
    asset: enhanced?.asset?.name ?? alert.assetId ?? alert.target?.hostname ?? null,
    assetOwner: enhanced?.asset?.owner ?? alert.assetOwner ?? null,
    slaDeadline: alert.slaDeadline ?? null,
    rule: {
      id: enhanced?.detection?.ruleId ?? alert.ruleId,
      name: enhanced?.detection?.ruleName ?? alert.ruleName,
      reason: ruleReason,
      investigationGuide: [],
    },
    stages: alert.mitreTacticId ? [{
      id: alert.mitreTacticId,
      order: 1,
      tacticId: alert.mitreTacticId,
      label: alert.mitreTacticName ?? alert.mitreTacticId,
      technique: [alert.mitreTechniqueId, alert.mitreTechniqueName].filter(Boolean).join(' '),
      state: 'observed',
      eventCount: enhanced?.counts?.events ?? 1,
    }] : [],
    story: [],
    processes: [],
    network: [],
    indicators: threatIndicator(alert),
    capabilities: [],
    entities,
    relatedAlerts: [],
    history: [],
    actions: availableActions.length > 0 ? availableActions : [
      {
        id: 'promote-incident',
        label: 'Promote to incident',
        description: 'Create an incident from this alert.',
        tone: 'neutral',
        target: alert.id,
        available: false,
        unavailableReason: 'Eligibility and response-preview contract is not available.',
        requiresApproval: false,
      },
    ],
    highlightedFields: alert.rawFields,
    rawEvent: alert.rawFields,
    dataCompleteness: enhanced ? 'full' : 'core',
    missingDataNotice: enhanced
      ? null
      : 'Extended investigation telemetry is not available from the current backend contract. Core alert fields are shown without inferred events.',
  };
}

export async function fetchAlertInvestigation(alertId: string): Promise<AlertInvestigation> {
  const response = await apiClient.get<BackendAlertDetail & Partial<EnhancedAlertDetail>>(
    `/ha-alerts/${encodeURIComponent(alertId)}`
  );
  const alert = normalizeAlertTriageDetail(response);

  // Extract enhanced fields if present in the response
  const enhanced: EnhancedAlertDetail | undefined =
    response.detection && response.counts
      ? {
          detection: response.detection,
          asset: response.asset ?? { id: null, name: null, owner: null, criticality: 'low' },
          counts: response.counts,
          verdict: response.verdict ?? 'unknown',
          snapshotVersion: response.snapshotVersion ?? 1,
          summary: response.summary,
          renderedReason: response.renderedReason,
          updatedAt: response.updatedAt,
          primaryEntity: response.primaryEntity,
          availableActions: response.availableActions,
        }
      : undefined;

  return normalizeAlertInvestigation(alert, enhanced);
}

/** ALT-002: Fetch attack story (stages + events) for an alert */
export async function fetchAlertStory(alertId: string): Promise<AlertStoryResponse> {
  return apiClient.get<AlertStoryResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/story`
  );
}

/** ALT-008: Fetch paginated activity feed for an alert */
export async function fetchAlertActivity(alertId: string, cursor?: string): Promise<AlertActivityResponse> {
  return apiClient.get<AlertActivityResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/activity`,
    {
      params: {
        ...(cursor ? { cursor } : {}),
        limit: 50,
      },
    }
  );
}

/** ALT-009: Fetch detection guide for an alert */
export async function fetchAlertGuide(alertId: string): Promise<AlertGuideResponse> {
  return apiClient.get<AlertGuideResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/guide`
  );
}

/** ALT-011: Fetch event detail (highlighted or raw view) */
export async function fetchAlertEventDetail(
  alertId: string,
  eventId: string,
  view: 'highlighted' | 'raw'
): Promise<AlertEventHighlightedResponse | AlertEventRawResponse> {
  return apiClient.get<AlertEventHighlightedResponse | AlertEventRawResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/events/${encodeURIComponent(eventId)}`,
    {
      params: { view },
    }
  );
}

/** ALT-003: Fetch process lineage tree for an alert */
export async function fetchAlertProcesses(alertId: string): Promise<ProcessTreeResponse> {
  return apiClient.get<ProcessTreeResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/processes`
  );
}

/** ALT-004: Fetch network activity (connections, DNS, TLS, reputation) for an alert */
export async function fetchAlertNetwork(alertId: string): Promise<NetworkActivityResponse> {
  return apiClient.get<NetworkActivityResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/network`
  );
}

/** ALT-005: Fetch indicators/IOCs for an alert */
export async function fetchAlertIndicators(alertId: string): Promise<IndicatorsResponse> {
  return apiClient.get<IndicatorsResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/indicators`
  );
}

/** ALT-007: Fetch related alerts with correlation reasons */
export async function fetchAlertRelated(alertId: string): Promise<RelatedAlertsResponse> {
  return apiClient.get<RelatedAlertsResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/related`
  );
}

/** ALT-006: Fetch entity relationship graph for an alert */
export async function fetchAlertRelationships(alertId: string): Promise<EntityGraphResponse> {
  return apiClient.get<EntityGraphResponse>(
    `/ha-alerts/${encodeURIComponent(alertId)}/relationships`
  );
}

/** ALT-010: Fetch available response actions catalog.
 * Confirmed path: GET /api/response/actions (HaResponseActionResource).
 * A1-AI-01: fail closed to a static display catalogue when the live catalogue is unavailable —
 * never invent alternate SOAR catalogue URLs. Preview/execute remain on the same confirmed resource.
 */
export const STATIC_SOAR_ACTION_CATALOGUE: ResponseAction[] = [
  {
    id: 'isolate_host',
    name: 'Isolate Host',
    description: 'Isolate a host from the network while preserving management connectivity.',
    category: 'containment',
    targetType: 'host',
    parameters: [],
    integrationStatus: 'unavailable',
    riskLevel: 'critical',
    requiredRole: 'ROLE_SOC_MANAGER',
  },
  {
    id: 'kill_process',
    name: 'Kill Process',
    description: 'Terminate a selected process on the target host.',
    category: 'containment',
    targetType: 'process',
    parameters: [],
    integrationStatus: 'unavailable',
    riskLevel: 'high',
    requiredRole: 'ROLE_SOC_ANALYST',
  },
  {
    id: 'block_ip',
    name: 'Block IP Address',
    description: 'Add an IP to an authorized network enforcement block list.',
    category: 'containment',
    targetType: 'ip',
    parameters: [],
    integrationStatus: 'unavailable',
    riskLevel: 'medium',
    requiredRole: 'ROLE_SOC_ANALYST',
  },
  {
    id: 'collect_forensics',
    name: 'Collect Forensic Artifacts',
    description: 'Collect bounded forensic artifacts from the target host.',
    category: 'investigation',
    targetType: 'host',
    parameters: [],
    integrationStatus: 'unavailable',
    riskLevel: 'low',
    requiredRole: 'ROLE_SOC_ANALYST',
  },
];

export async function fetchResponseActions(): Promise<ResponseAction[]> {
  try {
    return await apiClient.get<ResponseAction[]>('/response/actions');
  } catch {
    // Fail closed: static catalogue for display; integrations marked unavailable.
    return STATIC_SOAR_ACTION_CATALOGUE.map((action) => ({ ...action }));
  }
}

/** ALT-010: Preview the impact of a response action without executing it */
export async function previewAction(
  actionId: string,
  body: { targetId: string; parameters: Record<string, unknown> }
): Promise<ActionPreview> {
  return apiClient.post<ActionPreview>(
    `/response/actions/${encodeURIComponent(actionId)}/preview`,
    body
  );
}

/** ALT-010: Execute a response action (requires prior preview) */
export async function executeAction(
  actionId: string,
  body: {
    targetId: string;
    parameters: Record<string, unknown>;
    previewToken: string;
    approvedBy?: string;
  }
): Promise<{ jobId: string; status: string }> {
  return apiClient.post<{ jobId: string; status: string }>(
    `/response/actions/${encodeURIComponent(actionId)}/execute`,
    body
  );
}

/** ALT-010: Fetch the status of an async response action job */
export async function fetchJobStatus(jobId: string): Promise<ResponseJob> {
  return apiClient.get<ResponseJob>(
    `/response/jobs/${encodeURIComponent(jobId)}`
  );
}

export interface AlertEnrichmentResult {
  summary: string;
  tactics: string[];
  recommendedActions: string[];
  finding: import('@/types/intelligenceFinding.types').IntelligenceFindingDTO;
}

/** Ask Hive — POST /ha-soc-ai/enrich-alert (graceful when AI is not configured). */
export async function enrichAlertWithAi(alertId: string): Promise<AlertEnrichmentResult> {
  return apiClient.post<AlertEnrichmentResult>('/ha-soc-ai/enrich-alert', { alertId });
}
