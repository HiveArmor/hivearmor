import type {
  CorrelatedFindingDTO,
  CorrelatedFindingsFilter,
  CorrelatedFindingsResponse,
  CorrelatedFindingStatus,
  CorrelationKind,
  FindingAvailableAction,
  FindingEntity,
  FindingPromotionPreview,
} from './correlatedFindings.types';

import { apiClient } from '@/lib/apiClient';
import type { SeverityLevel } from '@/lib/severity';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const RESULT_LIMIT = 25;

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
  if (view === 'needs_review') return finding.status === 'open' || finding.status === 'investigating';
  if (view === 'mine') return finding.owner?.id === 'usr-41' && (finding.status === 'open' || finding.status === 'investigating');
  if (view === 'critical') return finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive';
  if (view === 'multi_stage') return finding.mitreTactics.length >= 3 && finding.status !== 'resolved' && finding.status !== 'false_positive';
  if (view === 'sla_risk') return finding.slaStatus === 'at_risk' || finding.slaStatus === 'breached';
  if (view === 'unassigned') return !finding.owner && (finding.status === 'open' || finding.status === 'investigating');
  return true;
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
  const response = await apiClient.get<unknown>('/ha-correlated-findings', {
    signal,
    params: { ...filters, limit: RESULT_LIMIT } as unknown as Record<string, string | number | boolean | string[] | undefined>,
  });
  const envelope = asRecord(response);
  const items = Array.isArray(envelope.items) ? envelope.items.map(normalizeCorrelatedFinding) : [];
  const rawSummary = asRecord(envelope.summary);
  const bySeverity = asRecord(rawSummary.bySeverity);
  const byStatus = asRecord(rawSummary.byStatus);
  const snapshotAt = textValue(envelope.snapshotAt, items[0]?.lastSeen, filters.to) ?? filters.to;
  const open = numericValue(rawSummary.open)
    ?? (numericValue(byStatus.open) ?? 0) + (numericValue(byStatus.new) ?? 0) + (numericValue(byStatus.reviewing) ?? 0) + (numericValue(byStatus.investigating) ?? 0);
  return {
    summary: {
      total: numericValue(rawSummary.total) ?? numericValue(envelope.total) ?? items.length,
      open,
      critical: numericValue(rawSummary.critical) ?? numericValue(bySeverity.critical) ?? items.filter((item) => item.severity === 'critical').length,
      unassigned: numericValue(rawSummary.unassigned) ?? items.filter((item) => !item.owner && (item.status === 'open' || item.status === 'investigating')).length,
      slaPressure: numericValue(rawSummary.slaPressure) ?? items.filter((item) => item.slaStatus === 'at_risk' || item.slaStatus === 'breached').length,
      multiStage: numericValue(rawSummary.multiStage) ?? items.filter((item) => item.mitreTactics.length >= 3).length,
      newLast24h: numericValue(rawSummary.newLast24h) ?? items.filter((item) => new Date(snapshotAt).getTime() - new Date(item.firstSeen).getTime() <= 86_400_000).length,
    },
    items,
    total: numericValue(envelope.total) ?? items.length,
    nextCursor: textValue(envelope.nextCursor, envelope.cursor) ?? null,
    snapshotAt,
    totalApproximate: envelope.totalApproximate === true,
    dataCompleteness: envelope.dataCompleteness === 'complete' && items.every((item) => item.dataCompleteness === 'complete') ? 'complete' : 'projection',
  };
}

export async function fetchCorrelatedFindingDetail(id: string, signal?: AbortSignal): Promise<CorrelatedFindingDTO> {
  if (fixtureMode) {
    const { getFoundationCorrelatedFinding } = await import('./correlatedFindings.fixtures');
    const finding = getFoundationCorrelatedFinding(id);
    if (!finding) throw new Error(`Correlated finding ${id} was not found.`);
    return finding;
  }
  const response = await apiClient.get<unknown>(`/ha-correlated-findings/${encodeURIComponent(id)}`, { signal });
  const envelope = asRecord(response);
  return normalizeCorrelatedFinding(envelope.finding ?? response);
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
    `/ha-correlated-findings/${encodeURIComponent(id)}/incident-promotion`,
    { previewToken },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } }
  );
}

export { fixtureMode as correlatedFindingsFixtureMode };
