"use client";

import { useEffect, useState, useCallback } from "react";
import {
  edrService,
  EdrEvent,
  EdrRule,
  EdrIsolation,
} from "@/services/edr.service";

type Tab = "events" | "rules" | "isolations";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-400/10 border-red-400/30",
  HIGH:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  MEDIUM:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  LOW:      "text-blue-400 bg-blue-400/10 border-blue-400/30",
  INFO:     "text-[var(--text-muted)] bg-[var(--surface-2)] border-[var(--border)]",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  PROCESS_CREATE: "Process",
  FILE_MODIFY:    "File",
  FILE_CREATE:    "File",
  FILE_DELETE:    "File",
  NETWORK_CONN:   "Network",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.INFO}`}>
      {severity}
    </span>
  );
}

// ---- Events Tab ----
function EventsTab() {
  const [events, setEvents] = useState<EdrEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [selected, setSelected] = useState<EdrEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await edrService.queryEvents({
        severity: filterSeverity || undefined,
        eventType: filterType || undefined,
        size: 100,
      });
      setEvents(res.data);
      setTotal(res.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full gap-4">
      {/* list */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="">All Severities</option>
            {["CRITICAL","HIGH","MEDIUM","LOW","INFO"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="">All Types</option>
            {["PROCESS_CREATE","FILE_CREATE","FILE_MODIFY","FILE_DELETE","NETWORK_CONN"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {total} events
          </span>
        </div>

        {loading ? (
          <div className="text-xs text-[var(--text-muted)] p-4">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] p-4">No events found.</div>
        ) : (
          <div className="overflow-y-auto flex flex-col gap-1">
            {events.map(e => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className={`text-left w-full px-3 py-2 rounded border transition-colors ${
                  selected?.id === e.id
                    ? "border-[var(--brand)] bg-[var(--brand)]/10"
                    : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={e.severity} />
                  <span className="text-xs text-[var(--text-muted)]">{EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}</span>
                  <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {e.processName ?? e.filePath ?? e.networkDstIp ?? e.eventType}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] ml-auto shrink-0">
                    {e.hostname ?? e.agentId}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {new Date(e.eventTime).toLocaleString()}
                  {e.processPid ? ` · PID ${e.processPid}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* detail */}
      {selected && (
        <div className="w-80 shrink-0 border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Event Detail</span>
            <button onClick={() => setSelected(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
          </div>
          <dl className="space-y-1.5 text-xs">
            {[
              ["Severity",  selected.severity],
              ["Type",      selected.eventType],
              ["Agent",     selected.agentId],
              ["Hostname",  selected.hostname],
              ["Time",      selected.eventTime ? new Date(selected.eventTime).toLocaleString() : ""],
              ["Process",   selected.processName],
              ["PID",       selected.processPid?.toString()],
              ["Path",      selected.processPath ?? selected.filePath],
              ["Cmdline",   selected.processCmdline],
              ["User",      selected.processUser],
              ["Hash",      selected.processHash ?? selected.fileHash],
              ["Net Src",   selected.networkSrcIp],
              ["Net Dst",   selected.networkDstIp],
              ["Port",      selected.networkDstPort?.toString()],
              ["Protocol",  selected.networkProto],
              ["Rule ID",   selected.matchedRuleId?.toString()],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-20 shrink-0 text-[var(--text-muted)]">{k}</dt>
                <dd className="text-[var(--text-primary)] break-all">{v}</dd>
              </div>
            ))}
          </dl>
          {selected.rawEvent && (
            <div className="mt-3">
              <div className="text-xs text-[var(--text-muted)] mb-1">Raw Event</div>
              <pre className="text-[10px] bg-[var(--surface-2)] rounded p-2 overflow-auto max-h-40 text-[var(--text-primary)]">
                {selected.rawEvent}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Rules Tab ----
function RulesTab() {
  const [rules, setRules] = useState<EdrRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<EdrRule> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [condErr, setCondErr] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRules(await edrService.listRules());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing({ eventType: "PROCESS_CREATE", platform: "ALL", severity: "MEDIUM", action: "ALERT", conditionJson: "{}", isActive: true });
    setIsNew(true);
    setCondErr(false);
  };

  const openEdit = (r: EdrRule) => {
    setEditing({ ...r });
    setIsNew(false);
    setCondErr(false);
  };

  const save = async () => {
    if (!editing) return;
    try { JSON.parse(editing.conditionJson ?? "{}"); } catch { setCondErr(true); return; }
    try {
      if (isNew) await edrService.createRule(editing);
      else if (editing.id) await edrService.updateRule(editing.id, editing);
      setEditing(null);
      load();
    } catch { /* ignore */ }
  };

  const doDelete = async (id: number) => {
    await edrService.deleteRule(id);
    setConfirmDelete(null);
    load();
  };

  const toggleActive = async (r: EdrRule) => {
    await edrService.updateRule(r.id, { isActive: !r.isActive });
    load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">{rules.length} rules</span>
        <button
          onClick={openCreate}
          className="text-xs px-3 py-1.5 rounded bg-[var(--brand)] text-black font-semibold hover:opacity-90"
        >+ New Rule</button>
      </div>

      {/* inline form */}
      {editing && (
        <div className="border border-[var(--brand)]/50 rounded-lg bg-[var(--surface-1)] p-4 space-y-3">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{isNew ? "New EDR Rule" : "Edit Rule"}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Name</div>
              <input
                value={editing.ruleName ?? ""}
                onChange={e => setEditing(p => ({ ...p, ruleName: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Event Type</div>
              <select
                value={editing.eventType ?? "PROCESS_CREATE"}
                onChange={e => setEditing(p => ({ ...p, eventType: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                {["PROCESS_CREATE","FILE_CREATE","FILE_MODIFY","FILE_DELETE","NETWORK_CONN"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Platform</div>
              <select
                value={editing.platform ?? "ALL"}
                onChange={e => setEditing(p => ({ ...p, platform: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                {["ALL","WINDOWS","LINUX","MACOS"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Action</div>
              <select
                value={editing.action ?? "ALERT"}
                onChange={e => setEditing(p => ({ ...p, action: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                {["ALERT","BLOCK","QUARANTINE","KILL_PROCESS","ISOLATE"].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Severity</div>
              <select
                value={editing.severity ?? "MEDIUM"}
                onChange={e => setEditing(p => ({ ...p, severity: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                {["CRITICAL","HIGH","MEDIUM","LOW","INFO"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">
              Condition JSON
              {condErr && <span className="ml-2 text-red-400">Invalid JSON</span>}
            </div>
            <textarea
              value={editing.conditionJson ?? "{}"}
              rows={4}
              onChange={e => {
                setEditing(p => ({ ...p, conditionJson: e.target.value }));
                setCondErr(false);
              }}
              className={`w-full font-mono bg-[var(--surface-2)] border rounded px-2 py-1 text-xs text-[var(--text-primary)] resize-none ${condErr ? "border-red-500" : "border-[var(--border)]"}`}
            />
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">Description</div>
            <input
              value={editing.description ?? ""}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
            <button onClick={save} className="text-xs px-3 py-1.5 rounded bg-[var(--brand)] text-black font-semibold hover:opacity-90">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-[var(--text-muted)] p-4">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)] p-4">No rules defined.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
            <div key={r.id} className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{r.ruleName}</span>
                  <SeverityBadge severity={r.severity} />
                  <span className="text-xs text-[var(--text-muted)]">{r.eventType}</span>
                  <span className="text-xs text-[var(--text-muted)]">·</span>
                  <span className="text-xs text-[var(--text-muted)]">{r.platform}</span>
                </div>
                {r.description && <div className="text-xs text-[var(--text-muted)] mt-0.5">{r.description}</div>}
                <div className="text-xs text-[var(--text-muted)] mt-0.5">Action: {r.action}</div>
              </div>
              <button
                onClick={() => toggleActive(r)}
                className={`text-xs px-2 py-1 rounded border font-semibold ${r.isActive ? "border-green-500/40 text-green-400" : "border-[var(--border)] text-[var(--text-muted)]"}`}
              >
                {r.isActive ? "Active" : "Inactive"}
              </button>
              <button onClick={() => openEdit(r)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2">Edit</button>
              {confirmDelete === r.id ? (
                <div className="flex gap-1">
                  <button onClick={() => doDelete(r.id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/40">Delete</button>
                  <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)]">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(r.id)} className="text-xs text-[var(--text-muted)] hover:text-red-400 px-2">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Isolations Tab ----
function IsolationsTab() {
  const [isolations, setIsolations] = useState<EdrIsolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ agentId: "", isolationType: "FULL", reason: "", allowedIps: "" });
  const [confirmLift, setConfirmLift] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await edrService.listIsolations(filterStatus || undefined);
      setIsolations(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.agentId) return;
    try {
      await edrService.isolateAgent({
        agentId: form.agentId,
        isolationType: form.isolationType,
        reason: form.reason || undefined,
        allowedIps: form.allowedIps || undefined,
      });
      setShowForm(false);
      setForm({ agentId: "", isolationType: "FULL", reason: "", allowedIps: "" });
      load();
    } catch { /* ignore */ }
  };

  const lift = async (id: number) => {
    await edrService.liftIsolation(id);
    setConfirmLift(null);
    load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="LIFTED">Lifted</option>
          <option value="FAILED">Failed</option>
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto text-xs px-3 py-1.5 rounded bg-red-500 text-white font-semibold hover:opacity-90"
        >Isolate Agent</button>
      </div>

      {showForm && (
        <div className="border border-red-500/40 rounded-lg bg-[var(--surface-1)] p-4 space-y-3">
          <div className="text-sm font-semibold text-red-400">Network Isolation</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Agent ID</div>
              <input
                value={form.agentId}
                onChange={e => setForm(p => ({ ...p, agentId: e.target.value }))}
                placeholder="Agent ID"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Type</div>
              <select
                value={form.isolationType}
                onChange={e => setForm(p => ({ ...p, isolationType: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                <option value="FULL">FULL</option>
                <option value="PARTIAL">PARTIAL</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Reason</div>
              <input
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Allowed IPs (comma-sep)</div>
              <input
                value={form.allowedIps}
                onChange={e => setForm(p => ({ ...p, allowedIps: e.target.value }))}
                placeholder="10.0.0.1,10.0.0.2"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded border border-[var(--border)] text-[var(--text-muted)]">Cancel</button>
            <button onClick={submit} className="text-xs px-3 py-1.5 rounded bg-red-500 text-white font-semibold hover:opacity-90">Apply Isolation</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-[var(--text-muted)] p-4">Loading…</div>
      ) : isolations.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)] p-4">No isolations found.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {isolations.map(iso => (
            <div key={iso.id} className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${
              iso.status === "ACTIVE" ? "border-red-500/40 bg-red-500/5" : "border-[var(--border)] bg-[var(--surface-1)]"
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{iso.agentId}</span>
                  {iso.hostname && <span className="text-xs text-[var(--text-muted)]">({iso.hostname})</span>}
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${
                    iso.status === "ACTIVE" ? "text-red-400 border-red-400/30 bg-red-400/10" : "text-green-400 border-green-400/30 bg-green-400/10"
                  }`}>{iso.status}</span>
                  <span className="text-xs text-[var(--text-muted)]">{iso.isolationType}</span>
                </div>
                {iso.reason && <div className="text-xs text-[var(--text-muted)] mt-0.5">{iso.reason}</div>}
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  Isolated: {new Date(iso.isolatedAt).toLocaleString()}
                  {iso.allowedIps && ` · Allowed: ${iso.allowedIps}`}
                  {` · By: ${iso.actionedBy}`}
                </div>
              </div>
              {iso.status === "ACTIVE" && (
                confirmLift === iso.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => lift(iso.id)} className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/40">Confirm Lift</button>
                    <button onClick={() => setConfirmLift(null)} className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)]">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmLift(iso.id)} className="text-xs px-3 py-1.5 rounded border border-green-500/40 text-green-400 hover:bg-green-500/10">Lift Isolation</button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function EdrPage() {
  const [tab, setTab] = useState<Tab>("events");

  const tabs: { key: Tab; label: string }[] = [
    { key: "events",     label: "Events" },
    { key: "rules",      label: "Rules" },
    { key: "isolations", label: "Isolations" },
  ];

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Endpoint Detection & Response</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Monitor endpoint events, manage detection rules, and control agent isolation</p>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "events"     && <EventsTab />}
        {tab === "rules"      && <RulesTab />}
        {tab === "isolations" && <IsolationsTab />}
      </div>
    </div>
  );
}
