/**
 * Detection exception / suppression — preview + persist/activate (DET-FP-001).
 *
 * POST /api/ha-detection-rules/{ruleId}/exceptions/preview
 * GET  /api/ha-detection-rules/{ruleId}/exceptions
 * POST /api/ha-detection-rules/{ruleId}/exceptions
 * POST /api/ha-detection-rules/{ruleId}/exceptions/{id}/activate
 * POST /api/ha-detection-rules/{ruleId}/exceptions/{id}/deactivate
 */

const TOKEN_KEY = 'hivearmor_auth_token';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface ExceptionCondition {
  field: string;
  operator: string;
  value: string;
}

export interface ExceptionPreviewResult {
  ruleId: string;
  ruleName: string | null;
  matchingHistoricalAlerts: number;
  projectedVolumeReduction: number;
  affectedTechniques: Array<{ techniqueId: string; techniqueName?: string; alertCount?: number }>;
  exceptionOverlapWithExisting: Array<{ exceptionId: string; overlapRatio?: number; summary?: string }>;
  falseNegativeRiskPrompts: string[];
  highImpactWarning: boolean;
  approvalRequired: boolean;
  honesty: string;
  mode: 'opensearch_historical' | 'fixture' | 'unavailable';
}

export interface DetectionException {
  id: number | string;
  ruleId: string;
  title: string;
  reason: string | null;
  conditions: ExceptionCondition[];
  active: boolean;
  status: string;
  createdBy: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  honesty: string;
}

let fixtureExceptions: DetectionException[] = [
  {
    id: 9001,
    ruleId: 'fixture',
    title: 'Approved scanner host',
    reason: 'Weekly vuln scans from approved-scanner.corp',
    conditions: [{ field: 'host.name', operator: 'is', value: 'approved-scanner' }],
    active: true,
    status: 'active',
    createdBy: 'analyst',
    activatedBy: 'soc-manager',
    activatedAt: '2026-09-06T14:20:00Z',
    createdAt: '2026-09-05T09:00:00Z',
    updatedAt: '2026-09-06T14:20:00Z',
    honesty: 'STAGING CANDIDATE fixture: active exceptions are treated as engine-enforced (sync lag fictional).',
  },
  {
    id: 9002,
    ruleId: 'fixture',
    title: 'Lab CIDR draft',
    reason: 'Pending SOC Manager activation',
    conditions: [{ field: 'source.ip', operator: 'starts_with', value: '10.99.' }],
    active: false,
    status: 'draft',
    createdBy: 'analyst',
    activatedBy: null,
    activatedAt: null,
    createdAt: '2026-09-07T08:15:00Z',
    updatedAt: '2026-09-07T08:15:00Z',
    honesty: 'Design fixture: draft exceptions are never enforced.',
  },
];

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

async function handleAuth(response: Response): Promise<void> {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }
}

function mapException(body: Record<string, unknown>, fallbackRuleId: string): DetectionException {
  const conditionsRaw = Array.isArray(body.conditions) ? body.conditions : [];
  const conditions = conditionsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const field = typeof row.field === 'string' ? row.field : '';
      const operator = typeof row.operator === 'string' ? row.operator : '';
      const value = typeof row.value === 'string' ? row.value : '';
      if (!field || !operator || !value) return null;
      return { field, operator, value };
    })
    .filter((item): item is ExceptionCondition => item != null);

  return {
    id: (body.id as number | string) ?? 'unknown',
    ruleId: typeof body.ruleId === 'string' ? body.ruleId : fallbackRuleId,
    title: typeof body.title === 'string' ? body.title : 'Untitled exception',
    reason: typeof body.reason === 'string' ? body.reason : null,
    conditions,
    active: Boolean(body.active),
    status: typeof body.status === 'string' ? body.status : 'draft',
    createdBy: typeof body.createdBy === 'string' ? body.createdBy : null,
    activatedBy: typeof body.activatedBy === 'string' ? body.activatedBy : null,
    activatedAt: typeof body.activatedAt === 'string' ? body.activatedAt : null,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : null,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    honesty: typeof body.honesty === 'string'
      ? body.honesty
      : 'STAGING CANDIDATE — active exceptions sync via config plugin and are enforced pre-alert by the event-processor (lag <=60s).',
  };
}

export async function previewExceptionImpact(
  ruleId: string | number,
  conditions: ExceptionCondition[],
  signal?: AbortSignal,
): Promise<ExceptionPreviewResult> {
  if (fixtureMode) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 280);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Exception preview cancelled', 'AbortError'));
      }, { once: true });
    });
    const volume = Math.min(42, Math.max(4, conditions.length * 11));
    return {
      ruleId: String(ruleId),
      ruleName: 'Fixture detection rule',
      matchingHistoricalAlerts: volume,
      projectedVolumeReduction: Math.round((volume / 128) * 1000) / 10,
      affectedTechniques: [{ techniqueId: 'T1110', techniqueName: 'Brute Force', alertCount: volume }],
      exceptionOverlapWithExisting: fixtureExceptions
        .filter((item) => item.active)
        .map((item) => ({ exceptionId: String(item.id), overlapRatio: 0.12, summary: item.title })),
      falseNegativeRiskPrompts: [
        'Fictional preview only — no historical OpenSearch query was executed.',
        'Broad host or user exceptions can create coverage blind spots.',
      ],
      highImpactWarning: volume > 30,
      approvalRequired: true,
      honesty: 'Design fixture: exception impact is fictional and isolated from production alerts.',
      mode: 'fixture',
    };
  }

  const response = await fetch(
    `/api/ha-detection-rules/${encodeURIComponent(String(ruleId))}/exceptions/preview`,
    {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ conditions }),
    },
  );

  await handleAuth(response);

  if (response.status === 403) {
    throw new Error('Required permission: SOC Manager or Platform Administrator');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Exception preview failed (HTTP ${response.status})`);
  }

  const body = await response.json() as {
    ruleId?: string;
    ruleName?: string | null;
    matchingHistoricalAlerts?: number;
    projectedVolumeReduction?: number;
    affectedTechniques?: Array<{ techniqueId?: string; id?: string; techniqueName?: string; name?: string; alertCount?: number }>;
    exceptionOverlapWithExisting?: Array<{ exceptionId?: string; id?: string; overlapRatio?: number; summary?: string }>;
    falseNegativeRiskPrompts?: string[];
    highImpactWarning?: boolean;
    approvalRequired?: boolean;
  };

  return {
    ruleId: body.ruleId ?? String(ruleId),
    ruleName: body.ruleName ?? null,
    matchingHistoricalAlerts: body.matchingHistoricalAlerts ?? 0,
    projectedVolumeReduction: body.projectedVolumeReduction ?? 0,
    affectedTechniques: (body.affectedTechniques ?? []).map((item) => ({
      techniqueId: item.techniqueId ?? item.id ?? 'unknown',
      techniqueName: item.techniqueName ?? item.name,
      alertCount: item.alertCount,
    })),
    exceptionOverlapWithExisting: (body.exceptionOverlapWithExisting ?? []).map((item) => ({
      exceptionId: item.exceptionId ?? item.id ?? 'unknown',
      overlapRatio: item.overlapRatio,
      summary: item.summary,
    })),
    falseNegativeRiskPrompts: body.falseNegativeRiskPrompts ?? [],
    highImpactWarning: Boolean(body.highImpactWarning),
    approvalRequired: Boolean(body.approvalRequired),
    honesty: 'Read-only OpenSearch impact projection — no exception is persisted by this call.',
    mode: 'opensearch_historical',
  };
}

export async function listExceptions(
  ruleId: string | number,
  signal?: AbortSignal,
): Promise<DetectionException[]> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    return fixtureExceptions.map((item) => ({ ...item, ruleId: String(ruleId) }));
  }

  const response = await fetch(
    `/api/ha-detection-rules/${encodeURIComponent(String(ruleId))}/exceptions`,
    {
      signal,
      headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
    },
  );
  await handleAuth(response);
  if (response.status === 403) {
    throw new Error('Required permission: Analyst or higher');
  }
  if (!response.ok) {
    throw new Error(`Failed to list exceptions (HTTP ${response.status})`);
  }
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) return [];
  return body.map((item) => mapException(item as Record<string, unknown>, String(ruleId)));
}

export async function saveException(
  ruleId: string | number,
  title: string,
  reason: string,
  conditions: ExceptionCondition[],
  signal?: AbortSignal,
): Promise<DetectionException> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    const created: DetectionException = {
      id: 9100 + fixtureExceptions.length,
      ruleId: String(ruleId),
      title: title.trim() || `Exception for ${ruleId}`,
      reason: reason.trim() || null,
      conditions,
      active: false,
      status: 'draft',
      createdBy: 'fixture-analyst',
      activatedBy: null,
      activatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      honesty: 'Design fixture: exception saved locally in memory only.',
    };
    fixtureExceptions = [created, ...fixtureExceptions];
    return created;
  }

  const response = await fetch(
    `/api/ha-detection-rules/${encodeURIComponent(String(ruleId))}/exceptions`,
    {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ title, reason, conditions }),
    },
  );
  await handleAuth(response);
  if (response.status === 403) {
    throw new Error('Required permission: Analyst or higher');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to save exception (HTTP ${response.status})`);
  }
  return mapException(await response.json() as Record<string, unknown>, String(ruleId));
}

export async function setExceptionActive(
  ruleId: string | number,
  exceptionId: string | number,
  active: boolean,
  signal?: AbortSignal,
): Promise<DetectionException> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    fixtureExceptions = fixtureExceptions.map((item) => {
      if (String(item.id) !== String(exceptionId)) return item;
      return {
        ...item,
        active,
        status: active ? 'active' : 'inactive',
        activatedBy: 'fixture-soc-manager',
        activatedAt: active ? new Date().toISOString() : item.activatedAt,
        updatedAt: new Date().toISOString(),
      };
    });
    const found = fixtureExceptions.find((item) => String(item.id) === String(exceptionId));
    if (!found) throw new Error('Fixture exception not found');
    return { ...found, ruleId: String(ruleId) };
  }

  const action = active ? 'activate' : 'deactivate';
  const response = await fetch(
    `/api/ha-detection-rules/${encodeURIComponent(String(ruleId))}/exceptions/${encodeURIComponent(String(exceptionId))}/${action}`,
    {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
    },
  );
  await handleAuth(response);
  if (response.status === 403) {
    throw new Error('Required permission: SOC Manager or Platform Administrator');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to ${action} exception (HTTP ${response.status})`);
  }
  return mapException(await response.json() as Record<string, unknown>, String(ruleId));
}
