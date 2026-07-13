"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { edrService, EdrEvent, EdrQuarantine, EdrIsolation } from "@/services/edr.service";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-yellow-500",
  LOW:      "bg-blue-500",
  INFO:     "bg-slate-500",
};

function TimelineDot({ severity }: { severity: string }) {
  return <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${SEVERITY_COLORS[severity] ?? "bg-slate-500"}`} />;
}

export default function EdrAgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = Array.isArray(params.agentId) ? params.agentId[0] : params.agentId as string;

  const [events, setEvents] = useState<EdrEvent[]>([]);
  const [quarantine, setQuarantine] = useState<EdrQuarantine[]>([]);
  const [isolation, setIsolation] = useState<EdrIsolation | null>(null);
  const [loading, setLoading] = useState(true);
  const [killForm, setKillForm] = useState<{ pid: string; name: string } | null>(null);
  const [killResult, setKillResult] = useState("");
  const [liftConfirm, setLiftConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evtRes, qRes, isoRes] = await Promise.all([
        edrService.queryEvents({ agentId, size: 200 }),
        edrService.listQuarantine(agentId),
        edrService.listIsolations("ACTIVE"),
      ]);
      setEvents(evtRes.data);
      setQuarantine(qRes.data);
      const active = isoRes.data.find(i => i.agentId === agentId) ?? null;
      setIsolation(active);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [agentId]);

  useEffect(() => { if (agentId) load(); }, [agentId, load]);

  const doKill = async () => {
    if (!killForm) return;
    const pid = parseInt(killForm.pid, 10);
    if (isNaN(pid)) return;
    try {
      const res = await edrService.killProcess(agentId, pid, killForm.name);
      setKillResult(res.result);
      setKillForm(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setKillResult(e?.message ?? "Error");
    }
  };

  const doRestore = async (id: number) => {
    await edrService.restoreFile(id);
    load();
  };

  const doLiftIsolation = async () => {
    if (!isolation) return;
    await edrService.liftIsolation(isolation.id);
    setLiftConfirm(false);
    load();
  };

  const doIsolate = async () => {
    await edrService.isolateAgent({ agentId, isolationType: "FULL", reason: "Manual isolation" });
    load();
  };

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-muted)]">Loading…</div>;
  }

  // Summary counts
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{agentId}</h1>
          <p className="text-xs text-[var(--text-muted)]">EDR Agent Detail</p>
        </div>

        {/* isolation control */}
        <div className="ml-auto flex items-center gap-2">
          {isolation ? (
            <>
              <span className="text-xs font-semibold px-2 py-1 rounded border border-red-400/40 text-red-400 bg-red-400/10">
                ISOLATED ({isolation.isolationType})
              </span>
              {liftConfirm ? (
                <>
                  <button onClick={doLiftIsolation} className="text-xs px-3 py-1.5 rounded bg-green-500 text-white font-semibold">Confirm Lift</button>
                  <button onClick={() => setLiftConfirm(false)} className="text-xs px-2 py-1.5 rounded border border-[var(--border)] text-[var(--text-muted)]">Cancel</button>
                </>
              ) : (
                <button onClick={() => setLiftConfirm(true)} className="text-xs px-3 py-1.5 rounded border border-green-500/40 text-green-400 hover:bg-green-500/10">Lift Isolation</button>
              )}
            </>
          ) : (
            <button onClick={doIsolate} className="text-xs px-3 py-1.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10">Isolate Agent</button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        {["CRITICAL","HIGH","MEDIUM","LOW","INFO"].map(sev => (
          <div key={sev} className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-3">
            <div className="text-xs text-[var(--text-muted)]">{sev}</div>
            <div className={`text-2xl font-bold mt-1 ${
              sev === "CRITICAL" ? "text-red-400" :
              sev === "HIGH"     ? "text-orange-400" :
              sev === "MEDIUM"   ? "text-yellow-400" :
              sev === "LOW"      ? "text-blue-400" :
              "text-[var(--text-muted)]"
            }`}>{counts[sev] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Kill process action */}
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Response Actions</span>
          <button
            onClick={() => { setKillForm({ pid: "", name: "" }); setKillResult(""); }}
            className="text-xs px-3 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--brand)]"
          >Kill Process</button>
        </div>
        {killForm && (
          <div className="flex items-end gap-2 mt-2">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">PID</div>
              <input
                value={killForm.pid}
                onChange={e => setKillForm(p => p ? { ...p, pid: e.target.value } : null)}
                className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
                placeholder="1234"
              />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Process Name (optional)</div>
              <input
                value={killForm.name}
                onChange={e => setKillForm(p => p ? { ...p, name: e.target.value } : null)}
                className="w-40 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
                placeholder="evil.exe"
              />
            </div>
            <button onClick={doKill} className="text-xs px-3 py-1.5 rounded bg-red-500 text-white font-semibold hover:opacity-90">Send Kill</button>
            <button onClick={() => setKillForm(null)} className="text-xs px-2 py-1.5 rounded border border-[var(--border)] text-[var(--text-muted)]">Cancel</button>
          </div>
        )}
        {killResult && (
          <div className="mt-2 text-xs text-green-400 bg-green-400/10 rounded px-2 py-1 border border-green-400/20">{killResult}</div>
        )}
      </div>

      {/* Quarantine */}
      {quarantine.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-4">
          <div className="text-sm font-semibold text-[var(--text-primary)] mb-3">Quarantined Files ({quarantine.length})</div>
          <div className="flex flex-col gap-2">
            {quarantine.map(q => (
              <div key={q.id} className="flex items-center gap-3 text-xs">
                <span className={`px-1.5 py-0.5 rounded border font-semibold ${
                  q.status === "QUARANTINED" ? "text-orange-400 border-orange-400/30 bg-orange-400/10" : "text-green-400 border-green-400/30 bg-green-400/10"
                }`}>{q.status}</span>
                <span className="text-[var(--text-primary)] font-mono truncate flex-1">{q.filePath}</span>
                <span className="text-[var(--text-muted)]">{new Date(q.quarantinedAt).toLocaleString()}</span>
                {q.status === "QUARANTINED" && (
                  <button onClick={() => doRestore(q.id)} className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Restore</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event timeline */}
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-1)] p-4 flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Event Timeline ({events.length})
        </div>
        {events.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)]">No events recorded for this agent.</div>
        ) : (
          <div className="relative pl-4 border-l border-[var(--border)] flex flex-col gap-3 overflow-y-auto max-h-[500px]">
            {events.map(e => (
              <div key={e.id} className="flex gap-3 items-start -ml-[9px]">
                <TimelineDot severity={e.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {e.processName ?? e.filePath ?? e.networkDstIp ?? e.eventType}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{e.eventType}</span>
                    {e.processPid && <span className="text-[11px] text-[var(--text-muted)]">PID {e.processPid}</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {new Date(e.eventTime).toLocaleString()}
                    {e.processCmdline && <span className="ml-2 font-mono truncate max-w-xs">{e.processCmdline}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
