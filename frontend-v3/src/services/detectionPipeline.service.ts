/**
 * DET-OBS-001 / DET-SLO-001 / DET-INDEX-001b — detection pipeline health.
 * GET /api/ha-detection-rules/pipeline-health
 */

const TOKEN_KEY = 'hivearmor_auth_token';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface DetectionLoadReport {
  loaded: number | null;
  skipped: number | null;
  invalid: string[] | null;
  loadedNames: string[] | null;
  pilotPackOk: boolean | null;
  pilotMissing: string[] | null;
  lastLoad: string | null;
}

export interface IngestAlertSlo {
  available: boolean;
  sampleCount: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  targetP95Ms: number;
  breached: boolean | null;
  skippedUnmeasurable: number | null;
  window: string;
  honesty: string;
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
  afterEventsMissRate: number | null;
  afterEventsMissRateAvailable: boolean | null;
  correlationChecks: number | null;
  exceptionsSuppressed: number | null;
  activeExceptions: number | null;
  exceptionsLastLoad: string | null;
  lastReload: string | null;
  loadReport: DetectionLoadReport | null;
  injectEnabled: boolean | null;
  indexPatternConstraint: string;
  ingestAlertSlo: IngestAlertSlo;
}

const SLO_UNAVAILABLE_HONESTY =
  'STAGING CANDIDATE — ingest→alert latency is not measurable (event-processor unreachable or no persisted alerts with a parseable @timestamp).';

const INDEX_PATTERN = 'v3-hive-<type>-YYYY.MM.DD';

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function unavailableIngestAlertSlo(honesty = SLO_UNAVAILABLE_HONESTY): IngestAlertSlo {
  return {
    available: false,
    sampleCount: 0,
    p50Ms: null,
    p95Ms: null,
    targetP95Ms: 60_000,
    breached: null,
    skippedUnmeasurable: null,
    window: 'last_1024_alert_persists',
    honesty,
  };
}

export function parseIngestAlertSlo(raw: unknown): IngestAlertSlo {
  if (!raw || typeof raw !== 'object') {
    return unavailableIngestAlertSlo();
  }
  const body = raw as Record<string, unknown>;
  const available = body.available === true;
  const p50 = available ? asFiniteNumber(body.p50Ms) : null;
  const p95 = available ? asFiniteNumber(body.p95Ms) : null;
  if (!available || p50 === null || p95 === null) {
    return {
      ...unavailableIngestAlertSlo(typeof body.honesty === 'string' ? body.honesty : SLO_UNAVAILABLE_HONESTY),
      sampleCount: asFiniteNumber(body.sampleCount) ?? 0,
      skippedUnmeasurable: asFiniteNumber(body.skippedUnmeasurable),
      targetP95Ms: asFiniteNumber(body.targetP95Ms) ?? 60_000,
    };
  }
  return {
    available: true,
    sampleCount: asFiniteNumber(body.sampleCount),
    p50Ms: p50,
    p95Ms: p95,
    targetP95Ms: asFiniteNumber(body.targetP95Ms) ?? 60_000,
    breached: asBoolean(body.breached),
    skippedUnmeasurable: asFiniteNumber(body.skippedUnmeasurable),
    window: typeof body.window === 'string' ? body.window : 'last_1024_alert_persists',
    honesty: typeof body.honesty === 'string'
      ? body.honesty
      : 'STAGING CANDIDATE — p50/p95 is event @timestamp to required alert persist.',
  };
}

export function formatLatencyMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'unavailable';
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatMissRate(rate: number | null, available: boolean | null): string {
  if (available !== true || rate === null || !Number.isFinite(rate) || rate < 0) {
    return 'unavailable';
  }
  return `${(rate * 100).toFixed(2)}%`;
}

export function parseDetectionPipelineHealth(body: Record<string, unknown>): DetectionPipelineHealth {
  const report = body.loadReport && typeof body.loadReport === 'object'
    ? body.loadReport as Record<string, unknown>
    : null;
  const missRateAvailable = asBoolean(body.afterEventsMissRateAvailable);
  const missRate = asFiniteNumber(body.afterEventsMissRate);

  return {
    available: Boolean(body.available),
    mode: body.mode === 'event_processor' ? 'event_processor' : body.mode === 'fixture' ? 'fixture' : 'unavailable',
    status: typeof body.status === 'string' ? body.status : 'unavailable',
    honesty: typeof body.honesty === 'string'
      ? body.honesty
      : 'STAGING CANDIDATE — pipeline health may be incomplete without a live event-processor.',
    checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : new Date().toISOString(),
    activeRuleCount: asFiniteNumber(body.activeRuleCount),
    afterEventsMisses: asFiniteNumber(body.afterEventsMisses),
    afterEventsErrors: asFiniteNumber(body.afterEventsErrors),
    afterEventsMissRate: missRateAvailable === true ? missRate : null,
    afterEventsMissRateAvailable: missRateAvailable,
    correlationChecks: asFiniteNumber(body.correlationChecks),
    exceptionsSuppressed: asFiniteNumber(body.exceptionsSuppressed),
    activeExceptions: asFiniteNumber(body.activeExceptions),
    exceptionsLastLoad: typeof body.exceptionsLastLoad === 'string' ? body.exceptionsLastLoad : null,
    lastReload: typeof body.lastReload === 'string' ? body.lastReload : null,
    loadReport: report
      ? {
          loaded: asFiniteNumber(report.loaded),
          skipped: asFiniteNumber(report.skipped),
          invalid: Array.isArray(report.invalid) ? report.invalid.map(String) : null,
          loadedNames: Array.isArray(report.loadedNames) ? report.loadedNames.map(String) : null,
          pilotPackOk: typeof report.pilotPackOk === 'boolean' ? report.pilotPackOk : null,
          pilotMissing: Array.isArray(report.pilotMissing) ? report.pilotMissing.map(String) : null,
          lastLoad: typeof report.lastLoad === 'string' ? report.lastLoad : null,
        }
      : null,
    injectEnabled: asBoolean(body.injectEnabled),
    indexPatternConstraint: typeof body.indexPatternConstraint === 'string'
      ? body.indexPatternConstraint
      : INDEX_PATTERN,
    ingestAlertSlo: parseIngestAlertSlo(body.ingestAlertSlo),
  };
}

function fixtureHealth(): DetectionPipelineHealth {
  return {
    available: true,
    mode: 'fixture',
    status: 'ok',
    honesty:
      'Design fixture: LoadReport, ingest→alert SLO, afterEvents miss counters, and exception-suppression counters are fictional. DET-TEST-002: sequence/risk/graph test console uses engineParity=go or unavailable — never fake CEL hits. engineLoaded=true only when LoadReport.loadedNames lists the rule (~30s watchLoop). DET-SEQ staging pack: 7 sequence, 6 risk, 5 graph-offense (Java CEL dry-run does not execute sequence/risk/graph engines). Risk scoring honors afterEvents before addScoreFn. Graph pack starts when NEO4J_ENABLED=true on local-dev/staging event-processor (Neo4j was already in local-dev compose; the flag was never flipped). Staging Neo4j is new and stays empty without entity ingest.',
    checkedAt: new Date().toISOString(),
    activeRuleCount: 642,
    afterEventsMisses: 18,
    afterEventsErrors: 2,
    afterEventsMissRate: 18 / 1284,
    afterEventsMissRateAvailable: true,
    correlationChecks: 1284,
    exceptionsSuppressed: 37,
    activeExceptions: 1,
    exceptionsLastLoad: '2026-09-07T10:41:45Z',
    lastReload: '2026-09-07T10:42:00Z',
    loadReport: {
      loaded: 648,
      skipped: 4,
      invalid: ['legacy-broken-sample.yml'],
      loadedNames: ['PILOT-WIN-FAILED-LOGON', 'SEQ-BRUTE-FORCE-THEN-SUCCESS'],
      pilotPackOk: true,
      pilotMissing: [],
      lastLoad: '2026-09-07T10:42:00Z',
    },
    injectEnabled: true,
    indexPatternConstraint: INDEX_PATTERN,
    ingestAlertSlo: {
      available: true,
      sampleCount: 256,
      p50Ms: 840,
      p95Ms: 4200,
      targetP95Ms: 60_000,
      breached: false,
      skippedUnmeasurable: 3,
      window: 'last_1024_alert_persists',
      honesty: 'Design fixture: ingest→alert p50/p95 histogram is fictional.',
    },
  };
}

export async function fetchDetectionPipelineHealth(signal?: AbortSignal): Promise<DetectionPipelineHealth> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    return fixtureHealth();
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
  return parseDetectionPipelineHealth(body);
}
