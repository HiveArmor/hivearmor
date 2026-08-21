
import type {
  ActivityResponse,
  DossierResponse,
  IncidentLinkExecuteRequest,
  IncidentLinkPreview,
  IncidentLinkPreviewRequest,
  IncidentLinkResult,
  RelatedAlertsResponse,
  RelationshipsResponse,
} from './types/dossier.types';
import type {
  EntCriticality,
  EntEntityType,
  EntObservationSource,
  EntRiskLevel,
  EntRiskTrend,
  EntityListFilters,
  EntityListResponse,
  EntityPivot,
  EntityPreviewResponse,
  EntitySummaryItem,
  EntitySummaryResponse,
} from './types/entity.types';

import {
  foundationEntities,
  getFoundationEntityAlerts,
  getFoundationEntityDetail,
  getFoundationEntityEvents,
} from '@/pages/entities/entities.fixtures';

const FIXTURE_NOW = Date.parse('2026-08-03T13:16:18.000Z');

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 140);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Entity request cancelled', 'AbortError'));
    }, { once: true });
  });
}

function normalizeType(value: string): EntEntityType | null {
  return value === 'host' || value === 'user' || value === 'ip' || value === 'domain' ? value : null;
}

function normalizeRiskLevel(score: number): EntRiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function normalizeTrend(value?: string): EntRiskTrend {
  if (value === 'rising' || value === 'new') return 'rising';
  if (value === 'falling') return 'declining';
  return 'stable';
}

function normalizeCriticality(value?: string): EntCriticality {
  if (value === 'mission_critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}

function normalizeSources(values?: string[]): EntObservationSource[] {
  const mapped = (values ?? []).map((value) => value.toLowerCase()).map((value): EntObservationSource | null => {
    if (value.includes('endpoint') || value === 'edr') return 'endpoint';
    if (value.includes('identity')) return 'identity';
    if (value.includes('cloud')) return 'cloud';
    return 'network';
  });
  return [...new Set(mapped.filter((value): value is EntObservationSource => value !== null))];
}

function pivots(id: string, type: EntEntityType, value: string): EntityPivot[] {
  return [
    { id: `${id}-dossier`, type: 'dossier', label: 'Open dossier', route: `/entities/${id}/dossier`, parameters: { entityId: id }, signature: 'fixture-only' },
    { id: `${id}-hunt`, type: 'hunt', label: 'Hunt activity', route: `/search?q=${encodeURIComponent(type === 'ip' ? `(source.ip:"${value}" OR destination.ip:"${value}")` : `${type === 'domain' ? 'dns.question.name' : `${type}.name`}:"${value}"`)}`, parameters: { entityId: id }, signature: 'fixture-only' },
    { id: `${id}-alerts`, type: 'alerts', label: 'View alerts', route: '/alerts', parameters: { entityId: id }, signature: 'fixture-only' },
    { id: `${id}-incidents`, type: 'incidents', label: 'View incidents', route: '/incidents', parameters: { entityId: id }, signature: 'fixture-only' },
  ];
}

function rows(): EntitySummaryItem[] {
  return foundationEntities.flatMap((entity) => {
    const type = normalizeType(entity.entityType);
    if (!type) return [];
    const value = entity.name ?? entity.hostname ?? entity.ipAddress ?? entity.id;
    return [{
      id: entity.id,
      type,
      value,
      displayName: value,
      riskScore: entity.riskScore,
      riskLevel: normalizeRiskLevel(entity.riskScore),
      riskTrend: normalizeTrend(entity.riskTrend),
      criticality: normalizeCriticality(entity.criticality),
      alertCount: entity.alertCount,
      lastSeen: entity.lastSeen,
      firstSeen: entity.firstSeen ?? entity.lastSeen,
      baselineDeviation: entity.baselineDeviation ?? 1,
      tags: entity.tags ?? [],
      observationSources: normalizeSources(entity.dataSources),
      pivots: pivots(entity.id, type, value),
    }];
  });
}

function filterRows(filters: EntityListFilters): EntitySummaryItem[] {
  const query = filters.q?.toLowerCase();
  return rows().filter((row) => {
    if (filters.types?.length && !filters.types.includes(row.type)) return false;
    if (filters.riskLevels?.length && !filters.riskLevels.includes(row.riskLevel)) return false;
    if (filters.criticality?.length && !filters.criticality.includes(row.criticality)) return false;
    if (filters.alertsActive && row.alertCount === 0) return false;
    if (filters.trendRising && row.riskTrend !== 'rising') return false;
    return !query || [row.value, row.displayName, row.type, ...row.tags].some((value) => value.toLowerCase().includes(query));
  });
}

function sortRows(items: EntitySummaryItem[], sort = 'risk_desc'): EntitySummaryItem[] {
  return [...items].sort((left, right) => {
    if (sort === 'risk_asc') return left.riskScore - right.riskScore || left.id.localeCompare(right.id);
    if (sort === 'last_seen_desc') return Date.parse(right.lastSeen) - Date.parse(left.lastSeen) || left.id.localeCompare(right.id);
    if (sort === 'alert_count_desc') return right.alertCount - left.alertCount || right.riskScore - left.riskScore;
    if (sort === 'name_asc') return left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id);
    return right.riskScore - left.riskScore || left.id.localeCompare(right.id);
  });
}

export async function listFoundationEntities(filters: EntityListFilters, signal?: AbortSignal): Promise<EntityListResponse> {
  await delay(signal);
  const filtered = sortRows(filterRows(filters), filters.sort);
  const offset = filters.cursor ? Number(filters.cursor.replace('entity-fixture-', '')) : 0;
  const limit = Math.min(filters.limit ?? 25, 100);
  const items = filtered.slice(offset, offset + limit);
  const next = offset + items.length;
  return { items, cursor: next < filtered.length ? `entity-fixture-${next}` : null, total: filtered.length };
}

export async function getFoundationSummary(filters: EntityListFilters, signal?: AbortSignal): Promise<EntitySummaryResponse> {
  await delay(signal);
  const items = filterRows(filters);
  const count = (key: keyof EntitySummaryItem, value: string): number => items.filter((item) => item[key] === value).length;
  const facet = (key: keyof EntitySummaryItem): Record<string, number> => items.reduce<Record<string, number>>((result, item) => {
    const value = item[key];
    if (Array.isArray(value)) value.forEach((entry) => { result[String(entry)] = (result[String(entry)] ?? 0) + 1; });
    else result[String(value)] = (result[String(value)] ?? 0) + 1;
    return result;
  }, {});
  return {
    summary: {
      total: items.length,
      highRisk: items.filter((item) => item.riskScore >= 60).length,
      rising: count('riskTrend', 'rising'),
      activeAlerts: items.filter((item) => item.alertCount > 0).length,
      newEntities24h: items.filter((item) => FIXTURE_NOW - Date.parse(item.firstSeen) <= 86_400_000).length,
    },
    facets: { byType: facet('type'), byRiskLevel: facet('riskLevel'), byCriticality: facet('criticality'), byObservationSource: facet('observationSources') },
  };
}

export async function getFoundationPreview(entityId: string, signal?: AbortSignal): Promise<EntityPreviewResponse> {
  await delay(signal);
  const row = rows().find((item) => item.id === entityId) ?? rows()[0];
  return { entity: { ...row, activitySummary: { last24h: 1842, last7d: 9417, avgDaily: 1345 }, alertSummary: { active: row.alertCount, total30d: row.alertCount + 8, highestSeverity: row.riskScore >= 80 ? 'critical' : 'high' } } };
}

export async function getFoundationDossier(entityId: string, signal?: AbortSignal): Promise<DossierResponse> {
  await delay(signal);
  const row = rows().find((item) => item.id === entityId) ?? rows()[0];
  const detail = getFoundationEntityDetail(row.id);
  return { dossier: {
    identity: { id: row.id, type: row.type, value: row.value, displayName: row.displayName, firstSeen: row.firstSeen, lastSeen: row.lastSeen, tags: row.tags, criticality: row.criticality, department: detail.department, os: row.type === 'host' ? 'Windows 11 Enterprise' : undefined, location: detail.tenantName },
    riskProfile: { score: row.riskScore, level: row.riskLevel, trend: row.riskTrend, drivers: (detail.riskDrivers ?? []).map((driver) => ({ id: driver.id, category: driver.source, description: driver.description, contribution: driver.contribution, evidence: `${driver.evidenceCount} supporting observations`, lastSeen: row.lastSeen })), history: (detail.riskTimeline ?? []).map((entry) => ({ date: entry.timestamp, score: entry.score })) },
    baseline: { metrics: (detail.baselineMetrics ?? []).map((metric) => ({ name: metric.label, current: metric.current, baseline: metric.baseline, unit: metric.unit, status: metric.current > metric.baseline * 3 ? 'critical_deviation' : metric.current > metric.baseline * 1.5 ? 'deviation' : 'normal' })), deviations: (detail.baselineMetrics ?? []).filter((metric) => metric.current > metric.baseline * 1.5).map((metric) => ({ metric: metric.label, deviation: metric.current / Math.max(metric.baseline, 1), direction: 'above', since: row.lastSeen, significance: metric.current > metric.baseline * 3 ? 'critical' : 'high' })), learningPeriod: '30 days', lastUpdated: row.lastSeen },
    sourceCoverage: { sources: (detail.dataSources ?? []).map((source, index) => ({ name: source.label, type: source.id, lastEvent: source.lastIngestedAt, eventCount: 6420 - index * 947, status: source.status === 'healthy' ? 'active' : 'stale' })), gaps: (detail.dataSources ?? []).filter((source) => source.status !== 'healthy').map((source) => ({ source: source.label, lastSeen: source.lastIngestedAt, expectedInterval: '5 minutes', severity: 'high' })) },
    attackTechniques: { techniques: (detail.topAttackTechniques ?? []).map((technique, index) => ({ id: technique.id, name: technique.name, tactic: ['TA0005', 'TA0002', 'TA0008'][index] ?? 'TA0007', alertCount: technique.count, lastSeen: row.lastSeen, confidence: 88 - index * 6 })), tacticsHeatmap: { TA0005: 6, TA0002: 4, TA0008: 3 } },
    summary: { riskStatement: `${row.displayName} is ${row.riskLevel} risk because recent activity deviates from its established peer and behavioral baseline.`, recommendedActions: ['Review linked alerts', 'Validate account and asset ownership', 'Preserve relevant evidence'], investigationHints: ['Compare activity to the prior 30-day baseline', 'Review first-seen relationships'] },
  } };
}

export async function getFoundationActivity(entityId: string, cursor?: string | null, signal?: AbortSignal): Promise<ActivityResponse> {
  await delay(signal);
  const events = getFoundationEntityEvents(entityId);
  const offset = cursor ? Number(cursor.replace('activity-fixture-', '')) : 0;
  const items = events.slice(offset, offset + 50).map((event, index) => ({ id: event.id ?? `fixture-activity-${offset + index}`, timestamp: event.timestamp, type: (event.action ?? '').includes('process') ? 'process_execution' as const : (event.action ?? '').includes('auth') ? 'authentication' as const : 'network_connection' as const, category: event.category === 'identity' ? 'identity' as const : event.category === 'endpoint' ? 'execution' as const : 'network' as const, description: event.message, source: event.source, severity: event.severity ?? 'low', details: { host: event.host, user: event.user, sourceIp: event.sourceIp }, relatedEntityIds: [] }));
  const next = offset + items.length;
  return { items, cursor: next < events.length ? `activity-fixture-${next}` : null, total: events.length, window: { from: events[events.length - 1]?.timestamp ?? '', to: events[0]?.timestamp ?? '' } };
}

export async function getFoundationAlerts(entityId: string, cursor?: string | null, signal?: AbortSignal): Promise<RelatedAlertsResponse> {
  await delay(signal);
  const alerts = getFoundationEntityAlerts(entityId);
  const offset = cursor ? Number(cursor.replace('alerts-fixture-', '')) : 0;
  const items = alerts.slice(offset, offset + 25).map((alert, index) => ({ id: alert.id, title: alert.title, severity: alert.severity >= 9 ? 'critical' : alert.severity >= 7 ? 'high' : 'medium', status: alert.status === 'in_review' ? 'triaging' as const : alert.status === 'resolved' ? 'closed' as const : 'new' as const, ruleName: alert.ruleName ?? 'Entity behavior rule', timestamp: alert.timestamp, mitreTechnique: index % 2 ? 'T1059.001' : 'T1078', incidentId: alert.incidentId ?? undefined, entityRole: index % 2 ? 'actor' as const : 'asset' as const }));
  const next = offset + items.length;
  return { items, cursor: next < alerts.length ? `alerts-fixture-${next}` : null, total: alerts.length };
}

export async function getFoundationRelationships(entityId: string, cursor?: string | null, signal?: AbortSignal): Promise<RelationshipsResponse> {
  await delay(signal);
  const detail = getFoundationEntityDetail(entityId);
  const relationships = detail.relatedEntities ?? [];
  const offset = cursor ? Number(cursor.replace('relationships-fixture-', '')) : 0;
  const items = relationships.slice(offset, offset + 50).flatMap((relationship, index) => {
    const type = normalizeType(relationship.type);
    if (!type) return [];
    const relatedRiskScore = relationship.riskScore ?? 0;
    return [{ id: `${entityId}-${relationship.id}`, relatedEntity: { id: relationship.id, type, value: relationship.label, riskScore: relatedRiskScore, riskLevel: normalizeRiskLevel(relatedRiskScore) }, relationshipType: index % 2 ? 'authenticated_to' as const : 'communicated_with' as const, direction: index % 3 ? 'outbound' as const : 'inbound' as const, strength: .82 - index * .04, evidence: [{ type: 'normalized_event', description: relationship.relationship, timestamp: relationship.lastSeen }], firstSeen: relationship.firstSeen, lastSeen: relationship.lastSeen, eventCount: relationship.eventCount }];
  });
  const next = offset + items.length;
  return { items, cursor: next < relationships.length ? `relationships-fixture-${next}` : null, total: relationships.length };
}

export async function previewFoundationIncidentLink(entityId: string, request: IncidentLinkPreviewRequest): Promise<IncidentLinkPreview> {
  return { preview: { entityId, createNew: request.createNew, incidentId: request.incidentId, alertsLinked: 4, evidenceLinked: 3 }, previewToken: `fixture-preview-${entityId}` };
}

export async function executeFoundationIncidentLink(entityId: string, request: IncidentLinkExecuteRequest): Promise<IncidentLinkResult> {
  return { incidentId: request.incidentId ?? `fixture-incident-${entityId.slice(-4)}`, status: request.createNew ? 'created' : 'updated', linkedAlerts: 4, linkedEvidence: 3 };
}
