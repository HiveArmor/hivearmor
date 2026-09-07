/**
 * Agent policy schema v1 builders/parsers for the Utm push plane.
 * Contract mirrors `agent/agent/policy_schema.go` (agent is parse SoT).
 * Schema v1.1 additive: `telemetry.sca_interval_hours` / `sbom_interval_hours`
 * (still emitted under schema_version 1 — agent ignores unknown until wired).
 */

import {
  AGENT_POLICY_SCHEMA_VERSION,
  type AgentFimPolicyFormValues,
  type AgentPolicyDocument,
  type CollectorKey,
  type FimApplyMode,
  type FimWatchRule,
  type TelemetryPolicySection,
  type UtmAgentPolicyDTO,
} from '@/types/agentPolicies';

const COLLECTOR_KEYS: readonly CollectorKey[] = [
  'fim',
  'dns',
  'netconn',
  'usb',
  'netflow',
  'syslog',
  'file',
] as const;

/** Agent hardcoded default (telemetry/loop.go) — UI hint only until agent reads policy. */
export const DEFAULT_TELEMETRY_INTERVAL_HOURS = 6;

/** Inclusive max hours operators may set in the console (1 week). */
export const MAX_TELEMETRY_INTERVAL_HOURS = 168;

export function defaultAgentFimPolicyFormValues(): AgentFimPolicyFormValues {
  return {
    policyName: '',
    description: '',
    platform: 'all',
    isActive: true,
    fimMode: 'merge',
    rules: [{ path: '', recursive: true, exclude: [] }],
    allowShell: false,
    collectors: {
      fim: true,
      dns: true,
      netconn: true,
      usb: true,
      netflow: true,
      syslog: true,
      file: true,
    },
    scaIntervalHours: '',
    sbomIntervalHours: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFimMode(raw: unknown): FimApplyMode {
  const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (mode === 'replace') return 'replace';
  return 'merge';
}

function parseExclude(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRules(raw: unknown): FimWatchRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: FimWatchRule[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const path = typeof item.path === 'string' ? item.path.trim() : '';
    if (!path) continue;
    rules.push({
      path,
      recursive: item.recursive === true,
      exclude: parseExclude(item.exclude),
    });
  }
  return rules;
}

function parseCollectors(raw: unknown): Partial<Record<CollectorKey, boolean>> {
  if (!isRecord(raw)) return {};
  const out: Partial<Record<CollectorKey, boolean>> = {};
  for (const key of COLLECTOR_KEYS) {
    if (typeof raw[key] === 'boolean') {
      out[key] = raw[key];
    }
  }
  return out;
}

/**
 * Parse a positive integer hour value from JSON (number or numeric string).
 * Returns undefined when missing / invalid.
 */
export function parseIntervalHours(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    return n > 0 ? n : undefined;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function parseTelemetry(raw: unknown): TelemetryPolicySection | undefined {
  if (!isRecord(raw)) return undefined;
  const sca = parseIntervalHours(raw.sca_interval_hours);
  const sbom = parseIntervalHours(raw.sbom_interval_hours);
  if (sca == null && sbom == null) return undefined;
  const out: TelemetryPolicySection = {};
  if (sca != null) out.sca_interval_hours = sca;
  if (sbom != null) out.sbom_interval_hours = sbom;
  return out;
}

/**
 * Parse form hour string → positive int, null when blank, or `'invalid'`.
 */
export function formHoursOrInvalid(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_TELEMETRY_INTERVAL_HOURS) {
    return 'invalid';
  }
  return n;
}

/**
 * Parse `policyConfig` JSON into a typed document.
 * Empty / whitespace → empty defaults (schema_version 0 semantics on agent).
 * Throws on invalid JSON or unsupported schema_version.
 */
export function parseAgentPolicyDocument(raw: string | null | undefined): AgentPolicyDocument {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { schema_version: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('policyConfig is not valid JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('policyConfig must be a JSON object');
  }

  const versionRaw = parsed.schema_version;
  const schemaVersion =
    typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? versionRaw : 0;

  if (schemaVersion !== 0 && schemaVersion !== AGENT_POLICY_SCHEMA_VERSION) {
    throw new Error(
      `unsupported policy schema_version ${schemaVersion} (agent supports ${AGENT_POLICY_SCHEMA_VERSION})`,
    );
  }

  const doc: AgentPolicyDocument = { schema_version: schemaVersion };

  if (isRecord(parsed.fim)) {
    doc.fim = {
      mode: parseFimMode(parsed.fim.mode),
      rules: parseRules(parsed.fim.rules),
    };
  }

  const collectors = parseCollectors(parsed.collectors);
  if (Object.keys(collectors).length > 0) {
    doc.collectors = collectors;
  }

  if (isRecord(parsed.response)) {
    doc.response = {
      allow_shell: parsed.response.allow_shell === true,
    };
  }

  const telemetry = parseTelemetry(parsed.telemetry);
  if (telemetry) {
    doc.telemetry = telemetry;
  }

  return doc;
}

/** Normalize form → schema v1 document ready to stringify into policyConfig. */
export function buildAgentPolicyDocument(form: AgentFimPolicyFormValues): AgentPolicyDocument {
  const rules: FimWatchRule[] = form.rules
    .map((r) => ({
      path: r.path.trim(),
      recursive: r.recursive === true,
      exclude: (r.exclude ?? []).map((e) => e.trim()).filter(Boolean),
    }))
    .filter((r) => r.path.length > 0)
    .map((r) =>
      r.exclude && r.exclude.length > 0
        ? r
        : { path: r.path, recursive: r.recursive },
    );

  const collectors: Partial<Record<CollectorKey, boolean>> = {};
  for (const key of COLLECTOR_KEYS) {
    if (typeof form.collectors[key] === 'boolean') {
      collectors[key] = form.collectors[key];
    }
  }

  const telemetry: TelemetryPolicySection = {};
  const sca = formHoursOrInvalid(form.scaIntervalHours);
  const sbom = formHoursOrInvalid(form.sbomIntervalHours);
  if (typeof sca === 'number') telemetry.sca_interval_hours = sca;
  if (typeof sbom === 'number') telemetry.sbom_interval_hours = sbom;

  const doc: AgentPolicyDocument = {
    schema_version: AGENT_POLICY_SCHEMA_VERSION,
    fim: {
      mode: form.fimMode === 'replace' ? 'replace' : 'merge',
      rules,
    },
    collectors,
    response: {
      allow_shell: form.allowShell === true,
    },
  };

  if (Object.keys(telemetry).length > 0) {
    doc.telemetry = telemetry;
  }

  return doc;
}

export function serializeAgentPolicyDocument(doc: AgentPolicyDocument): string {
  return JSON.stringify(doc);
}

/** Validate form before save. Returns human-facing error strings. */
export function validateAgentFimPolicyForm(form: AgentFimPolicyFormValues): string[] {
  const errors: string[] = [];
  if (!form.policyName.trim()) {
    errors.push('Policy name is required');
  }
  if (form.fimMode !== 'merge' && form.fimMode !== 'replace') {
    errors.push('FIM mode must be merge or replace');
  }
  const namedRules = form.rules.filter((r) => r.path.trim().length > 0);
  if (namedRules.length === 0) {
    errors.push('Add at least one FIM include path');
  }
  form.rules.forEach((r, i) => {
    if (r.path.trim().length === 0 && (r.exclude?.length ?? 0) > 0) {
      errors.push(`Rule ${i + 1}: path is required when exclude patterns are set`);
    }
  });

  const sca = formHoursOrInvalid(form.scaIntervalHours);
  if (sca === 'invalid') {
    errors.push(
      `SCA interval must be an integer from 1 to ${MAX_TELEMETRY_INTERVAL_HOURS} hours`,
    );
  }
  const sbom = formHoursOrInvalid(form.sbomIntervalHours);
  if (sbom === 'invalid') {
    errors.push(
      `SBOM interval must be an integer from 1 to ${MAX_TELEMETRY_INTERVAL_HOURS} hours`,
    );
  }

  return errors;
}

/** Map a Utm policy DTO + parsed config into editor form values. */
export function utmPolicyToFormValues(policy: UtmAgentPolicyDTO): AgentFimPolicyFormValues {
  const base = defaultAgentFimPolicyFormValues();
  let doc: AgentPolicyDocument = { schema_version: 0 };
  try {
    doc = parseAgentPolicyDocument(policy.policyConfig);
  } catch {
    // Keep defaults; caller may surface parse error separately.
  }

  const rules =
    doc.fim?.rules && doc.fim.rules.length > 0
      ? doc.fim.rules.map((r) => ({
          path: r.path,
          recursive: r.recursive,
          exclude: r.exclude ?? [],
        }))
      : base.rules;

  return {
    policyName: policy.policyName ?? '',
    description: policy.description ?? '',
    platform: policy.platform?.trim() ? policy.platform : 'all',
    isActive: policy.isActive !== false,
    fimMode: doc.fim?.mode === 'replace' ? 'replace' : 'merge',
    rules,
    allowShell: doc.response?.allow_shell === true,
    collectors: {
      ...base.collectors,
      ...(doc.collectors ?? {}),
    },
    scaIntervalHours:
      doc.telemetry?.sca_interval_hours != null
        ? String(doc.telemetry.sca_interval_hours)
        : '',
    sbomIntervalHours:
      doc.telemetry?.sbom_interval_hours != null
        ? String(doc.telemetry.sbom_interval_hours)
        : '',
  };
}

/** Build create/update body with schema v1 policyConfig string. */
export function formValuesToUtmPolicyDto(form: AgentFimPolicyFormValues): UtmAgentPolicyDTO {
  const doc = buildAgentPolicyDocument(form);
  return {
    policyName: form.policyName.trim(),
    description: form.description.trim() || null,
    platform: form.platform.trim() || 'all',
    isActive: form.isActive,
    policyConfig: serializeAgentPolicyDocument(doc),
  };
}

export { COLLECTOR_KEYS };
