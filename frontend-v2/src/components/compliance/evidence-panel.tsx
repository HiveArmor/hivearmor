"use client";

import { useState, useEffect } from "react";
import { Download, ExternalLink, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { complianceService, type ComplianceEvidenceRecord } from "@/services/compliance.service";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type EvidenceTab = "EVIDENCE" | "VIOLATION" | "ALL";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAPPING_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  EVIDENCE:  { bg: "bg-green-500/10",  text: "text-green-400",  icon: <ShieldCheck className="w-3 h-3" /> },
  VIOLATION: { bg: "bg-red-500/10",    text: "text-red-400",    icon: <ShieldAlert className="w-3 h-3" /> },
  INDICATOR: { bg: "bg-yellow-500/10", text: "text-yellow-400", icon: <ShieldQuestion className="w-3 h-3" /> },
};

function MappingBadge({ type }: { type: string }) {
  const s = MAPPING_STYLES[type] ?? { bg: "bg-surface-tertiary", text: "text-muted", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium", s.bg, s.text)}>
      {s.icon}
      {type.charAt(0) + type.slice(1).toLowerCase()}
    </span>
  );
}

function fmtTs(ts: string) {
  try {
    return format(new Date(ts), "MMM dd HH:mm:ss");
  } catch {
    return ts;
  }
}

// ── Evidence panel ─────────────────────────────────────────────────────────────

interface EvidencePanelProps {
  controlId: number;
  days?: number;
}

export function ComplianceEvidencePanel({ controlId, days = 30 }: EvidencePanelProps) {
  const [records, setRecords] = useState<ComplianceEvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("ALL");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    complianceService
      .getControlEvidence(controlId, { size: 50, days })
      .then((data) => setRecords(data ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [controlId, days]);

  const filtered =
    activeTab === "ALL"
      ? records
      : records.filter((r) => r.mappingType === activeTab);

  const evidenceCount = records.filter((r) => r.mappingType === "EVIDENCE").length;
  const violationCount = records.filter((r) => r.mappingType === "VIOLATION").length;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = complianceService.buildEvidenceExportUrl(controlId, days);
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `evidence-control-${controlId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-tiny font-semibold text-secondary uppercase tracking-wider">Evidence</span>
          <span className="text-tiny text-muted">last {days} days</span>
          {!loading && (
            <div className="flex items-center gap-2">
              {evidenceCount > 0 && (
                <span className="text-tiny text-green-400">{evidenceCount} evidence</span>
              )}
              {violationCount > 0 && (
                <span className="text-tiny text-red-400">{violationCount} violations</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || records.length === 0}
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
          title="Export evidence as CSV"
        >
          <Download className={cn("w-3 h-3", downloading && "animate-pulse")} />
          Export CSV
        </button>
      </div>

      {/* Tab chips */}
      <div className="flex items-center gap-1">
        {(["ALL", "EVIDENCE", "VIOLATION"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-2.5 py-1 rounded-full text-tiny border transition-colors",
              activeTab === tab
                ? tab === "EVIDENCE"
                  ? "bg-green-500/15 text-green-400 border-green-500/25"
                  : tab === "VIOLATION"
                  ? "bg-red-500/15 text-red-400 border-red-500/25"
                  : "bg-brand-subtle text-brand border-brand/25"
                : "text-muted border-surface-border hover:bg-surface-tertiary"
            )}
          >
            {tab === "ALL" ? `All (${records.length})` : tab === "EVIDENCE" ? `Evidence (${evidenceCount})` : `Violations (${violationCount})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-small">Loading evidence…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <ShieldQuestion className="w-6 h-6 text-muted" />
          <p className="text-small text-muted">
            {records.length === 0
              ? "No evidence records in the last " + days + " days"
              : "No records for this filter"}
          </p>
        </div>
      ) : (
        <div className="border border-surface-border rounded-lg overflow-hidden">
          <table className="w-full text-tiny">
            <thead>
              <tr className="border-b border-surface-border bg-surface-secondary">
                {["Timestamp", "Type", "Source", "Summary", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-muted font-medium uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr
                  key={rec.evidenceId}
                  className="border-b border-surface-border/60 last:border-0 hover:bg-surface-tertiary/40 transition-colors"
                >
                  <td className="px-3 py-2 text-muted whitespace-nowrap font-mono">
                    {rec.timestamp ? fmtTs(rec.timestamp) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <MappingBadge type={rec.mappingType} />
                  </td>
                  <td className="px-3 py-2 text-secondary whitespace-nowrap">
                    {rec.eventSource ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-secondary max-w-[220px]">
                    <span className="block truncate" title={rec.eventSummary ?? undefined}>
                      {rec.eventSummary ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {rec.eventId && (
                      <a
                        href={`/logs?eventId=${encodeURIComponent(rec.eventId)}`}
                        className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition-colors"
                        title="View in Logs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Logs</span>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
