/**
 * Detection Rules Service (S22)
 * API calls per DEF-01 spec §3
 */

import { DET_011_VALIDATE_PREVIEW, DET_TEST_CEL_DRY_RUN } from './detectionRules.capabilities';
import type {
  DetectionExecution,
  RuleAuthoringDiagnostic,
  DetectionRuleVersion,
  DetectionSandboxResult,
  DetectionRule,
  RulePreviewResult,
  RuleValidationResult,
  RuleListParams,
  SigmaActivateResult,
  SigmaSyncResponse,
} from './detectionRules.types';
import { buildRuleClientValidation } from './detectionRules.validation';

import type { PaginatedResponse } from '@/lib/apiClient';
import { detectionPackAuthHeaders } from '@/services/detectionPack.service';

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
  tenantId?: number | null;
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
    engine: 'cel',
    tenantId: item.tenantId ?? undefined,
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
    id: rule.id,
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

function readNestedString(root: Record<string, unknown>, path: string[]): string | null {
  let cursor: unknown = root;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor : null;
}

function eventMatchesFixtureException(event: Record<string, unknown>): boolean {
  const host = readNestedString(event, ['host', 'name'])
    ?? readNestedString(event, ['origin', 'host']);
  return host === 'approved-scanner' || host === 'lab-baseline-host';
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
      ...detectionPackAuthHeaders(),
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
      ...detectionPackAuthHeaders(),
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
      ...detectionPackAuthHeaders(),
    },
    body: JSON.stringify({ ruleIds: [String(id)], confirm: true }),
  });
  await handleResponse<Record<string, unknown>>(response);
}

// FIX-04: /api/ha-sigma/sync → /api/ha-sigma-sync/trigger
export async function syncSigmaRules(): Promise<SigmaSyncResponse> {
  if (fixtureMode) return { synced: 7, errors: 0, staged: 7, skipped: 41, message: '7 fictional Sigma updates staged for review. Activate will request engine reload (fixture).' };
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

export function inferDetectionEngine(ruleYaml: string, engine?: DetectionRule['engine']): NonNullable<DetectionRule['engine']> {
  if (engine) return engine;
  if (/type:\s*graph_offense\b/.test(ruleYaml)) return 'graph';
  if (/^sequence:\s*$/m.test(ruleYaml) || /\nsequence:\s*$/m.test(ruleYaml)) return 'sequence';
  if (/\briskScore:\s*\d+/.test(ruleYaml)) return 'risk';
  return 'cel';
}

/** DET-SIGMA-001b — activate then honor LoadReport, not reload HTTP. */
export async function activateSigmaRule(ruleId: DetectionRule['id']): Promise<SigmaActivateResult> {
  if (fixtureMode) {
    return {
      ruleId: Number(ruleId) || 0,
      ruleName: 'Fixture staged Sigma rule',
      activated: true,
      engineLoaded: false,
      reloadHttpAccepted: true,
      honesty: 'STAGING CANDIDATE design fixture: activate marked the DB row active and requested reload (HTTP 202). engineLoaded=false because LoadReport.loadedNames does not list this rule. Config plugin YAML write + watchLoop may take up to ~30s. Reload HTTP 200/202 is not proof of load.',
    };
  }
  const response = await fetch(`/api/ha-sigma-sync/${encodeURIComponent(String(ruleId))}/activate`, {
    method: 'POST',
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
  if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
  const result = await response.json() as Partial<SigmaActivateResult>;
  return {
    ruleId: Number(result.ruleId ?? ruleId) || 0,
    ruleName: result.ruleName,
    activated: Boolean(result.activated),
    engineLoaded: Boolean(result.engineLoaded),
    reloadHttpAccepted: Boolean(result.reloadHttpAccepted),
    honesty: result.honesty
      ?? 'engineLoaded=true only when LoadReport lists the rule. Reload HTTP is not proof of load. watchLoop may take ~30s.',
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

export async function previewRuleDraft(
  rule: Partial<DetectionRule>,
  range: string,
  signal?: AbortSignal,
  dryRunEvents?: Array<Record<string, unknown>>,
  previewMode: 'inject' | 'opensearch' | 'auto' = 'auto',
): Promise<RulePreviewResult> {
  signal?.throwIfAborted();
  if (!fixtureMode) {
    const hours = range === '7d' ? 168 : range === '24h' ? 24 : 4;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    const response = await fetch(`${DETECTION_BASE}/preview`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        rule: draftPayload(rule),
        timeRange: { from: from.toISOString(), to: to.toISOString() },
        limit: 100,
        dryRunEvents: dryRunEvents ?? undefined,
        previewMode,
      }),
    });
    const result = await handleResponse<{
      matches?: Array<Record<string, unknown>>;
      matchCount?: number;
      scanDuration?: number;
      eventsScanned?: number;
      estimatedAlertRate?: number;
      sampleAlerts?: Array<{ id?: string; timestamp?: string; name?: string; source?: Record<string, unknown> }>;
      mode?: RulePreviewResult['mode'];
      honesty?: string;
      simulated?: boolean;
      openSearchQueried?: boolean;
      available?: boolean;
      exceptionsApplied?: boolean;
      exceptionsSuppressedCount?: number;
      suppressedMatches?: Array<{ event?: Record<string, unknown>; matchingExceptionTitle?: string }>;
    }>(response);
    const mode = result.mode
      ?? (result.openSearchQueried ? 'opensearch' : dryRunEvents?.length ? 'inject' : 'unavailable');
    const honesty = result.honesty
      ?? (mode === 'opensearch' || mode === 'opensearch_historical'
        ? 'Bounded historical OpenSearch preview — no alerts were created.'
        : mode === 'inject' || mode === 'inject_dry_run'
          ? 'Inject dry-run preview — OpenSearch historical indices were not queried.'
          : 'Preview unavailable — provide injectable sample events or choose OpenSearch mode when reachable.');
    if (mode === 'unavailable' || result.available === false) {
      return {
        available: false,
        executionId: null,
        approximate: true,
        matchCount: null,
        eventsScanned: null,
        durationMs: result.scanDuration ?? 0,
        sourceCompleteness: null,
        truncated: false,
        histogram: [],
        samples: [],
        warning: honesty,
        mode: 'unavailable',
        honesty,
        simulated: false,
        openSearchQueried: false,
        exceptionsApplied: Boolean(result.exceptionsApplied),
        exceptionsSuppressedCount: result.exceptionsSuppressedCount ?? 0,
      };
    }
    const samples = (result.sampleAlerts ?? []).map((sample, index) => ({
      id: sample.id ?? `preview-${index}`,
      timestamp: sample.timestamp ?? to.toISOString(),
      summary: sample.name ?? rule.ruleName ?? 'Preview match',
      entity: typeof sample.source?.['host.name'] === 'string' ? sample.source['host.name'] : 'Normalized event',
    }));
    const suppressedMatches = (result.suppressedMatches ?? []).map((row, index) => ({
      id: `suppressed-${index}`,
      timestamp: to.toISOString(),
      summary: row.matchingExceptionTitle
        ? `Matched — suppressed by ${row.matchingExceptionTitle}`
        : 'Matched — suppressed by an active exception',
      entity: typeof row.event?.['host.name'] === 'string' ? String(row.event['host.name']) : 'Normalized event',
    }));
    return {
      available: true,
      executionId: null,
      approximate: mode === 'inject' || mode === 'inject_dry_run',
      matchCount: result.matchCount ?? 0,
      eventsScanned: result.eventsScanned ?? null,
      durationMs: result.scanDuration ?? 0,
      sourceCompleteness: null,
      truncated: (result.matches?.length ?? 0) >= 100,
      histogram: [],
      samples,
      suppressedMatches,
      warning: honesty,
      mode,
      honesty,
      simulated: Boolean(result.simulated),
      openSearchQueried: Boolean(result.openSearchQueried),
      exceptionsApplied: Boolean(result.exceptionsApplied),
      exceptionsSuppressedCount: result.exceptionsSuppressedCount ?? suppressedMatches.length,
    };
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 680);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Preview cancelled', 'AbortError'));
    }, { once: true });
  });
  if (previewMode === 'opensearch') {
    return {
      available: true,
      executionId: `preview-os-${rule.id ?? 'draft'}`,
      approximate: true,
      matchCount: 6,
      eventsScanned: 48,
      durationMs: 312,
      sourceCompleteness: 94,
      truncated: false,
      histogram: [],
      samples: [
        { id: 'os-1', timestamp: '2026-09-07T12:01:00Z', summary: 'OpenSearch historical match (fixture)', entity: 'FIN-WKS-044' },
      ],
      warning: 'Design fixture: OpenSearch mode returns fictional historical matches.',
      mode: 'opensearch',
      honesty: 'Design fixture: OpenSearch historical preview is fictional. exceptionsApplied=false (Java/OS path does not load EP exception packs).',
      simulated: true,
      openSearchQueried: true,
      exceptionsApplied: false,
      exceptionsSuppressedCount: 0,
    };
  }
  if (previewMode === 'inject' && !dryRunEvents?.length) {
    return {
      available: false,
      executionId: null,
      approximate: true,
      matchCount: null,
      eventsScanned: null,
      durationMs: 0,
      sourceCompleteness: null,
      truncated: false,
      histogram: [],
      samples: [],
      warning: 'Inject mode requires a sample event JSON object.',
      mode: 'unavailable',
      honesty: 'Inject mode unavailable without dryRunEvents. exceptionsApplied=false.',
      simulated: false,
      openSearchQueried: false,
      exceptionsApplied: false,
      exceptionsSuppressedCount: 0,
    };
  }

  const injectEvent = dryRunEvents?.[0];
  if (injectEvent && eventMatchesFixtureException(injectEvent)) {
    const host = readNestedString(injectEvent, ['host', 'name'])
      ?? readNestedString(injectEvent, ['origin', 'host'])
      ?? 'approved-scanner';
    const baseline = host === 'lab-baseline-host';
    return {
      available: true,
      executionId: `preview-suppressed-${rule.id ?? 'draft'}`,
      approximate: true,
      matchCount: 0,
      eventsScanned: 1,
      durationMs: 44,
      sourceCompleteness: 100,
      truncated: false,
      histogram: [],
      samples: [],
      suppressedMatches: [{
        id: baseline ? 'preview-baseline-suppressed' : 'preview-scanner-suppressed',
        timestamp: '2026-09-07T10:15:00Z',
        summary: baseline
          ? 'Matched CEL, suppressed by fixture baseline:anomaly exception #9002'
          : 'Matched CEL, suppressed by fixture exception #9001 (host.name is approved-scanner)',
        entity: host,
      }],
      warning: baseline
        ? 'Match suppressed by active fixture exception #9002 (ruleId=baseline:anomaly, host.name is lab-baseline-host).'
        : 'Match suppressed by active fixture exception #9001 (host.name is approved-scanner).',
      mode: previewMode === 'inject' ? 'inject' : 'fixture',
      honesty:
        'STAGING CANDIDATE design fixture: active exception considered for demo inject event '
        + '(exceptionsApplied=true, match but suppressed). Live Java dry-run loads PostgreSQL active rows '
        + 'and uses EP operators (is/is_not/contains/starts_with/ends_with/in).',
      simulated: true,
      openSearchQueried: false,
      exceptionsApplied: true,
      exceptionsSuppressedCount: 1,
    };
  }

  const base = Math.max(4, (rule.ruleName?.length ?? 12) % 17);
  return {
    available: true,
    executionId: `preview-${rule.id ?? 'draft'}-20260803`,
    approximate: true,
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
    mode: previewMode === 'inject' ? 'inject' : 'fixture',
    honesty: 'Design fixture: preview matches are fictional and isolated from production. exceptionsApplied=false unless inject host matches an active fixture exception.',
    simulated: true,
    openSearchQueried: false,
    exceptionsApplied: false,
    exceptionsSuppressedCount: 0,
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
      id: string; ruleId: string; ruleName?: string | null; startedAt?: string | null; completedAt?: string | null;
      duration?: number | null; status: 'completed' | 'failed' | 'timeout' | 'cancelled' | 'queued' | 'running';
      alertsGenerated?: number | null; eventsScanned?: number | null; errors?: string[] | string | null;
      triggeredBy?: 'schedule' | 'manual' | 'gap_fill' | 'gap-fill';
      gapDurationMinutes?: number | null;
    }>;
  }>(response);
  const statusMap: Record<string, DetectionExecution['status']> = { completed: 'succeeded', failed: 'failed', timeout: 'failed', cancelled: 'warning', queued: 'running', running: 'running' };
  return {
    available: true,
    items: data.items.map((item) => ({
      id: item.id,
      ruleId: item.ruleId,
      ruleName: item.ruleName ?? item.ruleId,
      status: statusMap[item.status] ?? 'warning',
      runType: item.triggeredBy === 'gap_fill' || item.triggeredBy === 'gap-fill' ? 'gap-fill' : item.triggeredBy === 'manual' ? 'manual' : 'scheduled',
      startedAt: item.startedAt ?? null,
      durationMs: item.duration ?? null,
      searchDurationMs: null,
      alertDurationMs: null,
      eventsScanned: item.eventsScanned ?? null,
      matches: null,
      alertsCreated: item.alertsGenerated ?? null,
      sourceCoverage: null,
      gapDurationMinutes: item.gapDurationMinutes ?? null,
      message: Array.isArray(item.errors) ? item.errors.join(' · ') : item.errors ?? (item.status === 'completed' ? 'Execution completed.' : item.status),
    })),
  };
}

/** DET-009: POST /ha-detection-rules/{id}/gap-fill (SOC Manager / Admin). */
export async function triggerDetectionGapFill(
  ruleId: DetectionRule['id'],
  from: string,
  to: string,
): Promise<{ executionId?: string; status?: string; gapsDetected?: number }> {
  if (fixtureMode) {
    return { executionId: `fixture-gap-${ruleId}`, status: 'queued', gapsDetected: 1 };
  }
  const response = await fetch(`${DETECTION_BASE}/${encodeURIComponent(String(ruleId))}/gap-fill`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ from, to }),
  });
  return handleResponse<{ executionId?: string; status?: string; gapsDetected?: number }>(response);
}

export async function testDetectionSandbox(
  ruleYaml: string,
  eventJson: string,
  signal?: AbortSignal,
  options?: { ruleId?: DetectionRule['id'] },
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
    const hostName = readNestedString(event, ['host', 'name'])
      ?? readNestedString(event, ['origin', 'host']);
    if (hostName === 'approved-scanner' || hostName === 'lab-baseline-host') {
      const baseline = hostName === 'lab-baseline-host';
      return {
        matched: true,
        matchedFields: ['event.action', 'host.name'],
        explanation: baseline
          ? 'CEL matched. Suppressed by fixture exception #9002 (ruleId=baseline:anomaly, host.name is lab-baseline-host). No alert would be created.'
          : 'CEL matched. Suppressed by fixture exception #9001 (host.name is approved-scanner). No alert would be created.',
        durationMs: 29,
        evaluatedFields: Object.keys(event).length,
        warnings: [
          'STAGING CANDIDATE design fixture: match but suppressed by an active exception.',
          'exceptionsApplied=true. Live Java dry-run loads PostgreSQL active rows with EP operators.',
        ],
        evaluationMode: 'fixture_exception_suppressed',
        openSearchQueried: false,
        engineParity: 'fixture',
        suppressed: true,
        wouldAlert: false,
        exceptionsApplied: true,
        exceptionsSuppressedCount: 1,
        matchingExceptionId: baseline ? 9002 : 9001,
        matchingExceptionTitle: baseline ? 'Baseline approved scanner' : 'Approved scanner host',
      };
    }
    const engine = inferDetectionEngine(ruleYaml);
    if (engine === 'sequence' || engine === 'risk' || engine === 'graph') {
      const action = typeof event.action === 'string' ? event.action : '';
      if (engine === 'sequence') {
        const step0 = /action == "([^"]+)"/.exec(ruleYaml)?.[1];
        const step0Matched = Boolean(step0 && action === step0);
        return {
          matched: false,
          matchedFields: step0Matched ? ['sequence.step0'] : [],
          explanation: step0Matched
            ? 'Go sequence fixture: step 0 CEL matched this single event; sequenceComplete=false. A step match is not a sequence hit.'
            : 'Go sequence fixture: no step matched this single event; sequenceComplete=false.',
          durationMs: 18,
          evaluatedFields: Object.keys(event).length,
          warnings: [
            'DET-TEST-002 fixture: event-processor sequence evaluate (engineParity=go).',
            'Never treat a sequence step CEL match as a full sequence hit.',
          ],
          evaluationMode: 'ep_evaluate',
          openSearchQueried: false,
          engineParity: 'go',
          engine,
          sequenceComplete: false,
          suppressed: false,
          wouldAlert: false,
          exceptionsApplied: false,
          exceptionsSuppressedCount: 0,
        };
      }
      if (engine === 'risk') {
        const whereMatched = action === 'failed_auth' || action === 'powershell';
        return {
          matched: whereMatched,
          matchedFields: whereMatched ? ['where'] : [],
          explanation: whereMatched
            ? 'Go risk fixture: where matched; riskScoreDelta applied. wouldAlert=false (threshold is stateful).'
            : 'Go risk fixture: where did not match; no score increment.',
          durationMs: 16,
          evaluatedFields: Object.keys(event).length,
          warnings: ['DET-TEST-002 fixture: event-processor risk evaluate (engineParity=go).'],
          evaluationMode: 'ep_evaluate',
          openSearchQueried: false,
          engineParity: 'go',
          engine,
          suppressed: false,
          wouldAlert: false,
          exceptionsApplied: false,
          exceptionsSuppressedCount: 0,
        };
      }
      return {
        matched: false,
        matchedFields: [],
        explanation: 'engineParity=unavailable — graph_offense single-event evaluate does not run Cypher. Graph rules require Neo4j (NEO4J_ENABLED). Hits were not faked as Java CEL matches.',
        durationMs: 9,
        evaluatedFields: Object.keys(event).length,
        warnings: ['DET-TEST-002 fixture: graph evaluate is unavailable without Neo4j.'],
        evaluationMode: 'unavailable',
        openSearchQueried: false,
        engineParity: 'unavailable',
        engine,
        suppressed: false,
        wouldAlert: false,
        exceptionsApplied: false,
        exceptionsSuppressedCount: 0,
      };
    }
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
      warnings: ['Design fixture evaluation — production evaluators were not called.', 'exceptionsApplied=false unless the sample host matches an active fixture exception.'],
      evaluationMode: 'fixture',
      openSearchQueried: false,
      engineParity: 'fixture',
      suppressed: false,
      wouldAlert: matched,
      exceptionsApplied: false,
      exceptionsSuppressedCount: 0,
    };
  }

  const isSigma = /^detection:\s*$/m.test(ruleYaml) || /detection:\s*\n/.test(ruleYaml);

  if (isSigma) {
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
    const result = await response.json() as { matched: boolean; matchedFields?: string[]; explanation?: string; durationMs?: number };
    return {
      matched: result.matched,
      matchedFields: result.matchedFields ?? [],
      explanation: result.explanation ?? 'The in-memory Sigma evaluator completed.',
      durationMs: result.durationMs ?? 0,
      evaluatedFields: 0,
      warnings: DET_011_VALIDATE_PREVIEW
        ? ['Sigma sandbox completed. Use Historical preview for bounded DET-011 dry-run against indexed events.']
        : ['Historical preview is not available from the detection rules API.'],
      evaluationMode: 'sigma_sandbox',
      openSearchQueried: false,
      engineParity: 'sigma',
    };
  }

  if (!DET_TEST_CEL_DRY_RUN) {
    throw new Error('Native CEL single-event evaluation is not enabled. Run the bounded historical preview instead.');
  }

  // Prefer modern DET-TEST-001 path; fall back to deprecated correlation-rule/test when a persisted ruleId is available.
  const modernResponse = await fetch(`${DETECTION_BASE}/test`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      rule: {
        id: options?.ruleId,
        name: 'Detection sandbox dry-run',
        expression: ruleYaml,
        ruleDefinition: ruleYaml,
        ruleYaml,
        engine: inferDetectionEngine(ruleYaml),
      },
      sampleEvent: eventJson,
      eventJson,
    }),
  });

  let response = modernResponse;
  if (!modernResponse.ok && options?.ruleId != null && modernResponse.status !== 401 && modernResponse.status !== 403) {
    response = await fetch('/api/correlation-rule/test', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ruleId: options.ruleId,
        eventJson,
        testEventJson: eventJson,
        sampleEvent: eventJson,
      }),
    });
  }

  if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
  const result = await response.json() as {
    matched?: boolean;
    matchedFields?: string[];
    explanation?: string;
    evaluationNote?: string;
    durationMs?: number;
    evaluationMode?: DetectionSandboxResult['evaluationMode'];
    openSearchQueried?: boolean;
    engineParity?: DetectionSandboxResult['engineParity'];
    engine?: DetectionSandboxResult['engine'];
    sequenceComplete?: boolean;
    simulatedMatchCount?: number;
    suppressed?: boolean;
    wouldAlert?: boolean;
    exceptionsApplied?: boolean;
    exceptionsSuppressedCount?: number;
    matchingExceptionId?: number | string | null;
    matchingExceptionTitle?: string | null;
  };
  const suppressed = Boolean(result.suppressed);
  return {
    matched: Boolean(result.matched),
    matchedFields: result.matchedFields ?? [],
    explanation: result.explanation ?? result.evaluationNote ?? 'Inject dry-run completed.',
    durationMs: result.durationMs ?? 0,
    evaluatedFields: result.matchedFields?.length ?? result.simulatedMatchCount ?? 0,
    warnings: [
      result.engineParity === 'go'
        ? 'DET-TEST-002 — event-processor INTERNAL_KEY evaluate (engineParity=go). Sequence hits are never faked from Java CEL.'
        : result.engineParity === 'unavailable'
          ? 'DET-TEST-002 — engineParity=unavailable. Sequence/risk/graph hits were not faked as Java CEL matches.'
          : 'CEL inject dry-run (DET-TEST-001) via /api/ha-detection-rules/test — approximate parity with the Go event-processor evaluator; OpenSearch was not queried.',
      result.exceptionsApplied
        ? 'exceptionsApplied=true — active PostgreSQL exceptions were considered with EP operators.'
        : 'exceptionsApplied=false — exception store unavailable or no ruleId.',
    ],
    evaluationMode: result.evaluationMode ?? 'inject_dry_run',
    openSearchQueried: Boolean(result.openSearchQueried),
    engineParity: result.engineParity ?? 'approximate',
    engine: result.engine,
    sequenceComplete: result.sequenceComplete,
    suppressed,
    wouldAlert: result.wouldAlert ?? (Boolean(result.matched) && !suppressed),
    exceptionsApplied: Boolean(result.exceptionsApplied),
    exceptionsSuppressedCount: result.exceptionsSuppressedCount ?? (suppressed ? 1 : 0),
    matchingExceptionId: result.matchingExceptionId ?? null,
    matchingExceptionTitle: result.matchingExceptionTitle ?? null,
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
