/**
 * PT-2 policy-template schema — form ⇄ PT-0 envelope ⇄ schema-v1 `policyConfig`.
 *
 * The frozen `policy-template.schema.json` keeps capability sections FLAT at the
 * top level of the agent wire document (schema_version 1). PT-1 `POST /templates`
 * accepts that flat ENVELOPE and splits metadata → columns, sections → policyConfig.
 * Editing an existing template goes through `PUT /agent-policies/{id}` with a
 * `policyConfig` JSON string, so we build BOTH shapes from one form model.
 *
 * FIM is reused unchanged from `agentPolicySchema.ts` so it round-trips byte-identically.
 */

import {
  COLLECTOR_KEYS,
  formHoursOrInvalid,
} from '@/lib/agentPolicySchema';
import type {
  CollectorKey,
  FimWatchRule,
  UtmAgentPolicyDTO,
} from '@/types/agentPolicies';
import type {
  CertificateStoreRow,
  EventLogRow,
  MonitorItem,
  PolicyTemplateEnvelope,
  PolicyTemplateFormValues,
  RegistryRootRow,
  ScanSpecForm,
  TemplatePlatform,
  TemplateScope,
  UserLogRow,
} from '@/types/policyTemplates';

const SCHEMA_VERSION = 1 as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function bool(v: unknown): boolean {
  return v === true;
}

/** ALL/NONE/comma-list → normalized wire value (string 'ALL'/'NONE' or id array). */
function parseIncludeExclude(raw: string): 'ALL' | 'NONE' | string[] | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const upper = t.toUpperCase();
  if (upper === 'ALL') return 'ALL';
  if (upper === 'NONE') return 'NONE';
  const ids = t
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function includeExcludeToForm(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join(', ');
  return '';
}

function splitLines(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Defaults --------------------------------------------------------------

export function defaultPolicyTemplateForm(): PolicyTemplateFormValues {
  return {
    name: '',
    description: '',
    scope: 'ORG',
    platform: 'any',
    monitor: { items: [] },
    event: { fileLogIis: false, fileLogDhcp: false, eventLogs: [] },
    ueba: { enabled: false },
    userLog: [],
    fim: { mode: 'merge', rules: [{ path: '', recursive: true, exclude: [] }] },
    change: { registry: [], installedSoftware: false },
    script: { wmi: [], powershell: [] },
    certificate: [],
    osquery: { queries: [] },
    scans: {
      cis: { enabled: false, profile: '', mode: 'scheduled', cronOrInterval: '', source: 'agent' },
      vuln: { enabled: false, profile: '', mode: 'scheduled', cronOrInterval: '', source: 'agent' },
    },
    collectors: {
      fim: true, dns: true, netconn: true, usb: true, netflow: true, syslog: true, file: true,
    },
    allowShell: false,
    scaIntervalHours: '',
    sbomIntervalHours: '',
  };
}

// --- Build: form → section objects ----------------------------------------

function buildMonitor(items: MonitorItem[]): Record<string, unknown> | undefined {
  const built = items
    .map((i) => ({ metric: i.metric.trim(), intervalSec: i.intervalSec.trim() }))
    .filter((i) => i.metric.length > 0)
    .map((i) => {
      const n = Number.parseInt(i.intervalSec, 10);
      return Number.isFinite(n) && n >= 5 ? { metric: i.metric, intervalSec: n } : { metric: i.metric };
    });
  return built.length > 0 ? { items: built } : undefined;
}

function buildEvent(form: PolicyTemplateFormValues['event']): Record<string, unknown> | undefined {
  const fileLog: Record<string, boolean> = {};
  if (form.fileLogIis) fileLog.iis = true;
  if (form.fileLogDhcp) fileLog.dhcp = true;
  const eventLogs = form.eventLogs
    .filter((r) => r.type.trim().length > 0)
    .map((r) => {
      const out: Record<string, unknown> = { type: r.type.trim() };
      if (r.channel.trim()) out.channel = r.channel.trim();
      const inc = parseIncludeExclude(r.include);
      if (inc !== undefined) out.include = inc;
      const exc = parseIncludeExclude(r.exclude);
      if (exc !== undefined) out.exclude = exc;
      return out;
    });
  const section: Record<string, unknown> = {};
  if (Object.keys(fileLog).length > 0) section.fileLog = fileLog;
  if (eventLogs.length > 0) section.eventLogs = eventLogs;
  return Object.keys(section).length > 0 ? section : undefined;
}

function buildUserLog(rows: UserLogRow[]): Record<string, unknown>[] | undefined {
  const built = rows
    .filter((r) => r.fullFileName.trim().length > 0)
    .map((r) => {
      const out: Record<string, unknown> = { fullFileName: r.fullFileName.trim() };
      if (r.logPrefix.trim()) out.logPrefix = r.logPrefix.trim();
      const start = r.multilineStart.trim();
      const end = r.multilineEnd.trim();
      const maxN = Number.parseInt(r.multilineMaxLines.trim(), 10);
      const multiline: Record<string, unknown> = {};
      if (start) multiline.start = start;
      if (end) multiline.end = end;
      if (Number.isFinite(maxN) && maxN >= 1) multiline.maxLines = maxN;
      if (Object.keys(multiline).length > 0) out.multiline = multiline;
      return out;
    });
  return built.length > 0 ? built : undefined;
}

/** FIM wire object {mode, rules[]} — identical shape to agentPolicySchema builder. */
function buildFim(form: PolicyTemplateFormValues['fim']): Record<string, unknown> {
  const rules: FimWatchRule[] = form.rules
    .map((r) => ({
      path: r.path.trim(),
      recursive: r.recursive === true,
      exclude: (r.exclude ?? []).map((e) => e.trim()).filter(Boolean),
    }))
    .filter((r) => r.path.length > 0)
    .map((r) => (r.exclude && r.exclude.length > 0 ? r : { path: r.path, recursive: r.recursive }));
  return { mode: form.mode === 'replace' ? 'replace' : 'merge', rules };
}

function buildChange(form: PolicyTemplateFormValues['change']): Record<string, unknown> | undefined {
  const registry = form.registry
    .filter((r) => r.rootKey.trim().length > 0)
    .map((r) => {
      const out: Record<string, unknown> = { rootKey: r.rootKey.trim() };
      const ex = splitLines(r.excludeSubkeys);
      if (ex.length > 0) out.excludeSubkeys = ex;
      return out;
    });
  const section: Record<string, unknown> = {};
  if (registry.length > 0) section.registry = registry;
  if (form.installedSoftware) section.installedSoftware = true;
  return Object.keys(section).length > 0 ? section : undefined;
}

function buildScript(form: PolicyTemplateFormValues['script']): Record<string, unknown> | undefined {
  const wmi = form.wmi.map((s) => s.trim()).filter(Boolean);
  const powershell = form.powershell.map((s) => s.trim()).filter(Boolean);
  const section: Record<string, unknown> = {};
  if (wmi.length > 0) section.wmi = wmi;
  if (powershell.length > 0) section.powershell = powershell;
  return Object.keys(section).length > 0 ? section : undefined;
}

function buildCertificate(rows: CertificateStoreRow[]): Record<string, unknown>[] | undefined {
  const built = rows
    .filter((r) => r.store.trim().length > 0)
    .map((r) => {
      const out: Record<string, unknown> = { store: r.store.trim() };
      if (r.add) out.add = true;
      if (r.delete) out.delete = true;
      if (r.expiring) out.expiring = true;
      if (r.expired) out.expired = true;
      return out;
    });
  return built.length > 0 ? built : undefined;
}

function buildOsquery(form: PolicyTemplateFormValues['osquery']): Record<string, unknown> | undefined {
  const queries = form.queries.map((q) => q.trim()).filter(Boolean);
  return queries.length > 0 ? { queries } : undefined;
}

function buildScanSpec(spec: ScanSpecForm): Record<string, unknown> | undefined {
  if (!spec.enabled) return undefined;
  const out: Record<string, unknown> = { enabled: true, mode: spec.mode, source: spec.source };
  if (spec.profile.trim()) out.profile = spec.profile.trim();
  if (spec.mode === 'scheduled' && spec.cronOrInterval.trim()) {
    out.cronOrInterval = spec.cronOrInterval.trim();
  }
  return out;
}

function buildScans(form: PolicyTemplateFormValues['scans']): Record<string, unknown> | undefined {
  const cis = buildScanSpec(form.cis);
  const vuln = buildScanSpec(form.vuln);
  const section: Record<string, unknown> = {};
  if (cis) section.cis = cis;
  if (vuln) section.vuln = vuln;
  return Object.keys(section).length > 0 ? section : undefined;
}

/**
 * Build the FLAT section map shared by both the envelope (create) and the
 * policyConfig document (edit). Empty sections are omitted, not written as no-ops.
 */
function buildSections(form: PolicyTemplateFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const monitor = buildMonitor(form.monitor.items);
  if (monitor) out.monitor = monitor;

  const event = buildEvent(form.event);
  if (event) out.event = event;

  if (form.ueba.enabled) out.ueba = { enabled: true };

  const userLog = buildUserLog(form.userLog);
  if (userLog) out.userLog = userLog;

  // FIM is always present (at least an empty rules array) — it is the enforced core.
  out.fim = buildFim(form.fim);

  const change = buildChange(form.change);
  if (change) out.change = change;

  const script = buildScript(form.script);
  if (script) out.script = script;

  const certificate = buildCertificate(form.certificate);
  if (certificate) out.certificate = certificate;

  const osquery = buildOsquery(form.osquery);
  if (osquery) out.osquery = osquery;

  const scans = buildScans(form.scans);
  if (scans) out.scans = scans;

  // Existing schema-v1 knobs preserved.
  const collectors: Partial<Record<CollectorKey, boolean>> = {};
  for (const key of COLLECTOR_KEYS) {
    if (typeof form.collectors[key] === 'boolean') collectors[key] = form.collectors[key];
  }
  if (Object.keys(collectors).length > 0) out.collectors = collectors;

  out.response = { allow_shell: form.allowShell === true };

  const telemetry: Record<string, number> = {};
  const sca = formHoursOrInvalid(form.scaIntervalHours);
  const sbom = formHoursOrInvalid(form.sbomIntervalHours);
  if (typeof sca === 'number') telemetry.sca_interval_hours = sca;
  if (typeof sbom === 'number') telemetry.sbom_interval_hours = sbom;
  if (Object.keys(telemetry).length > 0) out.telemetry = telemetry;

  return out;
}

/** Build the PT-0 ENVELOPE for `POST /templates` (metadata + flat sections). */
export function buildTemplateEnvelope(form: PolicyTemplateFormValues): PolicyTemplateEnvelope {
  const envelope: PolicyTemplateEnvelope = {
    schema_version: SCHEMA_VERSION,
    name: form.name.trim(),
    scope: form.scope,
    platform: form.platform,
    ...buildSections(form),
  };
  if (form.description.trim()) envelope.description = form.description.trim();
  return envelope;
}

/** Build a schema-v1 `policyConfig` JSON string for edit-via-PUT. */
export function buildTemplatePolicyConfig(form: PolicyTemplateFormValues): string {
  const doc: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    ...buildSections(form),
  };
  return JSON.stringify(doc);
}

/** Build the `UtmAgentPolicyDTO` edit body (metadata columns + policyConfig). */
export function formToTemplateUpdateDto(form: PolicyTemplateFormValues): UtmAgentPolicyDTO {
  return {
    policyName: form.name.trim(),
    description: form.description.trim() || null,
    platform: form.platform === 'any' ? 'all' : form.platform,
    isActive: true,
    policyConfig: buildTemplatePolicyConfig(form),
  };
}

// --- Parse: DTO/policyConfig → form ---------------------------------------

function parseFimRules(raw: unknown): FimWatchRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: FimWatchRule[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const path = str(item.path).trim();
    if (!path) continue;
    const exclude = Array.isArray(item.exclude)
      ? item.exclude.filter((e): e is string => typeof e === 'string')
      : [];
    rules.push({ path, recursive: item.recursive === true, exclude });
  }
  return rules;
}

function parseScanSpec(raw: unknown): ScanSpecForm {
  const base: ScanSpecForm = {
    enabled: false, profile: '', mode: 'scheduled', cronOrInterval: '', source: 'agent',
  };
  if (!isRecord(raw)) return base;
  return {
    enabled: bool(raw.enabled),
    profile: str(raw.profile),
    mode: raw.mode === 'realtime' ? 'realtime' : 'scheduled',
    cronOrInterval: str(raw.cronOrInterval),
    source: raw.source === 'ingest' ? 'ingest' : 'agent',
  };
}

function normalizePlatform(p: unknown): TemplatePlatform {
  const s = str(p).toLowerCase();
  if (s === 'windows' || s === 'linux' || s === 'macos') return s;
  return 'any';
}

function normalizeScope(s: unknown): TemplateScope {
  return str(s).toUpperCase() === 'GLOBAL' ? 'GLOBAL' : 'ORG';
}

/**
 * Parse a template DTO (metadata columns + `policyConfig` JSON) into editor form
 * values. Accepts both the flat wire shape and the optional `sections` wrapper
 * that the frozen schema permits.
 */
export function templateDtoToForm(dto: UtmAgentPolicyDTO): PolicyTemplateFormValues {
  const base = defaultPolicyTemplateForm();

  let cfg: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse((dto.policyConfig ?? '').trim() || '{}') as unknown;
    if (isRecord(parsed)) cfg = parsed;
  } catch {
    // keep defaults; parse error surfaced by caller if needed
  }

  // Sections may live flat or under a `sections` wrapper (schema permits both).
  const sectionSrc: Record<string, unknown> = isRecord(cfg.sections)
    ? { ...cfg, ...(cfg.sections as Record<string, unknown>) }
    : cfg;

  const form: PolicyTemplateFormValues = {
    ...base,
    name: dto.policyName ?? '',
    description: dto.description ?? '',
    scope: normalizeScope((dto as { scope?: unknown }).scope),
    platform: normalizePlatform(dto.platform),
    version: typeof dto.versionNum === 'number' ? dto.versionNum : undefined,
  };

  // Monitor
  if (isRecord(sectionSrc.monitor) && Array.isArray(sectionSrc.monitor.items)) {
    form.monitor.items = (sectionSrc.monitor.items as unknown[])
      .filter(isRecord)
      .map((i): MonitorItem => ({
        metric: str(i.metric),
        intervalSec: typeof i.intervalSec === 'number' ? String(i.intervalSec) : '',
      }));
  }

  // Event
  if (isRecord(sectionSrc.event)) {
    const ev = sectionSrc.event;
    if (isRecord(ev.fileLog)) {
      form.event.fileLogIis = bool(ev.fileLog.iis);
      form.event.fileLogDhcp = bool(ev.fileLog.dhcp);
    }
    if (Array.isArray(ev.eventLogs)) {
      form.event.eventLogs = ev.eventLogs.filter(isRecord).map((r): EventLogRow => ({
        type: str(r.type),
        channel: str(r.channel),
        include: includeExcludeToForm(r.include),
        exclude: includeExcludeToForm(r.exclude),
      }));
    }
  }

  // UEBA
  if (isRecord(sectionSrc.ueba)) form.ueba.enabled = bool(sectionSrc.ueba.enabled);

  // User Log
  if (Array.isArray(sectionSrc.userLog)) {
    form.userLog = sectionSrc.userLog.filter(isRecord).map((r): UserLogRow => {
      const ml = isRecord(r.multiline) ? r.multiline : {};
      return {
        fullFileName: str(r.fullFileName),
        logPrefix: str(r.logPrefix),
        multilineStart: str(ml.start),
        multilineEnd: str(ml.end),
        multilineMaxLines: typeof ml.maxLines === 'number' ? String(ml.maxLines) : '',
      };
    });
  }

  // FIM (object wire form; array shorthand also tolerated)
  if (Array.isArray(sectionSrc.fim)) {
    const rules = parseFimRules(sectionSrc.fim);
    form.fim = { mode: 'merge', rules: rules.length > 0 ? rules : base.fim.rules };
  } else if (isRecord(sectionSrc.fim)) {
    const rules = parseFimRules(sectionSrc.fim.rules);
    form.fim = {
      mode: sectionSrc.fim.mode === 'replace' ? 'replace' : 'merge',
      rules: rules.length > 0 ? rules : base.fim.rules,
    };
  }

  // Change
  if (isRecord(sectionSrc.change)) {
    const ch = sectionSrc.change;
    if (Array.isArray(ch.registry)) {
      form.change.registry = ch.registry.filter(isRecord).map((r): RegistryRootRow => ({
        rootKey: str(r.rootKey),
        excludeSubkeys: Array.isArray(r.excludeSubkeys)
          ? (r.excludeSubkeys as unknown[]).map((x) => String(x)).join(', ')
          : '',
      }));
    }
    form.change.installedSoftware = bool(ch.installedSoftware);
  }

  // Script
  if (isRecord(sectionSrc.script)) {
    form.script.wmi = Array.isArray(sectionSrc.script.wmi)
      ? (sectionSrc.script.wmi as unknown[]).map((x) => String(x)) : [];
    form.script.powershell = Array.isArray(sectionSrc.script.powershell)
      ? (sectionSrc.script.powershell as unknown[]).map((x) => String(x)) : [];
  }

  // Certificate
  if (Array.isArray(sectionSrc.certificate)) {
    form.certificate = sectionSrc.certificate.filter(isRecord).map((r): CertificateStoreRow => ({
      store: str(r.store),
      add: bool(r.add),
      delete: bool(r.delete),
      expiring: bool(r.expiring),
      expired: bool(r.expired),
    }));
  }

  // Osquery
  if (isRecord(sectionSrc.osquery) && Array.isArray(sectionSrc.osquery.queries)) {
    form.osquery.queries = (sectionSrc.osquery.queries as unknown[]).map((x) => String(x));
  }

  // Scans
  if (isRecord(sectionSrc.scans)) {
    form.scans.cis = parseScanSpec(sectionSrc.scans.cis);
    form.scans.vuln = parseScanSpec(sectionSrc.scans.vuln);
  }

  // Collectors / response / telemetry
  if (isRecord(sectionSrc.collectors)) {
    for (const key of COLLECTOR_KEYS) {
      if (typeof sectionSrc.collectors[key] === 'boolean') {
        form.collectors[key] = sectionSrc.collectors[key] as boolean;
      }
    }
  }
  if (isRecord(sectionSrc.response)) form.allowShell = bool(sectionSrc.response.allow_shell);
  if (isRecord(sectionSrc.telemetry)) {
    const t = sectionSrc.telemetry;
    if (typeof t.sca_interval_hours === 'number') form.scaIntervalHours = String(t.sca_interval_hours);
    if (typeof t.sbom_interval_hours === 'number') form.sbomIntervalHours = String(t.sbom_interval_hours);
  }

  return form;
}

// --- Validate --------------------------------------------------------------

export function validatePolicyTemplateForm(form: PolicyTemplateFormValues): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('Template name is required');
  if (form.name.trim().length > 128) errors.push('Template name must be 128 characters or fewer');

  // Scans: scheduled + enabled requires a cron/interval (schema allOf rule).
  (['cis', 'vuln'] as const).forEach((k) => {
    const spec = form.scans[k];
    if (spec.enabled && spec.mode === 'scheduled' && !spec.cronOrInterval.trim()) {
      errors.push(`${k.toUpperCase()} scan is scheduled but has no cron/interval`);
    }
  });

  // Monitor interval bounds
  form.monitor.items.forEach((i, idx) => {
    const t = i.intervalSec.trim();
    if (t) {
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n) || n < 5 || n > 86400) {
        errors.push(`Monitor item ${idx + 1}: interval must be 5–86400 seconds`);
      }
    }
  });

  const sca = formHoursOrInvalid(form.scaIntervalHours);
  if (sca === 'invalid') errors.push('SCA interval must be an integer from 1 to 168 hours');
  const sbom = formHoursOrInvalid(form.sbomIntervalHours);
  if (sbom === 'invalid') errors.push('SBOM interval must be an integer from 1 to 168 hours');

  return errors;
}
