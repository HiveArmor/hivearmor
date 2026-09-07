/**
 * Detection exception / suppression impact preview.
 * POST /api/ha-detection-rules/{ruleId}/exceptions/preview
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

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
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
      exceptionOverlapWithExisting: [],
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

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

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
