/**
 * Detection Rules Service (S22)
 * API calls per DEF-01 spec §3
 */

import type {
  DetectionExecution,
  RuleAuthoringDiagnostic,
  DetectionRuleVersion,
  DetectionSandboxResult,
  DetectionRule,
  RulePreviewResult,
  RuleValidationResult,
  RuleListParams,
  SigmaSyncResponse,
} from './detectionRules.types';
import { buildRuleClientValidation } from './detectionRules.validation';

import type { PaginatedResponse } from '@/lib/apiClient';

const TOKEN_KEY = 'hivearmor_auth_token';
const DETECTION_BASE = '/api/ha-detection-rules';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const fixtureDraftRules = new Map<DetectionRule['id'], DetectionRule>();
const inventoryCursors = new Map<string, Map<number, string | null>>();
let nextFixtureRuleId = 4990;

interface ModernRulePreview {
  id: string;
  name: string;
  description?: string | null;
  scope: 'managed' | 'custom';
  status: 'active' | 'disabled' | 'draft' | 'review' | 'error';
  severity: DetectionRule['severity'];
  mitreTactics?: string[];
  mitreTechniques?: string[];
  lastExecution?: { timestamp?: string | null; duration?: number | null; alertsGenerated?: number | null } | null;
  health?: { status?: 'healthy' | 'degraded' | 'critical' | 'disabled'; lastRun?: string | null; avgDuration?: number; errorRate?: number; alertsGenerated7d?: number };
  schedule?: string | null;
  tags?: string[];
  author?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

interface ModernRuleDetail {
  id: string;
  name: string;
  description?: string | null;
  expression: string;
  filters?: string | null;
  schedule?: string | null;
  scope: 'managed' | 'custom';
  status: 'active' | 'disabled' | 'draft' | 'review' | 'error';
  severity: DetectionRule['severity'];
  mitreTactics?: string[] | string | null;
  mitreTechniques?: string[] | string | null;
  tags?: string[] | string | null;
  author?: string;
  version?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  versions?: Array<{ id: string; version: number; expression: string; filters?: string | null; changes?: string | null; author?: string; createdAt?: string | null }>;
}

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

function asList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function scheduleLabel(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(value.trim());
  if (match) return `Every ${match[1]}m`;
  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(value.trim())) return 'Every 1h';
  return value;
}

function cronSchedule(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^Every\s+(\d+)m$/i.exec(value);
  if (match) return `*/${match[1]} * * * *`;
  if (/^Every\s+1h$/i.test(value)) return '0 * * * *';
  return value;
}

function mapHealth(status?: 'healthy' | 'degraded' | 'critical' | 'disabled'): DetectionRule['health'] {
  if (status === 'degraded') return 'warning';
  if (status === 'critical') return 'failed';
  if (status === 'disabled') return 'unknown';
  return status ?? 'unknown';
}

function mapModernPreview(item: ModernRulePreview): DetectionRule {
  const techniques = item.mitreTechniques ?? [];
  const tactics = item.mitreTactics ?? [];
  return {
    id: item.id,
    ruleName: item.name,
    description: item.description ?? undefined,
    dataTypes: [],
    tags: item.tags ?? [],
    ruleActive: item.status === 'active',
    lastModified: item.updatedAt ?? item.createdAt ?? '',
    sigmaRuleId: null,
    severity: item.severity,
    tactic: tactics[0],
    category: tactics[0],
    techniqueId: techniques[0],
    origin: item.scope,
    health: mapHealth(item.health?.status),
    healthMessage: item.health?.status === 'degraded' ? 'Recent executions are degraded.' : item.health?.status === 'critical' ? 'Recent executions are failing.' : undefined,
    lastRunAt: item.health?.lastRun ?? item.lastExecution?.timestamp ?? null,
    lastRunDurationMs: item.lastExecution?.duration ?? item.health?.avgDuration ?? null,
    schedule: scheduleLabel(item.schedule),
    alerts24h: undefined,
    version: item.version,
    updatedBy: item.author,
  };
}

function mapModernDetail(item: ModernRuleDetail): DetectionRule {
  const techniques = asList(item.mitreTechniques);
  const tactics = asList(item.mitreTactics);
  return {
    id: item.id,
    ruleName: item.name,
    description: item.description ?? undefined,
    dataTypes: [],
    tags: asList(item.tags),
    ruleActive: item.status === 'active',
    lastModified: item.updatedAt ?? item.createdAt ?? '',
    sigmaRuleId: null,
    severity: item.severity,
    tactic: tactics[0],
    category: tactics[0],
    techniqueId: techniques[0],
    origin: item.scope,
    health: 'unknown',
    schedule: scheduleLabel(item.schedule),
    ruleDefinition: item.expression,
    version: item.version,
    updatedBy: item.author,
  };
}

function draftPayload(rule: Partial<DetectionRule>): Record<string, unknown> {
  return {
    name: rule.ruleName?.trim(),
    description: rule.description?.trim() || undefined,
    expression: rule.ruleDefinition ?? '',
    filters: rule.groupBy?.length ? JSON.stringify({ groupBy: rule.groupBy, threshold: rule.threshold ?? 1, suppression: rule.suppressionDuration ?? 'Off' }) : undefined,
    schedule: cronSchedule(rule.schedule),
    severity: rule.severity ?? 'medium',
    mitreTactics: rule.tactic ?? rule.category ?? '',
    mitreTechniques: rule.techniqueId ?? '',
    tags: rule.dataTypes?.join(',') ?? '',
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }
  if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

// FIX-02: /api/ha-correlation-rules → /api/correlation-rule (singular, no ha- prefix)
export async function fetchRules(params: RuleListParams, signal?: AbortSignal): Promise<PaginatedResponse<DetectionRule>> {
  if (fixtureMode) {
    const { filterFoundationDetectionRules } = await import('@/pages/detection-rules/detectionRules.fixtures');
    return filterFoundationDetectionRules(params);
  }
  const token = getToken();
  const query = new URLSearchParams();
  const page = params.page ?? 0;
  const cursorKey = JSON.stringify({ search: params.search, active: params.active, origin: params.origin, technique: params.technique, sort: params.sort, size: params.size });
  const cursors = inventoryCursors.get(cursorKey) ?? new Map<number, string | null>([[0, null]]);
  inventoryCursors.set(cursorKey, cursors);

  // Map to Sprint 47 /api/ha-detection-rules query params
  if (params.size !== undefined) query.set('limit', String(params.size));
  if (params.search) query.set('q', params.search);
  if (params.active !== undefined && params.active !== ('all' as boolean | 'all')) {
    query.set('status', params.active === true ? 'active' : 'disabled');
  }
  if (params.origin && params.origin !== 'all') query.set('scope', params.origin === 'managed' ? 'managed' : 'custom');
  if (params.technique) query.set('tactics', params.technique);
  if (params.sort) {
    // Map old sort format to new
    if (params.sort.includes('lastModified')) query.set('sort', 'created_desc');
    else if (params.sort.includes('name')) query.set('sort', 'name_asc');
    else query.set('sort', 'created_desc');
  }
  const cursor = cursors.get(page);
  if (page > 0 && cursor) query.set('cursor', cursor);

  const url = `/api/ha-detection-rules?${query.toString()}`;
  const response = await fetch(url, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  // Adapt the canonical Sprint 47 inventory to the existing dense grid model.
  const data = await response.json() as {
    items: ModernRulePreview[];
    total: number;
    cursor?: string | null;
    summary: Record<string, unknown>;
    facets: Record<string, unknown>;
  };
  cursors.set(page + 1, data.cursor ?? null);
  return { items: data.items.map(mapModernPreview), total: data.total };
}

// FIX-02 + FIX-03: toggle is now PUT /api/correlation-rule/activate-deactivate
// Body: { id, ruleActive: boolean }
export async function toggleRuleActive(id: DetectionRule['id'], ruleActive: boolean): Promise<DetectionRule> {
  if (fixtureMode) {
    const { foundationDetectionRules } = await import('@/pages/detection-rules/detectionRules.fixtures');
    const rule = foundationDetectionRules.find((item) => item.id === id);
    if (!rule) throw new Error('Rule not found');
    return { ...rule, ruleActive };
  }
  const response = await fetch(`${DETECTION_BASE}/bulk/status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ruleIds: [String(id)], targetStatus: ruleActive ? 'active' : 'disabled', reason: 'Detection Engineering inventory toggle' }),
  });
  await handleResponse<Record<string, unknown>>(response);
  return { id, ruleName: '', dataTypes: [], ruleActive, lastModified: '', sigmaRuleId: null };
}

// FIX-02: /api/ha-correlation-rules/{id} → /api/correlation-rule/{id}
export async function deleteRule(id: DetectionRule['id']): Promise<void> {
  const response = await fetch(`${DETECTION_BASE}/bulk/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ruleIds: [String(id)], confirm: true }),
  });
  await handleResponse<Record<string, unknown>>(response);
}

// FIX-04: /api/ha-sigma/sync → /api/ha-sigma-sync/trigger
export async function syncSigmaRules(): Promise<SigmaSyncResponse> {
  if (fixtureMode) return { synced: 7, errors: 0, staged: 7, skipped: 41, message: '7 fictional Sigma updates staged for review.' };
  const token = getToken();
  const response = await fetch('/api/ha-sigma-sync/trigger', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const result = await response.json() as { staged?: number; skipped?: number; message?: string };
  return {
    synced: result.staged ?? 0,
    errors: 0,
    staged: result.staged ?? 0,
    skipped: result.skipped ?? 0,
    message: result.message ?? 'Sigma synchronization completed.',
  };
}

// FIX-02: /api/ha-correlation-rules/{id} → /api/correlation-rule/{id}
export async function fetchRule(id: DetectionRule['id'], signal?: AbortSignal): Promise<DetectionRule> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    const draft = fixtureDraftRules.get(id);
    if (draft) return draft;
    const { foundationDetectionRules } = await import('@/pages/detection-rules/detectionRules.fixtures');
    const rule = foundationDetectionRules.find((item) => item.id === id);
    if (!rule) throw new Error('Rule not found');
    return rule;
  }
  const response = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(id))}`, {
    signal,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (response.status === 404) {
    throw new Error('Rule not found');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return mapModernDetail(await response.json() as ModernRuleDetail);
}

export async function validateRuleDraft(rule: Partial<DetectionRule>, signal?: AbortSignal): Promise<RuleValidationResult> {
  signal?.throwIfAborted();
  const clientResult = buildRuleClientValidation(rule);
  if (!fixtureMode) {
    const response = await fetch(`${DETECTION_BASE}/validate`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ rule: draftPayload(rule) }),
    });
    const result = await handleResponse<{
      valid: boolean;
      errors?: Array<{ code?: string; field?: string; message?: string; line?: number; column?: number }>;
      warnings?: Array<{ code?: string; field?: string; message?: string; line?: number; column?: number }>;
    }>(response);
    const diagnostics: RuleAuthoringDiagnostic[] = [
      ...(result.errors ?? []).map((issue, index) => ({ id: `server-error-${index}`, code: issue.code ?? 'HA-RULE-VALIDATION', severity: 'error' as const, message: issue.message ?? 'Rule validation failed.', path: issue.field ?? 'definition', line: issue.line, column: issue.column, source: 'server' as const })),
      ...(result.warnings ?? []).map((issue, index) => ({ id: `server-warning-${index}`, code: issue.code ?? 'HA-RULE-WARNING', severity: 'warning' as const, message: issue.message ?? 'Rule validation warning.', path: issue.field ?? 'definition', line: issue.line, column: issue.column, source: 'server' as const })),
    ];
    return {
      ...clientResult,
      available: true,
      authoritative: true,
      valid: result.valid && clientResult.valid,
      diagnostics: [...clientResult.diagnostics.filter((item) => item.severity === 'warning'), ...diagnostics],
      engineVersion: 'HiveArmor CEL validation service',
      checkedAt: new Date().toISOString(),
    };
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 320);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Validation cancelled', 'AbortError'));
    }, { once: true });
  });
  return {
    ...clientResult,
    authoritative: true,
    diagnostics: clientResult.diagnostics.map((diagnostic) => ({ ...diagnostic, source: 'server' })),
    engineVersion: 'HiveArmor correlation engine 3.6.1',
    checkedAt: '2026-08-03T13:16:00Z',
  };
}

export async function previewRuleDraft(rule: Partial<DetectionRule>, range: string, signal?: AbortSignal): Promise<RulePreviewResult> {
  signal?.throwIfAborted();
  if (!fixtureMode) {
    const hours = range === '7d' ? 168 : range === '24h' ? 24 : 4;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    const response = await fetch(`${DETECTION_BASE}/preview`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ rule: draftPayload(rule), timeRange: { from: from.toISOString(), to: to.toISOString() }, limit: 100 }),
    });
    const result = await handleResponse<{
      matches?: Array<Record<string, unknown>>;
      matchCount?: number;
      scanDuration?: number;
      estimatedAlertRate?: number;
      sampleAlerts?: Array<{ id?: string; timestamp?: string; name?: string; source?: Record<string, unknown> }>;
    }>(response);
    const samples = (result.sampleAlerts ?? []).map((sample, index) => ({
      id: sample.id ?? `preview-${index}`,
      timestamp: sample.timestamp ?? to.toISOString(),
      summary: sample.name ?? rule.ruleName ?? 'Preview match',
      entity: typeof sample.source?.['host.name'] === 'string' ? sample.source['host.name'] : 'Normalized event',
    }));
    return {
      available: true,
      executionId: null,
      approximate: true,
      matchCount: result.matchCount ?? 0,
      eventsScanned: null,
      durationMs: result.scanDuration ?? 0,
      sourceCompleteness: null,
      truncated: (result.matches?.length ?? 0) >= 100,
      histogram: [],
      samples,
      warning: 'Preview is non-persistent. Scan-volume and completeness telemetry are not yet returned by the backend.',
    };
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 680);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Preview cancelled', 'AbortError'));
    }, { once: true });
  });
  const base = Math.max(4, (rule.ruleName?.length ?? 12) % 17);
  return {
    available: true,
    executionId: `preview-${rule.id ?? 'draft'}-20260803`,
    approximate: false,
    matchCount: base + 8,
    eventsScanned: range === '7d' ? 1_842_991 : range === '24h' ? 284_721 : 47_228,
    durationMs: range === '7d' ? 1842 : range === '24h' ? 642 : 218,
    sourceCompleteness: 96,
    truncated: false,
    histogram: Array.from({ length: 12 }, (_, index) => ({ label: `${String(index * 2).padStart(2, '0')}:00`, count: (base + index * 3) % 7 })),
    samples: [
      { id: 'preview-event-001', timestamp: '2026-08-03T12:48:19Z', summary: 'First-seen destination contacted by managed endpoint', entity: 'FIN-WKS-044' },
      { id: 'preview-event-002', timestamp: '2026-08-03T10:21:07Z', summary: 'Process opened an uncommon outbound web session', entity: 'PAY-APP-07' },
      { id: 'preview-event-003', timestamp: '2026-08-03T08:05:44Z', summary: 'Normalized network event satisfied the selection', entity: 'OPS-JMP-03' },
    ],
    warning: 'Fictional preview results are isolated from production alerts and rule metrics.',
  };
}

export async function fetchRuleVersions(ruleId: DetectionRule['id'], signal?: AbortSignal): Promise<DetectionRuleVersion[]> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    const { foundationDetectionRuleVersions } = await import('@/pages/detection-rules/detectionRules.fixtures');
    return foundationDetectionRuleVersions.map((version) => ({ ...version, ruleId }));
  }
  const response = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(ruleId))}`, {
    signal,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
  });
  const detail = await handleResponse<ModernRuleDetail>(response);
  return (detail.versions ?? []).map((version) => ({
    id: version.id,
    ruleId,
    versionNum: version.version,
    ruleSnapshot: version.expression,
    changedBy: version.author ?? 'Unknown author',
    changedAt: version.createdAt ?? '',
    changeNote: version.changes ?? '',
  }));
}

export async function rollbackRuleVersion(ruleId: DetectionRule['id'], versionNum: number): Promise<DetectionRule> {
  if (fixtureMode) {
    const current = await fetchRule(ruleId);
    const versions = await fetchRuleVersions(ruleId);
    const target = versions.find((version) => version.versionNum === versionNum);
    if (!target) throw new Error('Rule version not found');
    const restored = { ...current, ruleDefinition: target.ruleSnapshot, version: (current.version ?? versionNum) + 1, updatedBy: 'Maya Chen', lastModified: '2026-08-03T13:16:00Z' };
    fixtureDraftRules.set(ruleId, restored);
    return restored;
  }
  const response = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(ruleId))}/revert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetVersion: versionNum }),
  });
  return mapModernDetail(await handleResponse<ModernRuleDetail>(response));
}

export { fixtureMode as detectionRulesFixtureMode };

export async function fetchRuleExecutions(signal?: AbortSignal): Promise<{ available: boolean; items: DetectionExecution[] }> {
  if (fixtureMode) {
    const { foundationDetectionExecutions } = await import('@/pages/detection-rules/detectionRules.fixtures');
    return { available: true, items: foundationDetectionExecutions };
  }

  const response = await fetch(`${DETECTION_BASE}/executions?limit=100`, {
    signal,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
  });
  const data = await handleResponse<{
    items: Array<{
      id: string; ruleId: string; startedAt?: string | null; completedAt?: string | null;
      duration?: number | null; status: 'completed' | 'failed' | 'timeout' | 'cancelled' | 'queued' | 'running';
      alertsGenerated?: number | null; eventsScanned?: number | null; errors?: string[] | string | null;
      triggeredBy?: 'schedule' | 'manual' | 'gap_fill';
    }>;
  }>(response);
  const statusMap: Record<string, DetectionExecution['status']> = { completed: 'succeeded', failed: 'failed', timeout: 'failed', cancelled: 'warning', queued: 'running', running: 'running' };
  return {
    available: true,
    items: data.items.map((item) => ({
      id: item.id,
      ruleId: item.ruleId,
      ruleName: item.ruleId,
      status: statusMap[item.status] ?? 'warning',
      runType: item.triggeredBy === 'gap_fill' ? 'gap-fill' : item.triggeredBy === 'manual' ? 'manual' : 'scheduled',
      startedAt: item.startedAt ?? null,
      durationMs: item.duration ?? null,
      searchDurationMs: null,
      alertDurationMs: null,
      eventsScanned: item.eventsScanned ?? null,
      matches: null,
      alertsCreated: item.alertsGenerated ?? null,
      sourceCoverage: null,
      gapDurationMinutes: null,
      message: Array.isArray(item.errors) ? item.errors.join(' · ') : item.errors ?? (item.status === 'completed' ? 'Execution completed.' : item.status),
    })),
  };
}

export async function testDetectionSandbox(
  ruleYaml: string,
  eventJson: string,
  signal?: AbortSignal,
): Promise<DetectionSandboxResult> {
  if (fixtureMode) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 420);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Test cancelled', 'AbortError'));
      }, { once: true });
    });
    const event = JSON.parse(eventJson) as Record<string, unknown>;
    const normalizedRule = ruleYaml.toLowerCase();
    const flattened: Array<{ path: string; value: unknown }> = [];
    const visit = (value: unknown, path: string): void => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => visit(nested, path ? `${path}.${key}` : key));
      } else flattened.push({ path, value });
    };
    visit(event, '');
    const matchedFields = flattened.filter((field) => normalizedRule.includes(field.path.toLowerCase()) || typeof field.value === 'string' && normalizedRule.includes(field.value.toLowerCase())).map((field) => field.path);
    const matched = matchedFields.length > 0 || normalizedRule.includes('condition: selection');
    return {
      matched,
      matchedFields: matchedFields.length ? matchedFields : matched ? ['event.action'] : [],
      explanation: matched ? 'The fictional event satisfied the selection and condition path.' : 'The event did not satisfy the active selection path.',
      durationMs: 37,
      evaluatedFields: Object.keys(event).length,
      warnings: [],
    };
  }

  if (!/^detection:\s*$/m.test(ruleYaml)) {
    throw new Error('Native CEL single-event evaluation is not available from the backend yet. Run the bounded historical preview instead.');
  }

  const response = await fetch('/api/ha-rules/test', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ruleYaml, eventJson }),
  });
  if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
  const result = await response.json() as { matched: boolean; matchedFields?: string[]; explanation?: string };
  return {
    matched: result.matched,
    matchedFields: result.matchedFields ?? [],
    explanation: result.explanation ?? 'The in-memory evaluator completed.',
    durationMs: 0,
    evaluatedFields: 0,
    warnings: ['Historical preview and source-completeness metrics require DET-011.'],
  };
}

// FIX-02: /api/ha-correlation-rules/{id} PUT → /api/correlation-rule PUT (backend uses body id)
export async function updateRule(id: DetectionRule['id'], rule: Partial<DetectionRule>): Promise<DetectionRule> {
  if (fixtureMode) {
    const current = await fetchRule(id);
    const updated = { ...current, ...rule, id, lastModified: '2026-08-03T13:16:00Z', updatedBy: 'Maya Chen', version: (current.version ?? 1) + 1 };
    fixtureDraftRules.set(id, updated);
    return updated;
  }
  const response = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(draftPayload(rule)),
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (response.status === 409) {
    throw new Error('Conflict: Rule was modified by another user');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return mapModernDetail(await response.json() as ModernRuleDetail);
}

// FIX-02: /api/ha-correlation-rules POST → /api/correlation-rule POST
export async function createRule(rule: Omit<DetectionRule, 'id'>): Promise<DetectionRule> {
  if (fixtureMode) {
    const id = nextFixtureRuleId++;
    const created: DetectionRule = { ...rule, id, lastModified: '2026-08-03T13:16:00Z', version: 1, updatedBy: 'Maya Chen', createdBy: 'Maya Chen', origin: 'custom', health: 'unknown' };
    fixtureDraftRules.set(id, created);
    return created;
  }
  const response = await fetch(DETECTION_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(draftPayload(rule)),
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return mapModernDetail(await response.json() as ModernRuleDetail);
}

export async function publishRule(id: DetectionRule['id']): Promise<DetectionRule> {
  if (fixtureMode) {
    const current = await fetchRule(id);
    const published = { ...current, ruleActive: true, health: 'healthy' as const };
    fixtureDraftRules.set(id, published);
    return published;
  }
  const submit = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(id))}/submit-review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  await handleResponse<ModernRuleDetail>(submit);
  const approve = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(id))}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: 'Validated and published from Detection Engineering' }),
  });
  return mapModernDetail(await handleResponse<ModernRuleDetail>(approve));
}
