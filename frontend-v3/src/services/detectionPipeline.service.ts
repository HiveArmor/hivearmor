/**
 * DET-OBS-001 — detection pipeline health (LoadReport / afterEvents counters).
 * GET /api/ha-detection-rules/pipeline-health
 */

const TOKEN_KEY = 'hivearmor_auth_token';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface DetectionLoadReport {
  loaded: number | null;
  skipped: number | null;
  invalid: string[] | null;
  pilotPackOk: boolean | null;
  pilotMissing: string[] | null;
  lastLoad: string | null;
}

export interface DetectionPipelineHealth {
  available: boolean;
  mode: 'event_processor' | 'fixture' | 'unavailable';
  status: string;
  honesty: string;
  checkedAt: string;
  activeRuleCount: number | null;
  afterEventsMisses: number | null;
  afterEventsErrors: number | null;
  correlationChecks: number | null;
  lastReload: string | null;
  loadReport: DetectionLoadReport | null;
  injectEnabled: boolean | null;
  indexPatternConstraint: string;
}

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export async function fetchDetectionPipelineHealth(signal?: AbortSignal): Promise<DetectionPipelineHealth> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    return {
      available: true,
      mode: 'fixture',
      status: 'ok',
      honesty: 'Design fixture: LoadReport and afterEvents counters are fictional.',
      checkedAt: new Date().toISOString(),
      activeRuleCount: 642,
      afterEventsMisses: 18,
      afterEventsErrors: 2,
      correlationChecks: 1284,
      lastReload: '2026-09-07T10:42:00Z',
      loadReport: {
        loaded: 648,
        skipped: 4,
        invalid: ['legacy-broken-sample.yml'],
        pilotPackOk: true,
        pilotMissing: [],
        lastLoad: '2026-09-07T10:42:00Z',
      },
      injectEnabled: true,
      indexPatternConstraint: 'v3-hive-<type>-YYYY.MM.DD',
    };
  }

  const response = await fetch('/api/ha-detection-rules/pipeline-health', {
    signal,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  if (!response.ok) {
    throw new Error(`Pipeline health unavailable (HTTP ${response.status})`);
  }

  const body = await response.json() as Record<string, unknown>;
  const report = body.loadReport && typeof body.loadReport === 'object'
    ? body.loadReport as Record<string, unknown>
    : null;

  return {
    available: Boolean(body.available),
    mode: body.mode === 'event_processor' ? 'event_processor' : body.mode === 'fixture' ? 'fixture' : 'unavailable',
    status: typeof body.status === 'string' ? body.status : 'unavailable',
    honesty: typeof body.honesty === 'string'
      ? body.honesty
      : 'STAGING CANDIDATE — pipeline health may be incomplete without a live event-processor.',
    checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : new Date().toISOString(),
    activeRuleCount: typeof body.activeRuleCount === 'number' ? body.activeRuleCount : null,
    afterEventsMisses: typeof body.afterEventsMisses === 'number' ? body.afterEventsMisses : null,
    afterEventsErrors: typeof body.afterEventsErrors === 'number' ? body.afterEventsErrors : null,
    correlationChecks: typeof body.correlationChecks === 'number' ? body.correlationChecks : null,
    lastReload: typeof body.lastReload === 'string' ? body.lastReload : null,
    loadReport: report
      ? {
          loaded: typeof report.loaded === 'number' ? report.loaded : null,
          skipped: typeof report.skipped === 'number' ? report.skipped : null,
          invalid: Array.isArray(report.invalid) ? report.invalid.map(String) : null,
          pilotPackOk: typeof report.pilotPackOk === 'boolean' ? report.pilotPackOk : null,
          pilotMissing: Array.isArray(report.pilotMissing) ? report.pilotMissing.map(String) : null,
          lastLoad: typeof report.lastLoad === 'string' ? report.lastLoad : null,
        }
      : null,
    injectEnabled: typeof body.injectEnabled === 'boolean' ? body.injectEnabled : null,
    indexPatternConstraint: typeof body.indexPatternConstraint === 'string'
      ? body.indexPatternConstraint
      : 'v3-hive-<type>-YYYY.MM.DD',
  };
}
