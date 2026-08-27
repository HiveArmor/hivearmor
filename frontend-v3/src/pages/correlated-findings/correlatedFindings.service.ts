import type {
  CorrelatedFindingDTO,
  CorrelatedFindingsFilter,
  CorrelatedFindingsResponse,
  CorrelatedFindingStatus,
  CorrelationKind,
  FindingAvailableAction,
  FindingEntity,
  FindingPromotionPreview,
  FindingSignal,
} from './correlatedFindings.types';

import { apiClient } from '@/lib/apiClient';
import type { SeverityLevel } from '@/lib/severity';
import {
  getOffense,
  getOffenseAlerts,
  getOffenses,
  type OffenseAlertRef,
  type OffenseDTO,
  type OffenseStatusValue,
} from '@/services/offenses.service';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const RESULT_LIMIT = 25;

/** Staging-primary contract marker — list loads via GET /api/offenses. */
export const CORRELATED_FINDINGS_LIST_CONTRACT = 'GET /api/offenses';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function textValue(...values: unknown[]): string | undefined {
  const match = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof match === 'string' ? match : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item : textValue(asRecord(item).name, asRecord(item).id)).filter((item): item is string => Boolean(item))
    : [];
}

function normalizeSeverity(value: unknown): SeverityLevel {
  const severity = String(value ?? '').toLowerCase();
  return severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low' || severity === 'info'
    ? severity
    : 'info';
}

function normalizeStatus(value: unknown): CorrelatedFindingStatus {
  const status = String(value ?? '').toLowerCase();
  if (status === 'investigating' || status === 'reviewing') return 'investigating';
  if (status === 'incident_created' || status === 'promoted') return 'incident_created';
  if (status === 'resolved') return 'resolved';
  if (status === 'false_positive' || status === 'dismissed') return 'false_positive';
  return 'open';
}

function normalizeEntityType(value: unknown): FindingEntity['type'] {
  const type = String(value ?? '').toLowerCase();
  return type === 'host' || type === 'user' || type === 'ip' || type === 'domain' || type === 'process' || type === 'file' || type === 'cloud'
    ? type
    : 'host';
}

function normalizeEntityRole(value: unknown): FindingEntity['role'] {
  const role = String(value ?? '').toLowerCase();
  if (role === 'attacker' || role === 'source') return 'source';
  if (role === 'target' || role === 'victim' || role === 'compromised') return 'target';
  if (role === 'infrastructure' || role === 'c2_exfil') return 'infrastructure';
  return 'pivot';
}

function normalizeActionId(value: unknown): FindingAvailableAction['id'] | null {
  const action = String(value ?? '').toLowerCase();
  if (action === 'assign' || action === 'assignment') return 'assign';
  if (action === 'promote' || action === 'promote_incident' || action === 'incident-promotion') return 'promote_incident';
  if (action === 'add_note' || action === 'note' || action === 'notes') return 'add_note';
  if (action === 'change_status' || action === 'review' || action === 'confirm' || action === 'dismiss' || action === 'reopen') return 'change_status';
  return null;
}

function normalizeCorrelationKind(value: unknown, tactics: string[], reasons: UnknownRecord[]): CorrelationKind {
  const kind = String(value ?? '').toLowerCase();
  if (kind === 'attack_chain' || kind === 'shared_entity' || kind === 'behavior_sequence' || kind === 'campaign' || kind === 'duplicate_cluster') return kind;
  if (reasons.some((reason) => reason.type === 'behavior_sequence')) return 'behavior_sequence';
  if (reasons.some((reason) => reason.type === 'shared_entity') && tactics.length < 3) return 'shared_entity';
  return 'attack_chain';
}

export function normalizeCorrelatedFinding(value: unknown): CorrelatedFindingDTO {
  if (isCorrelatedFindingDTO(value)) return value;

  const finding = asRecord(value);
  const rawEntities = asRecords(finding.entities);
  const rawReasons = asRecords(finding.correlationReasons);
  const rawTimeline = asRecords(Array.isArray(finding.stages) ? finding.stages : finding.timeline);
  const rawSignals = asRecords(Array.isArray(finding.signals) ? finding.signals : finding.alerts);
  const tactics = stringList(finding.mitreTactics);
  const techniques = stringList(finding.mitreTechniques);
  const firstTimeline = rawTimeline[0];
  const lastTimeline = rawTimeline[rawTimeline.length - 1];
  const firstSeen = textValue(finding.firstSeen, finding.createdAt, firstTimeline?.detectedAt, firstTimeline?.timestamp, finding['@timestamp']) ?? new Date(0).toISOString();
  const lastSeen = textValue(finding.lastSeen, finding.updatedAt, lastTimeline?.detectedAt, lastTimeline?.timestamp, finding['@timestamp'], firstSeen) ?? firstSeen;
  const id = textValue(finding.id, finding.findingId) ?? 'finding-id-unavailable';
  const title = textValue(finding.title) ?? 'Untitled correlated finding';
  const summary = textValue(finding.summary, finding.description, asRecord(finding.narrative).summary) ?? 'Correlation narrative is not available in the current projection.';
  const confidenceRaw = numericValue(finding.confidence) ?? 0;
  const confidence = Math.round(confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw);

  const entities: FindingEntity[] = rawEntities.map((entity, index) => ({
    id: textValue(entity.id) ?? `${id}-entity-${index + 1}`,
    type: normalizeEntityType(entity.type),
    label: textValue(entity.label, entity.value, entity.name) ?? 'Restricted entity',
    role: normalizeEntityRole(entity.role),
    riskScore: numericValue(entity.riskScore) ?? null,
    criticality: ['critical', 'high', 'medium', 'low'].includes(String(entity.criticality))
      ? entity.criticality as FindingEntity['criticality']
      : null,
    alertCount: numericValue(entity.alertCount) ?? numericValue(entity.signalCount) ?? 0,
  }));

  const reasons = rawReasons.map((reason, index) => ({
    id: textValue(reason.id) ?? `${id}-reason-${index + 1}`,
    kind: reason.type === 'shared_entity' ? 'shared_entity' as const
      : reason.type === 'temporal_proximity' ? 'temporal_sequence' as const
        : reason.type === 'threat_intel' ? 'threat_intel' as const
          : reason.type === 'campaign_overlap' ? 'campaign_overlap' as const
            : 'behavioral_pattern' as const,
    label: textValue(reason.label, reason.description, reason.type)?.replace(/_/g, ' ') ?? 'Correlation evidence',
    detail: textValue(reason.detail, reason.description, reason.evidence) ?? 'Supporting evidence is available in the full projection.',
    strength: Math.round((numericValue(reason.strength) ?? numericValue(reason.confidence) ?? 0) * ((numericValue(reason.strength) ?? numericValue(reason.confidence) ?? 0) <= 1 ? 100 : 1)),
    evidenceCount: numericValue(reason.evidenceCount) ?? 1,
  }));

  const stages = rawTimeline.map((stage, index) => ({
    id: textValue(stage.id) ?? `${id}-stage-${index + 1}`,
    order: numericValue(stage.order) ?? index + 1,
    detectedAt: textValue(stage.detectedAt, stage.timestamp, firstSeen) ?? firstSeen,
    tactic: textValue(stage.tactic, stage.mitreTactic, stage.stage, tactics[index]) ?? 'Observed activity',
    technique: textValue(stage.technique, stage.mitreTechnique) ?? null,
    title: textValue(stage.title, stage.description) ?? 'Correlated activity',
    alertIds: stringList(stage.alertIds ?? stage.signalIds),
  }));

  const leadEntity = entities.find((entity) => entity.role === 'target') ?? entities.find((entity) => entity.role !== 'source') ?? entities[0];
  const signals = rawSignals.map((signal, index) => ({
    id: textValue(signal.id) ?? `${id}-signal-${index + 1}`,
    alertId: textValue(signal.alertId, signal.id) ?? `${id}-alert-${index + 1}`,
    detectedAt: textValue(signal.detectedAt, signal.timestamp, stages[index]?.detectedAt, firstSeen) ?? firstSeen,
    title: textValue(signal.title, signal.description, signal.ruleName) ?? 'Supporting alert',
    severity: normalizeSeverity(signal.severity),
    category: textValue(signal.category, signal.stage) ?? 'correlation',
    ruleName: textValue(signal.ruleName, signal.title) ?? 'Correlation source',
    entityLabel: textValue(signal.entityLabel, leadEntity?.label) ?? 'Authorized scope',
    tactic: textValue(signal.tactic, signal.stage, stages[index]?.tactic) ?? null,
    technique: textValue(signal.technique, signal.mitreTechnique, stages[index]?.technique) ?? null,
  }));

  const rawNodes = asRecords(finding.relationshipNodes ?? asRecord(finding.relationshipGraph).nodes);
  const relationshipNodes = (rawNodes.length ? rawNodes : rawEntities).map((node, index) => ({
    id: textValue(node.id) ?? `${id}-node-${index + 1}`,
    label: textValue(node.label, node.value, node.name) ?? 'Restricted entity',
    type: normalizeEntityType(node.type),
    severity: node.severity ? normalizeSeverity(node.severity) : null,
    x: numericValue(node.x) ?? 18 + (index % 4) * 24,
    y: numericValue(node.y) ?? 20 + Math.floor(index / 4) * 32,
  }));
  const rawEdges = asRecords(finding.relationshipEdges ?? finding.relationships ?? asRecord(finding.relationshipGraph).edges);
  const relationshipEdges = rawEdges.map((edge, index) => ({
    id: textValue(edge.id) ?? `${id}-edge-${index + 1}`,
    source: textValue(edge.source, edge.sourceEntity, edge.sourceId) ?? '',
    target: textValue(edge.target, edge.targetEntity, edge.targetId) ?? '',
    label: textValue(edge.label, edge.type) ?.replace(/_/g, ' ') ?? 'related to',
    confidence: Math.round((numericValue(edge.confidence) ?? 0) * ((numericValue(edge.confidence) ?? 0) <= 1 ? 100 : 1)),
  })).filter((edge) => edge.source && edge.target);

  const normalizedActions = asRecords(finding.availableActions).flatMap((action) => {
    const actionId = normalizeActionId(action.id ?? action.type);
    return actionId ? [{ id: actionId, allowed: action.allowed !== false && action.enabled !== false, reason: textValue(action.reason) }] : [];
  });
  const actions = Array.from(new Map(normalizedActions.map((action) => [action.id, action])).values());
  const narrative = asRecord(finding.narrative);
  const correlationEngine = asRecord(finding.correlationEngine);
  const owner = asRecord(finding.owner);
  const assignee = textValue(finding.assignee);
  const incident = asRecord(finding.incident);
  const riskScore = numericValue(finding.riskScore) ?? null;

  return {
    id,
    title,
    summary,
    severity: normalizeSeverity(finding.severity),
    riskScore,
    confidence,
    status: normalizeStatus(finding.status),
    correlationKind: normalizeCorrelationKind(finding.correlationKind, tactics, rawReasons),
    firstSeen,
    lastSeen,
    alertCount: numericValue(finding.alertCount) ?? numericValue(finding.signalCount) ?? rawSignals.length,
    eventCount: numericValue(finding.eventCount) ?? 0,
    dataSourceCount: numericValue(finding.dataSourceCount) ?? 0,
    intelMatchCount: numericValue(finding.intelMatchCount) ?? 0,
    relatedFindingCount: numericValue(finding.relatedFindingCount) ?? 0,
    tenantName: textValue(finding.tenantName) ?? 'Authorized tenant',
    owner: textValue(owner.name) ? { id: textValue(owner.id) ?? textValue(owner.name) ?? 'assigned', name: textValue(owner.name) ?? 'Assigned analyst' }
      : assignee ? { id: assignee, name: assignee } : null,
    slaStatus: finding.slaStatus === 'on_track' || finding.slaStatus === 'at_risk' || finding.slaStatus === 'breached' ? finding.slaStatus : 'none',
    mitreTactics: tactics,
    mitreTechniques: techniques,
    entities,
    correlationReasons: reasons,
    stages,
    signals,
    relationshipNodes,
    relationshipEdges,
    narrative: {
      summary: textValue(narrative.summary, summary) ?? summary,
      keyJudgments: stringList(narrative.keyJudgments).length ? stringList(narrative.keyJudgments) : reasons.slice(0, 3).map((reason) => reason.detail),
      source: narrative.source === 'analyst' || narrative.source === 'ai_assisted' ? narrative.source : 'correlation_engine',
      generatedAt: textValue(narrative.generatedAt, lastSeen) ?? lastSeen,
      confidence: numericValue(narrative.confidence) ?? confidence,
    },
    availableActions: actions,
    correlationEngine: {
      version: textValue(correlationEngine.version) ?? 'producer version unavailable',
      ruleIds: stringList(correlationEngine.ruleIds),
      evaluatedAt: textValue(correlationEngine.evaluatedAt, lastSeen) ?? lastSeen,
    },
    incident: textValue(incident.id) ? { id: textValue(incident.id) ?? '', title: textValue(incident.title) ?? textValue(incident.id) ?? 'Incident' } : null,
    version: numericValue(finding.version) ?? 0,
    dataCompleteness: finding.dataCompleteness === 'complete' && riskScore !== null ? 'complete' : 'projection',
  };
}

export function isCorrelatedFindingDTO(value: unknown): value is CorrelatedFindingDTO {
  if (!value || typeof value !== 'object') return false;
  const finding = value as Partial<CorrelatedFindingDTO>;
  return typeof finding.id === 'string'
    && typeof finding.title === 'string'
    && typeof finding.summary === 'string'
    && typeof finding.riskScore === 'number'
    && typeof finding.confidence === 'number'
    && typeof finding.firstSeen === 'string'
    && typeof finding.lastSeen === 'string'
    && Array.isArray(finding.entities)
    && Array.isArray(finding.signals)
    && Array.isArray(finding.correlationReasons);
}

function matchesView(finding: CorrelatedFindingDTO, view: CorrelatedFindingsFilter['view']): boolean {
  if (view === 'open' || view === 'needs_review') return finding.status === 'open' || finding.status === 'investigating';
  if (view === 'mine') return finding.owner?.id === 'usr-41' && (finding.status === 'open' || finding.status === 'investigating');
  if (view === 'critical') return finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive';
  if (view === 'multi_stage') return finding.mitreTactics.length >= 3 && finding.status !== 'resolved' && finding.status !== 'false_positive';
  if (view === 'sla_risk') return finding.slaStatus === 'at_risk' || finding.slaStatus === 'breached';
  if (view === 'unassigned') return !finding.owner && (finding.status === 'open' || finding.status === 'investigating');
  return true;
}

function offenseStatusToFinding(value: unknown): CorrelatedFindingStatus {
  const status = String(value ?? '').toLowerCase();
  if (status === 'reviewing' || status === 'confirmed' || status === 'in_progress' || status === 'investigating') return 'investigating';
  if (status === 'promoted' || status === 'incident_created') return 'incident_created';
  if (status === 'closed' || status === 'resolved') return 'resolved';
  if (status === 'dismissed' || status === 'false_positive') return 'false_positive';
  return 'open';
}

function findingStatusToOffenseParam(status: CorrelatedFindingStatus | undefined): OffenseStatusValue | undefined {
  if (!status) return undefined;
  if (status === 'investigating') return 'reviewing';
  if (status === 'incident_created') return 'promoted';
  if (status === 'resolved') return 'closed';
  if (status === 'false_positive') return 'dismissed';
  return 'open';
}

/** Map allowlisted offense UI status → PUT /api/offenses/{id}/status body. */
export function findingUiStatusToOffenseStatus(status: CorrelatedFindingStatus): OffenseStatusValue {
  return findingStatusToOffenseParam(status) ?? 'open';
}

function asOffenseRecord(value: unknown): OffenseDTO {
  const row = asRecord(value);
  const id = textValue(row.id, row._id) ?? 'offense-id-unavailable';
  return {
    id,
    name: textValue(row.name, row.title) ?? 'Untitled correlated finding',
    description: textValue(row.description, row.summary),
    severity: normalizeSeverity(row.severity),
    status: (offenseStatusToFinding(row.status) === 'investigating'
      ? 'in_progress'
      : offenseStatusToFinding(row.status) === 'false_positive'
        ? 'false_positive'
        : offenseStatusToFinding(row.status) === 'resolved'
          ? 'resolved'
          : 'open') as OffenseDTO['status'],
    alertCount: numericValue(row.alertCount) ?? (Array.isArray(row.alerts) ? row.alerts.length : 0),
    firstEventTimestamp: textValue(row.firstEventTimestamp, row.firstSeen, row.createdAt, row['@timestamp']) ?? new Date(0).toISOString(),
    lastEventTimestamp: textValue(row.lastEventTimestamp, row.lastSeen, row.updatedAt, row['@timestamp']) ?? new Date(0).toISOString(),
    tenant: row.tenant && typeof row.tenant === 'object' ? row.tenant as OffenseDTO['tenant'] : undefined,
    mitreTechniques: Array.isArray(row.mitreTechniques) ? row.mitreTechniques as OffenseDTO['mitreTechniques'] : undefined,
    sourceIps: stringList(row.sourceIps),
    targetIps: stringList(row.targetIps),
    users: stringList(row.users),
  };
}

function signalsFromOffenseAlerts(findingId: string, alerts: OffenseAlertRef[]): FindingSignal[] {
  return alerts.map((alert, index) => ({
    id: `${findingId}-alert-${alert.id || index + 1}`,
    alertId: alert.id,
    detectedAt: alert.timestamp || new Date(0).toISOString(),
    title: alert.title || 'Supporting alert',
    severity: normalizeSeverity(alert.severity),
    category: 'correlation',
    ruleName: alert.title || 'Correlated alert',
    entityLabel: textValue(alert.sourceIp, alert.destinationIp) ?? 'Authorized scope',
    tactic: null,
    technique: null,
  }));
}

/**
 * Projects a confirmed `/api/offenses` document into the workbench DTO.
 * Narrative/graph fields stay honest projections — not invented attack stories.
 */
export function mapOffenseToCorrelatedFinding(
  value: unknown,
  alerts: OffenseAlertRef[] = []
): CorrelatedFindingDTO {
  const offense = asOffenseRecord(value);
  const detail = value && typeof value === 'object' ? asRecord(value) : {};
  const mitreTechniques = (offense.mitreTechniques ?? []).map((tech) => textValue(tech.id, tech.name) ?? '').filter(Boolean);
  const tactics = stringList(detail.mitreTactics);
  const entities: FindingEntity[] = [
    ...((offense.sourceIps ?? []).map((ip, index) => ({
      id: `${offense.id}-src-${index}`,
      type: 'ip' as const,
      label: ip,
      role: 'source' as const,
      riskScore: null,
      criticality: null,
      alertCount: 0,
    }))),
    ...((offense.targetIps ?? []).map((ip, index) => ({
      id: `${offense.id}-dst-${index}`,
      type: 'ip' as const,
      label: ip,
      role: 'target' as const,
      riskScore: null,
      criticality: null,
      alertCount: 0,
    }))),
    ...((offense.users ?? []).map((user, index) => ({
      id: `${offense.id}-user-${index}`,
      type: 'user' as const,
      label: user,
      role: 'pivot' as const,
      riskScore: null,
      criticality: null,
      alertCount: 0,
    }))),
  ];
  const signals = alerts.length
    ? signalsFromOffenseAlerts(offense.id, alerts)
    : signalsFromOffenseAlerts(offense.id, Array.isArray(detail.alerts)
      ? (detail.alerts as UnknownRecord[]).map((alert, index) => ({
          id: textValue(alert.id) ?? `${offense.id}-embedded-${index}`,
          title: textValue(alert.title, alert.name) ?? 'Supporting alert',
          severity: normalizeSeverity(alert.severity),
          timestamp: textValue(alert.timestamp, alert.detectedAt, offense.firstEventTimestamp) ?? offense.firstEventTimestamp,
          sourceIp: textValue(alert.sourceIp),
          destinationIp: textValue(alert.destinationIp),
        }))
      : []);

  const summary = offense.description
    ?? 'Related alerts rolled into one correlated finding. Full narrative projection is incomplete until the correlation detail contract returns it.';

  return {
    id: offense.id,
    title: offense.name,
    summary,
    severity: offense.severity,
    riskScore: numericValue(detail.riskScore) ?? null,
    confidence: Math.round((numericValue(detail.confidence) ?? 0) * ((numericValue(detail.confidence) ?? 0) <= 1 ? 100 : 1)),
    status: offenseStatusToFinding(detail.status ?? offense.status),
    correlationKind: normalizeCorrelationKind(detail.correlationKind, tactics, []),
    firstSeen: offense.firstEventTimestamp,
    lastSeen: offense.lastEventTimestamp,
    alertCount: offense.alertCount || signals.length,
    eventCount: numericValue(detail.eventCount) ?? 0,
    dataSourceCount: numericValue(detail.dataSourceCount) ?? 0,
    intelMatchCount: numericValue(detail.intelMatchCount) ?? 0,
    relatedFindingCount: numericValue(detail.relatedFindingCount) ?? 0,
    tenantName: textValue(asRecord(offense.tenant).name, detail.tenantName) ?? 'Authorized tenant',
    owner: textValue(detail.assignee, asRecord(detail.owner).name)
      ? { id: textValue(detail.assignee, asRecord(detail.owner).id) ?? 'assigned', name: textValue(detail.assignee, asRecord(detail.owner).name) ?? 'Assigned analyst' }
      : null,
    slaStatus: 'none',
    mitreTactics: tactics,
    mitreTechniques,
    entities,
    correlationReasons: [{
      id: `${offense.id}-reason-offense`,
      kind: 'shared_entity',
      label: 'Offense-index correlation',
      detail: 'This finding is loaded from GET /api/offenses. Supporting alerts load from GET /api/offenses/{id}/alerts when present.',
      strength: 50,
      evidenceCount: Math.max(1, offense.alertCount || signals.length),
    }],
    stages: [],
    signals,
    relationshipNodes: entities.slice(0, 8).map((entity, index) => ({
      id: entity.id,
      label: entity.label,
      type: entity.type,
      severity: null,
      x: 18 + (index % 4) * 24,
      y: 24 + Math.floor(index / 4) * 36,
    })),
    relationshipEdges: [],
    narrative: {
      summary,
      keyJudgments: [
        `${offense.alertCount || signals.length} related alert signal(s) are associated with this finding.`,
        'Promote to an incident only when case ownership is required — Incidents own response workflow.',
      ],
      source: 'correlation_engine',
      generatedAt: offense.lastEventTimestamp,
      confidence: 0,
    },
    availableActions: [
      { id: 'change_status', allowed: true },
      {
        id: 'promote_incident',
        allowed: false,
        reason: 'Incident promotion preview requires the correlated-findings promotion contract. Open Incidents to create a case, or retry when COR promotion is available for this id.',
      },
    ],
    correlationEngine: {
      version: textValue(asRecord(detail.correlationEngine).version) ?? 'offense-index',
      ruleIds: stringList(asRecord(detail.correlationEngine).ruleIds),
      evaluatedAt: offense.lastEventTimestamp,
    },
    incident: null,
    version: numericValue(detail.version) ?? 0,
    dataCompleteness: 'projection',
  };
}

function buildSummaryFromItems(items: CorrelatedFindingDTO[], snapshotAt: string): CorrelatedFindingsResponse['summary'] {
  return {
    total: items.length,
    open: items.filter((finding) => finding.status === 'open' || finding.status === 'investigating').length,
    critical: items.filter((finding) => finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive').length,
    unassigned: items.filter((finding) => !finding.owner && (finding.status === 'open' || finding.status === 'investigating')).length,
    slaPressure: items.filter((finding) => finding.slaStatus === 'at_risk' || finding.slaStatus === 'breached').length,
    multiStage: items.filter((finding) => finding.mitreTactics.length >= 3 && finding.status !== 'resolved' && finding.status !== 'false_positive').length,
    newLast24h: items.filter((finding) => new Date(snapshotAt).getTime() - new Date(finding.firstSeen).getTime() <= 86_400_000).length,
  };
}

async function fetchOffensesAsFindings(
  filters: CorrelatedFindingsFilter,
  signal?: AbortSignal
): Promise<CorrelatedFindingsResponse> {
  void signal;
  const statusParam = filters.view === 'open' || filters.view === 'needs_review'
    ? 'open'
    : findingStatusToOffenseParam(filters.status);
  const page = await getOffenses({
    page: 0,
    size: RESULT_LIMIT,
    status: statusParam,
    severity: filters.severity,
  });
  let items = page.items.map((item) => mapOffenseToCorrelatedFinding(item));
  const search = filters.search?.trim().toLocaleLowerCase();
  if (filters.view === 'critical') {
    items = items.filter((finding) => finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive');
  }
  if (filters.severity) {
    items = items.filter((finding) => finding.severity === filters.severity);
  }
  if (search) {
    items = items.filter((finding) => {
      const haystack = [finding.id, finding.title, finding.summary, finding.tenantName, ...finding.entities.map((entity) => entity.label)].join(' ').toLocaleLowerCase();
      return haystack.includes(search);
    });
  }
  items = [...items].sort((left, right) => {
    if (filters.sort === 'newest') return new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime();
    if (filters.sort === 'confidence_desc') return right.confidence - left.confidence;
    if (filters.sort === 'alerts_desc') return right.alertCount - left.alertCount;
    return (right.riskScore ?? -1) - (left.riskScore ?? -1) || new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime();
  });
  const snapshotAt = filters.to;
  return {
    summary: buildSummaryFromItems(items, snapshotAt),
    items,
    total: page.total > 0 ? page.total : items.length,
    nextCursor: null,
    snapshotAt,
    totalApproximate: page.total === 0 && items.length > 0,
    dataCompleteness: 'projection',
  };
}

export function buildCorrelatedFindingsFixture(
  source: CorrelatedFindingDTO[],
  filters: CorrelatedFindingsFilter
): CorrelatedFindingsResponse {
  const from = new Date(filters.from).getTime();
  const to = new Date(filters.to).getTime();
  const timeScoped = source.filter((finding) => {
    const lastSeen = new Date(finding.lastSeen).getTime();
    return lastSeen >= from && lastSeen <= to;
  });
  const search = filters.search?.trim().toLocaleLowerCase();
  const filtered = timeScoped.filter((finding) => {
    if (!matchesView(finding, filters.view)) return false;
    if (filters.severity && finding.severity !== filters.severity) return false;
    if (filters.status && finding.status !== filters.status) return false;
    if (filters.ownership === 'mine' && finding.owner?.id !== 'usr-41') return false;
    if (filters.ownership === 'unassigned' && finding.owner) return false;
    if (search) {
      const haystack = [
        finding.id,
        finding.title,
        finding.summary,
        finding.tenantName,
        ...finding.entities.map((entity) => entity.label),
        ...finding.mitreTechniques,
      ].join(' ').toLocaleLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === 'newest') return new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime() || left.id.localeCompare(right.id);
    if (filters.sort === 'confidence_desc') return right.confidence - left.confidence || (right.riskScore ?? -1) - (left.riskScore ?? -1) || left.id.localeCompare(right.id);
    if (filters.sort === 'alerts_desc') return right.alertCount - left.alertCount || (right.riskScore ?? -1) - (left.riskScore ?? -1) || left.id.localeCompare(right.id);
    return (right.riskScore ?? -1) - (left.riskScore ?? -1) || new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime() || left.id.localeCompare(right.id);
  });

  return {
    summary: {
      total: timeScoped.length,
      open: timeScoped.filter((finding) => finding.status === 'open' || finding.status === 'investigating').length,
      critical: timeScoped.filter((finding) => finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive').length,
      unassigned: timeScoped.filter((finding) => !finding.owner && (finding.status === 'open' || finding.status === 'investigating')).length,
      slaPressure: timeScoped.filter((finding) => finding.slaStatus === 'at_risk' || finding.slaStatus === 'breached').length,
      multiStage: timeScoped.filter((finding) => finding.mitreTactics.length >= 3 && finding.status !== 'resolved' && finding.status !== 'false_positive').length,
      newLast24h: timeScoped.filter((finding) => to - new Date(finding.firstSeen).getTime() <= 86_400_000).length,
    },
    items: sorted.slice(0, RESULT_LIMIT),
    total: sorted.length,
    nextCursor: sorted.length > RESULT_LIMIT ? `fixture-${RESULT_LIMIT}` : null,
    snapshotAt: filters.to,
    totalApproximate: false,
    dataCompleteness: 'complete',
  };
}

export async function fetchCorrelatedFindings(
  filters: CorrelatedFindingsFilter,
  signal?: AbortSignal
): Promise<CorrelatedFindingsResponse> {
  if (fixtureMode) {
    const { foundationCorrelatedFindings } = await import('./correlatedFindings.fixtures');
    return buildCorrelatedFindingsFixture(foundationCorrelatedFindings, filters);
  }
  // Staging-primary: confirmed GET /api/offenses (page/size → X-Total-Count).
  // COR /ha-correlated-findings remains optional enrichment — not required for list.
  return fetchOffensesAsFindings(filters, signal);
}

export async function fetchCorrelatedFindingDetail(id: string, signal?: AbortSignal): Promise<CorrelatedFindingDTO> {
  if (fixtureMode) {
    const { getFoundationCorrelatedFinding } = await import('./correlatedFindings.fixtures');
    const finding = getFoundationCorrelatedFinding(id);
    if (!finding) throw new Error(`Correlated finding ${id} was not found.`);
    return finding;
  }
  void signal;
  try {
    const [offense, alerts] = await Promise.all([
      getOffense(id),
      getOffenseAlerts(id).catch(() => [] as OffenseAlertRef[]),
    ]);
    return mapOffenseToCorrelatedFinding(offense, Array.isArray(alerts) ? alerts : []);
  } catch (offenseError) {
    // Honest fallback: try COR detail if offense document is missing for this id.
    try {
      const response = await apiClient.get<unknown>(`/ha-correlated-findings/${encodeURIComponent(id)}`, { signal });
      const envelope = asRecord(response);
      return normalizeCorrelatedFinding(envelope.finding ?? response);
    } catch {
      throw offenseError instanceof Error ? offenseError : new Error(`Correlated finding ${id} was not found.`);
    }
  }
}

export async function previewFindingPromotion(id: string): Promise<FindingPromotionPreview> {
  if (fixtureMode) {
    const finding = await fetchCorrelatedFindingDetail(id);
    return {
      findingId: id,
      proposedTitle: finding.title,
      alertCount: finding.alertCount,
      entityCount: finding.entities.length,
      duplicateCandidates: finding.relatedFindingCount ? [{ id: 'INC-2026-00391', title: 'Suspicious privileged access activity', overlapPercent: 18 }] : [],
      warnings: finding.slaStatus === 'breached' ? ['The correlation has breached its triage SLA.'] : [],
      previewToken: `fixture-preview-${id}`,
    };
  }
  return apiClient.post<FindingPromotionPreview>(`/ha-correlated-findings/${encodeURIComponent(id)}/incident-promotion/preview`);
}

export async function promoteFindingToIncident(id: string, previewToken: string): Promise<{ incidentId: string; auditId: string }> {
  if (fixtureMode) return { incidentId: 'INC-SIMULATED', auditId: `AUDIT-${id}` };
  return apiClient.post<{ incidentId: string; auditId: string }>(
    `/ha-correlated-findings/${encodeURIComponent(id)}/incident-promotion/execute`,
    { previewToken },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } }
  );
}

export { fixtureMode as correlatedFindingsFixtureMode };
