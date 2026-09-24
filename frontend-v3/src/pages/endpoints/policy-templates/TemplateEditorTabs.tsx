/**
 * PT-2 template editor — the 11 tab panels. Each edits one PT-0 section and
 * calls back with the whole form (immutable update). Sections the agent cannot
 * yet enforce carry an EnforcementNote (SPEC-PT-2 §2).
 */

import { CheckRow, EnforcementNote, StringListEditor, TabSection } from './TemplateEditorPrimitives';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import type {
  CertificateStoreRow,
  EventLogRow,
  MonitorItem,
  PolicyTemplateFormValues,
  RegistryRootRow,
  ScanSpecForm,
  UserLogRow,
} from '@/types/policyTemplates';
import { TAB_ENFORCEMENT } from '@/types/policyTemplates';


export interface TabProps {
  form: PolicyTemplateFormValues;
  onChange: (next: PolicyTemplateFormValues) => void;
  disabled: boolean;
  /** GLOBAL scope allowed for this user (else scope selector is locked to ORG). */
  canWriteGlobal: boolean;
  /** True on edit — Generic name/scope become read-context where appropriate. */
  isEdit: boolean;
}

// --- Generic ---------------------------------------------------------------

export function GenericTab({ form, onChange, disabled, canWriteGlobal, isEdit }: TabProps): JSX.Element {
  const set = <K extends keyof PolicyTemplateFormValues>(k: K, v: PolicyTemplateFormValues[K]): void =>
    onChange({ ...form, [k]: v });
  return (
    <TabSection title="Generic" hint="Identity and targeting for this template.">
      <div className="tmpl-editor__field">
        <label htmlFor="tmpl-name">
          Template name <span className="tmpl-editor__req">*</span>
        </label>
        <input
          id="tmpl-name"
          type="text"
          className="tmpl-editor__input"
          required
          maxLength={128}
          disabled={disabled}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>
      <div className="tmpl-editor__field">
        <label htmlFor="tmpl-desc">Description</label>
        <input
          id="tmpl-desc"
          type="text"
          className="tmpl-editor__input"
          maxLength={1024}
          disabled={disabled}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
      <div className="tmpl-editor__row">
        <div className="tmpl-editor__field">
          <label htmlFor="tmpl-scope">Scope</label>
          <select
            id="tmpl-scope"
            className="tmpl-editor__input"
            disabled={disabled || isEdit || !canWriteGlobal}
            value={form.scope}
            onChange={(e) => set('scope', e.target.value === 'GLOBAL' ? 'GLOBAL' : 'ORG')}
          >
            <option value="ORG">ORG — this tenant only</option>
            <option value="GLOBAL">GLOBAL — cross-tenant (admin)</option>
          </select>
          {isEdit ? (
            <p className="tmpl-editor__hint">Scope is fixed after creation. Clone to change it.</p>
          ) : (
            !canWriteGlobal && (
              <p className="tmpl-editor__hint">GLOBAL templates require an administrator.</p>
            )
          )}
        </div>
        <div className="tmpl-editor__field">
          <label htmlFor="tmpl-platform">Platform</label>
          <select
            id="tmpl-platform"
            className="tmpl-editor__input"
            disabled={disabled}
            value={form.platform}
            onChange={(e) => set('platform', e.target.value as PolicyTemplateFormValues['platform'])}
          >
            <option value="any">any</option>
            <option value="windows">windows</option>
            <option value="linux">linux</option>
            <option value="macos">macos</option>
          </select>
        </div>
        <div className="tmpl-editor__field">
          <label htmlFor="tmpl-version">Version</label>
          <input
            id="tmpl-version"
            type="text"
            className="tmpl-editor__input tmpl-editor__input--mono"
            readOnly
            disabled
            value={isEdit && form.version != null ? `v${form.version}` : 'new'}
            title="Server-owned. Bumps on each saved edit."
          />
        </div>
      </div>
    </TabSection>
  );
}

// --- Monitor ---------------------------------------------------------------

export function MonitorTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const items = form.monitor.items;
  const setItems = (next: MonitorItem[]): void =>
    onChange({ ...form, monitor: { items: next } });
  const update = (idx: number, patch: Partial<MonitorItem>): void =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <TabSection title="Monitor" hint="Perf/discovery items. Interval is the only cadence knob here (5–86400s).">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.monitor} />
      {items.map((it, idx) => (
        <div key={idx} className="tmpl-editor__list-row">
          <input
            type="text"
            className="tmpl-editor__input"
            aria-label={`Metric ${idx + 1}`}
            placeholder="cpu.percent"
            value={it.metric}
            disabled={disabled}
            onChange={(e) => update(idx, { metric: e.target.value })}
          />
          <input
            type="number"
            className="tmpl-editor__input tmpl-editor__input--num"
            aria-label={`Interval seconds ${idx + 1}`}
            placeholder="interval s"
            min={5}
            max={86400}
            value={it.intervalSec}
            disabled={disabled}
            onChange={(e) => update(idx, { intervalSec: e.target.value })}
          />
          {!disabled && (
            <button
              type="button"
              className="tmpl-editor__text-btn tmpl-editor__text-btn--danger"
              onClick={() => setItems(items.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setItems([...items, { metric: '', intervalSec: '' }])}>
          Add metric
        </HaButton>
      )}
    </TabSection>
  );
}

// --- Event -----------------------------------------------------------------

export function EventTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const ev = form.event;
  const setEv = (patch: Partial<typeof ev>): void => onChange({ ...form, event: { ...ev, ...patch } });
  const updateRow = (idx: number, patch: Partial<EventLogRow>): void =>
    setEv({ eventLogs: ev.eventLogs.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  return (
    <TabSection title="Event" hint="OS event and file-log collection. Event-driven — no cadence.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.event} />
      <div className="tmpl-editor__inline-checks">
        <CheckRow label="IIS file log" checked={ev.fileLogIis} disabled={disabled} onChange={(c) => setEv({ fileLogIis: c })} />
        <CheckRow label="DHCP file log" checked={ev.fileLogDhcp} disabled={disabled} onChange={(c) => setEv({ fileLogDhcp: c })} />
      </div>
      <p className="tmpl-editor__hint">
        Event logs. Sysmon/DNS-analytical → type <code>Other</code> + channel. Include/exclude accept
        <code> ALL</code>, <code>NONE</code>, or a comma list of event ids.
      </p>
      {ev.eventLogs.map((r, idx) => (
        <div key={idx} className="tmpl-editor__grid-row">
          <input type="text" className="tmpl-editor__input" aria-label={`Event type ${idx + 1}`} placeholder="Security / Other" value={r.type} disabled={disabled} onChange={(e) => updateRow(idx, { type: e.target.value })} />
          <input type="text" className="tmpl-editor__input" aria-label={`Channel ${idx + 1}`} placeholder="channel (Other)" value={r.channel} disabled={disabled} onChange={(e) => updateRow(idx, { channel: e.target.value })} />
          <input type="text" className="tmpl-editor__input" aria-label={`Include ${idx + 1}`} placeholder="ALL / 4624,4625" value={r.include} disabled={disabled} onChange={(e) => updateRow(idx, { include: e.target.value })} />
          <input type="text" className="tmpl-editor__input" aria-label={`Exclude ${idx + 1}`} placeholder="NONE / 4634" value={r.exclude} disabled={disabled} onChange={(e) => updateRow(idx, { exclude: e.target.value })} />
          {!disabled && (
            <button type="button" className="tmpl-editor__text-btn tmpl-editor__text-btn--danger" onClick={() => setEv({ eventLogs: ev.eventLogs.filter((_, i) => i !== idx) })}>Remove</button>
          )}
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setEv({ eventLogs: [...ev.eventLogs, { type: '', channel: '', include: 'ALL', exclude: 'NONE' }] })}>
          Add event log
        </HaButton>
      )}
    </TabSection>
  );
}

// --- UEBA ------------------------------------------------------------------

export function UebaTab({ form, onChange, disabled }: TabProps): JSX.Element {
  return (
    <TabSection title="UEBA" hint="Kernel file/process behavioral telemetry.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.ueba} />
      <HaSwitch
        id="tmpl-ueba"
        label="Enable kernel behavioral telemetry"
        isChecked={form.ueba.enabled}
        isDisabled={disabled}
        onChange={(c) => onChange({ ...form, ueba: { enabled: c } })}
      />
    </TabSection>
  );
}

// --- User Log --------------------------------------------------------------

export function UserLogTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const rows = form.userLog;
  const setRows = (next: UserLogRow[]): void => onChange({ ...form, userLog: next });
  const update = (idx: number, patch: Partial<UserLogRow>): void =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  return (
    <TabSection title="User Log" hint="Tail arbitrary log files. Optional multiline framing.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.userLog} />
      {rows.map((r, idx) => (
        <div key={idx} className="tmpl-editor__stack-row">
          <div className="tmpl-editor__grid-row">
            <input type="text" className="tmpl-editor__input" aria-label={`File path ${idx + 1}`} placeholder="/var/log/app.log" value={r.fullFileName} disabled={disabled} onChange={(e) => update(idx, { fullFileName: e.target.value })} />
            <input type="text" className="tmpl-editor__input" aria-label={`Log prefix ${idx + 1}`} placeholder="prefix (optional)" value={r.logPrefix} disabled={disabled} onChange={(e) => update(idx, { logPrefix: e.target.value })} />
            {!disabled && (
              <button type="button" className="tmpl-editor__text-btn tmpl-editor__text-btn--danger" onClick={() => setRows(rows.filter((_, i) => i !== idx))}>Remove</button>
            )}
          </div>
          <div className="tmpl-editor__grid-row tmpl-editor__grid-row--sub">
            <input type="text" className="tmpl-editor__input" aria-label={`Multiline start ${idx + 1}`} placeholder="multiline start regex" value={r.multilineStart} disabled={disabled} onChange={(e) => update(idx, { multilineStart: e.target.value })} />
            <input type="text" className="tmpl-editor__input" aria-label={`Multiline end ${idx + 1}`} placeholder="multiline end regex" value={r.multilineEnd} disabled={disabled} onChange={(e) => update(idx, { multilineEnd: e.target.value })} />
            <input type="number" className="tmpl-editor__input tmpl-editor__input--num" aria-label={`Multiline max lines ${idx + 1}`} placeholder="max lines" min={1} max={10000} value={r.multilineMaxLines} disabled={disabled} onChange={(e) => update(idx, { multilineMaxLines: e.target.value })} />
          </div>
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setRows([...rows, { fullFileName: '', logPrefix: '', multilineStart: '', multilineEnd: '', multilineMaxLines: '' }])}>
          Add file
        </HaButton>
      )}
    </TabSection>
  );
}

// --- FIM (enforced) --------------------------------------------------------

export function FimTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const fim = form.fim;
  const setRules = (rules: typeof fim.rules): void => onChange({ ...form, fim: { ...fim, rules } });
  const update = (idx: number, patch: Partial<(typeof fim.rules)[number]>): void =>
    setRules(fim.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const parseExclude = (raw: string): string[] => raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  return (
    <TabSection title="FIM" hint="File Integrity Monitoring — enforced by the agent today.">
      <div className="tmpl-editor__field">
        <label htmlFor="tmpl-fim-mode">Apply mode</label>
        <select
          id="tmpl-fim-mode"
          className="tmpl-editor__input"
          disabled={disabled}
          value={fim.mode}
          onChange={(e) => onChange({ ...form, fim: { ...fim, mode: e.target.value === 'replace' ? 'replace' : 'merge' } })}
        >
          <option value="merge">merge (append to platform defaults)</option>
          <option value="replace">replace (policy rules only)</option>
        </select>
      </div>
      {fim.rules.map((rule, idx) => (
        <div key={idx} className="tmpl-editor__stack-row">
          <div className="tmpl-editor__list-row">
            <input type="text" className="tmpl-editor__input" aria-label={`Include path ${idx + 1}`} placeholder="/etc" value={rule.path} disabled={disabled} onChange={(e) => update(idx, { path: e.target.value })} />
            <label className="tmpl-editor__check">
              <input type="checkbox" checked={rule.recursive} disabled={disabled} onChange={(e) => update(idx, { recursive: e.target.checked })} />
              Recursive
            </label>
            {!disabled && (
              <button type="button" className="tmpl-editor__text-btn tmpl-editor__text-btn--danger" onClick={() => setRules(fim.rules.length > 1 ? fim.rules.filter((_, i) => i !== idx) : [{ path: '', recursive: true, exclude: [] }])}>Remove</button>
            )}
          </div>
          <input type="text" className="tmpl-editor__input" aria-label={`Exclude patterns ${idx + 1}`} placeholder="Exclude: *.tmp, *.log" value={(rule.exclude ?? []).join(', ')} disabled={disabled} onChange={(e) => update(idx, { exclude: parseExclude(e.target.value) })} />
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setRules([...fim.rules, { path: '', recursive: true, exclude: [] }])}>Add path</HaButton>
      )}
    </TabSection>
  );
}

// --- Change ----------------------------------------------------------------

export function ChangeTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const ch = form.change;
  const setRegistry = (registry: RegistryRootRow[]): void => onChange({ ...form, change: { ...ch, registry } });
  const update = (idx: number, patch: Partial<RegistryRootRow>): void =>
    setRegistry(ch.registry.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  return (
    <TabSection title="Change" hint="Registry root-key monitoring and installed-software inventory.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.change} />
      {ch.registry.map((r, idx) => (
        <div key={idx} className="tmpl-editor__stack-row">
          <div className="tmpl-editor__list-row">
            <input type="text" className="tmpl-editor__input tmpl-editor__input--mono" aria-label={`Registry root key ${idx + 1}`} placeholder="HKLM\\SOFTWARE" value={r.rootKey} disabled={disabled} onChange={(e) => update(idx, { rootKey: e.target.value })} />
            {!disabled && (
              <button type="button" className="tmpl-editor__text-btn tmpl-editor__text-btn--danger" onClick={() => setRegistry(ch.registry.filter((_, i) => i !== idx))}>Remove</button>
            )}
          </div>
          <input type="text" className="tmpl-editor__input" aria-label={`Exclude subkeys ${idx + 1}`} placeholder="Exclude subkeys: comma list" value={r.excludeSubkeys} disabled={disabled} onChange={(e) => update(idx, { excludeSubkeys: e.target.value })} />
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setRegistry([...ch.registry, { rootKey: '', excludeSubkeys: '' }])}>Add registry root</HaButton>
      )}
      <div className="tmpl-editor__inline-checks">
        <CheckRow label="Installed-software inventory" checked={ch.installedSoftware} disabled={disabled} onChange={(c) => onChange({ ...form, change: { ...ch, installedSoftware: c } })} />
      </div>
    </TabSection>
  );
}

// --- Script ----------------------------------------------------------------

export function ScriptTab({ form, onChange, disabled }: TabProps): JSX.Element {
  return (
    <TabSection title="Script" hint="WMI classes and PowerShell scripts to run for collection.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.script} />
      <div className="tmpl-editor__field">
        <label>WMI classes</label>
        <StringListEditor label="WMI class" values={form.script.wmi} placeholder="Win32_Process" disabled={disabled} monospace onChange={(wmi) => onChange({ ...form, script: { ...form.script, wmi } })} />
      </div>
      <div className="tmpl-editor__field">
        <label>PowerShell scripts</label>
        <StringListEditor label="PowerShell script" values={form.script.powershell} placeholder="Get-Service | ..." disabled={disabled} monospace onChange={(powershell) => onChange({ ...form, script: { ...form.script, powershell } })} />
      </div>
    </TabSection>
  );
}

// --- Certificate -----------------------------------------------------------

export function CertificateTab({ form, onChange, disabled }: TabProps): JSX.Element {
  const rows = form.certificate;
  const setRows = (next: CertificateStoreRow[]): void => onChange({ ...form, certificate: next });
  const update = (idx: number, patch: Partial<CertificateStoreRow>): void =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  return (
    <TabSection title="Certificate" hint="Per-store certificate lifecycle monitoring.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.certificate} />
      {rows.map((r, idx) => (
        <div key={idx} className="tmpl-editor__stack-row">
          <div className="tmpl-editor__list-row">
            <input type="text" className="tmpl-editor__input" aria-label={`Store ${idx + 1}`} placeholder="My / Root" value={r.store} disabled={disabled} onChange={(e) => update(idx, { store: e.target.value })} />
            {!disabled && (
              <button type="button" className="tmpl-editor__text-btn tmpl-editor__text-btn--danger" onClick={() => setRows(rows.filter((_, i) => i !== idx))}>Remove</button>
            )}
          </div>
          <div className="tmpl-editor__inline-checks">
            <CheckRow label="Add" checked={r.add} disabled={disabled} onChange={(c) => update(idx, { add: c })} />
            <CheckRow label="Delete" checked={r.delete} disabled={disabled} onChange={(c) => update(idx, { delete: c })} />
            <CheckRow label="Expiring" checked={r.expiring} disabled={disabled} onChange={(c) => update(idx, { expiring: c })} />
            <CheckRow label="Expired" checked={r.expired} disabled={disabled} onChange={(c) => update(idx, { expired: c })} />
          </div>
        </div>
      ))}
      {!disabled && (
        <HaButton variant="secondary" onClick={() => setRows([...rows, { store: '', add: false, delete: false, expiring: true, expired: true }])}>Add store</HaButton>
      )}
    </TabSection>
  );
}

// --- Osquery ---------------------------------------------------------------

export function OsqueryTab({ form, onChange, disabled }: TabProps): JSX.Element {
  return (
    <TabSection title="Osquery" hint="Attach named osqueries. Schedule is set on the osquery, not here.">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.osquery} />
      <StringListEditor label="Osquery name" values={form.osquery.queries} placeholder="named_query" disabled={disabled} onChange={(queries) => onChange({ ...form, osquery: { queries } })} />
    </TabSection>
  );
}

// --- Scans -----------------------------------------------------------------

function ScanSpecEditor({
  title,
  idPrefix,
  spec,
  disabled,
  onChange,
}: {
  title: string;
  idPrefix: string;
  spec: ScanSpecForm;
  disabled: boolean;
  onChange: (next: ScanSpecForm) => void;
}): JSX.Element {
  const set = <K extends keyof ScanSpecForm>(k: K, v: ScanSpecForm[K]): void => onChange({ ...spec, [k]: v });
  return (
    <fieldset className="tmpl-editor__fieldset" disabled={disabled}>
      <legend>{title}</legend>
      <HaSwitch id={`${idPrefix}-enabled`} label={`Enable ${title}`} isChecked={spec.enabled} isDisabled={disabled} onChange={(c) => set('enabled', c)} />
      {spec.enabled && (
        <div className="tmpl-editor__scan-body">
          <div className="tmpl-editor__field">
            <label htmlFor={`${idPrefix}-profile`}>Profile</label>
            <input id={`${idPrefix}-profile`} type="text" className="tmpl-editor__input tmpl-editor__input--mono" placeholder="CIS_Windows_2022_L1" value={spec.profile} disabled={disabled} onChange={(e) => set('profile', e.target.value)} />
          </div>
          <div className="tmpl-editor__row">
            <div className="tmpl-editor__field">
              <label htmlFor={`${idPrefix}-mode`}>Mode</label>
              <select id={`${idPrefix}-mode`} className="tmpl-editor__input" value={spec.mode} disabled={disabled} onChange={(e) => set('mode', e.target.value === 'realtime' ? 'realtime' : 'scheduled')}>
                <option value="scheduled">scheduled</option>
                <option value="realtime">realtime</option>
              </select>
            </div>
            <div className="tmpl-editor__field">
              <label htmlFor={`${idPrefix}-source`}>Source</label>
              <select id={`${idPrefix}-source`} className="tmpl-editor__input" value={spec.source} disabled={disabled} onChange={(e) => set('source', e.target.value === 'ingest' ? 'ingest' : 'agent')}>
                <option value="agent">agent — native scan (PT-5)</option>
                <option value="ingest" disabled>ingest — reserved, not built</option>
              </select>
            </div>
          </div>
          {spec.mode === 'scheduled' && (
            <div className="tmpl-editor__field">
              <label htmlFor={`${idPrefix}-cron`}>
                Cron or interval <span className="tmpl-editor__req">*</span>
              </label>
              <input id={`${idPrefix}-cron`} type="text" className="tmpl-editor__input tmpl-editor__input--mono" placeholder="0 3 * * * or PT24H" value={spec.cronOrInterval} disabled={disabled} onChange={(e) => set('cronOrInterval', e.target.value)} />
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function ScansTab({ form, onChange, disabled }: TabProps): JSX.Element {
  return (
    <TabSection title="Scans" hint="Native agent-run CIS and Vuln scanning cadence (beyond FortiSIEM parity).">
      <EnforcementNote enforcement={TAB_ENFORCEMENT.scans} />
      <ScanSpecEditor title="CIS benchmark" idPrefix="tmpl-cis" spec={form.scans.cis} disabled={disabled} onChange={(cis) => onChange({ ...form, scans: { ...form.scans, cis } })} />
      <ScanSpecEditor title="Vulnerability" idPrefix="tmpl-vuln" spec={form.scans.vuln} disabled={disabled} onChange={(vuln) => onChange({ ...form, scans: { ...form.scans, vuln } })} />
    </TabSection>
  );
}
