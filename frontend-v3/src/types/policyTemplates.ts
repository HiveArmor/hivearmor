/**
 * PT-2 tabbed template editor — types.
 *
 * Models the frozen PT-0 `policy-template.schema.json` (schema_version 1) as an
 * editor-friendly form, plus the ENVELOPE shape the PT-1 `POST /templates` endpoint
 * accepts (metadata keys + flat capability sections in one JSON object).
 *
 * FIM is reused UNCHANGED from the existing agent schema-v1 shape so the FIM tab
 * round-trips byte-identically with the FIM push plane.
 */

import type { CollectorKey, FimApplyMode, FimWatchRule } from '@/types/agentPolicies';

export type TemplateScope = 'GLOBAL' | 'ORG';
export type TemplatePlatform = 'windows' | 'linux' | 'macos' | 'any';

/** Which of the 11 editor tabs a section maps to. Order = tab order. */
export const TEMPLATE_TAB_KEYS = [
  'generic',
  'monitor',
  'event',
  'ueba',
  'userLog',
  'fim',
  'change',
  'script',
  'certificate',
  'osquery',
  'scans',
] as const;

export type TemplateTabKey = (typeof TEMPLATE_TAB_KEYS)[number];

/**
 * Per-tab agent-enforcement status for the anti-dishonesty note (SPEC-PT-2 §2).
 * `enforced`   — the agent acts on this section today.
 * `authored`   — saved to the template now; enforced when the named wave lands.
 */
export interface TabEnforcement {
  status: 'enforced' | 'authored';
  /** Wave that will enforce an `authored` section (for the honesty note). */
  enforcedBy?: string;
  /** Short human note shown in the tab. */
  note?: string;
}

/**
 * As of PT-2 the agent enforces FIM + collectors + telemetry cadence + allow_shell
 * only. PT-4's stated scope is Event / Change / Script / Certificate / User Log; the
 * agent already has FIM/netconn/process/osquery/telemetry and REUSES them, so those
 * are noted without over-promising a specific wave. Monitor and UEBA are authored
 * ahead of any named wave. Scans lands in PT-5. This map is the single source of
 * truth for the honesty notes — attributions match SPEC-PT-4 / SPEC-PT-5 exactly.
 */
export const TAB_ENFORCEMENT: Record<TemplateTabKey, TabEnforcement> = {
  generic: { status: 'enforced' },
  monitor: {
    status: 'authored',
    note: 'Perf/discovery polling is authored here but not yet collected by the agent from a template. Not scheduled in a named wave yet.',
  },
  event: {
    status: 'authored',
    enforcedBy: 'PT-4',
    note: 'Event/file-log collection is authored here but not yet enforced by the agent.',
  },
  ueba: {
    status: 'authored',
    note: 'Kernel behavioral telemetry toggle is authored here but not yet enforced by the agent. Not scheduled in a named wave yet.',
  },
  userLog: {
    status: 'authored',
    enforcedBy: 'PT-4',
    note: 'File-tail collection is authored here but not yet enforced by the agent.',
  },
  fim: { status: 'enforced' },
  change: {
    status: 'authored',
    enforcedBy: 'PT-4',
    note: 'Registry/installed-software change monitoring is authored here but not yet enforced by the agent.',
  },
  script: {
    status: 'authored',
    enforcedBy: 'PT-4',
    note: 'WMI/PowerShell collection is authored here but not yet run by the agent. Script content is treated as sensitive and never logged.',
  },
  certificate: {
    status: 'authored',
    enforcedBy: 'PT-4',
    note: 'Certificate-store lifecycle monitoring is authored here but not yet enforced by the agent.',
  },
  osquery: {
    status: 'authored',
    note: 'The agent already runs osqueries, but attaching them from this template is not wired yet. Not scheduled in a named wave yet.',
  },
  scans: {
    status: 'authored',
    enforcedBy: 'PT-5',
    note: 'CIS/Vuln scanning is authored here but not yet run by the agent (native scan lands in PT-5). The ingest source lane is reserved and not built.',
  },
};

// --- Section form models (editor-friendly) --------------------------------

export interface MonitorItem {
  metric: string;
  /** blank string in the form ⇒ omit; 5..86400 when set. */
  intervalSec: string;
}
export interface MonitorSectionForm {
  items: MonitorItem[];
}

export interface EventLogRow {
  type: string;
  channel: string;
  /** 'ALL' | 'NONE' | comma list of ids. */
  include: string;
  exclude: string;
}
export interface EventSectionForm {
  fileLogIis: boolean;
  fileLogDhcp: boolean;
  eventLogs: EventLogRow[];
}

export interface UebaSectionForm {
  enabled: boolean;
}

export interface UserLogRow {
  fullFileName: string;
  logPrefix: string;
  multilineStart: string;
  multilineEnd: string;
  /** blank ⇒ omit. */
  multilineMaxLines: string;
}

export interface FimSectionForm {
  mode: FimApplyMode;
  rules: FimWatchRule[];
}

export interface RegistryRootRow {
  rootKey: string;
  excludeSubkeys: string;
}
export interface ChangeSectionForm {
  registry: RegistryRootRow[];
  installedSoftware: boolean;
}

export interface ScriptSectionForm {
  wmi: string[];
  powershell: string[];
}

export interface CertificateStoreRow {
  store: string;
  add: boolean;
  delete: boolean;
  expiring: boolean;
  expired: boolean;
}

export interface OsquerySectionForm {
  queries: string[];
}

export type ScanMode = 'scheduled' | 'realtime';
export type ScanSource = 'agent' | 'ingest';
export interface ScanSpecForm {
  enabled: boolean;
  profile: string;
  mode: ScanMode;
  cronOrInterval: string;
  source: ScanSource;
}
export interface ScansSectionForm {
  cis: ScanSpecForm;
  vuln: ScanSpecForm;
}

/** Complete editor form for a policy template (all 11 tabs). */
export interface PolicyTemplateFormValues {
  // Generic
  name: string;
  description: string;
  scope: TemplateScope;
  platform: TemplatePlatform;
  /** Read-only; server-owned. Present on edit, absent on create. */
  version?: number;
  // Sections
  monitor: MonitorSectionForm;
  event: EventSectionForm;
  ueba: UebaSectionForm;
  userLog: UserLogRow[];
  fim: FimSectionForm;
  change: ChangeSectionForm;
  script: ScriptSectionForm;
  certificate: CertificateStoreRow[];
  osquery: OsquerySectionForm;
  scans: ScansSectionForm;
  // Existing schema-v1 knobs preserved across round-trip
  collectors: Partial<Record<CollectorKey, boolean>>;
  allowShell: boolean;
  scaIntervalHours: string;
  sbomIntervalHours: string;
}

/**
 * PT-0 ENVELOPE sent to `POST /templates`: schema_version + metadata + FLAT
 * capability sections at the top level (the agent wire shape). Unknown keys are
 * permitted by the schema (`additionalProperties: true`).
 */
export interface PolicyTemplateEnvelope {
  schema_version: 1;
  name: string;
  description?: string;
  scope: TemplateScope;
  platform: TemplatePlatform;
  [section: string]: unknown;
}
