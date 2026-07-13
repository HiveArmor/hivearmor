"use client";

import { useEffect, useState } from "react";
import { X, Calendar } from "lucide-react";
import { reportService, ReportSchedule } from "@/services/report.service";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";

interface ComplianceConfig {
  id: number;
  configReportName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (schedule: ReportSchedule) => void;
}

const DAYS_OF_WEEK = [
  { label: "Sunday", cron: "0" },
  { label: "Monday", cron: "1" },
  { label: "Tuesday", cron: "2" },
  { label: "Wednesday", cron: "3" },
  { label: "Thursday", cron: "4" },
  { label: "Friday", cron: "5" },
  { label: "Saturday", cron: "6" },
];

/** Build a cron string from human-readable inputs. */
function buildCron(frequency: string, hour: number, minute: number, dowCron: string): string {
  switch (frequency) {
    case "DAILY":    return `${minute} ${hour} * * *`;
    case "WEEKLY":   return `${minute} ${hour} * * ${dowCron}`;
    case "MONTHLY":  return `${minute} ${hour} 1 * *`;
    case "QUARTERLY": return `${minute} ${hour} 1 */3 *`;
    default:         return `${minute} ${hour} * * *`;
  }
}

export function ReportScheduleModal({ open, onClose, onCreated }: Props) {
  const [configs, setConfigs] = useState<ComplianceConfig[]>([]);
  const [complianceId, setComplianceId] = useState<number | "">("");
  const [frequency, setFrequency] = useState("WEEKLY");
  const [dow, setDow] = useState("1"); // Monday
  const [time, setTime] = useState("06:00");
  const [saving, setSaving] = useState(false);

  // Load compliance report configs so user can pick one to schedule
  useEffect(() => {
    if (!open) return;
    api.get<ComplianceConfig[]>("/api/compliance/report-config?page=0&size=100")
      .then(data => setConfigs(Array.isArray(data) ? data : []))
      .catch(() => setConfigs([]));
  }, [open]);

  useEffect(() => {
    if (open) {
      setComplianceId("");
      setFrequency("WEEKLY");
      setDow("1");
      setTime("06:00");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (complianceId === "") return;
    setSaving(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const scheduleString = buildCron(frequency, h, m, dow);

      const created = await reportService.createSchedule({
        complianceId: complianceId as number,
        scheduleString,
        urlWithParams: `/api/ha-compliance-report-config`,
        lastExecutionTime: new Date().toISOString(),
      });
      toast("success", "Schedule created", "The report will run on the configured schedule.");
      onCreated(created);
      onClose();
    } catch (err) {
      toast("error", "Failed to create schedule", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center" style={{ pointerEvents: "none" }}>
      <div
        className="absolute inset-0 bg-surface-overlay animate-fade-in"
        style={{ pointerEvents: "all" }}
        onClick={onClose}
      />
      <div
        className="relative bg-surface-primary border border-surface-border rounded-xl shadow-elevated w-full max-w-md mx-4 animate-scale-in"
        style={{ pointerEvents: "all" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <h3 className="text-h3 text-primary font-semibold">Schedule Report</h3>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost w-7 h-7">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Compliance config selector */}
          <div className="space-y-1.5">
            <label className="text-small font-medium text-secondary">Compliance Report</label>
            {configs.length === 0 ? (
              <p className="text-tiny text-muted">No compliance report configs found. Configure them under Compliance → Frameworks first.</p>
            ) : (
              <select
                required
                value={complianceId}
                onChange={e => setComplianceId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full input text-small"
              >
                <option value="">Select a report…</option>
                {configs.map(c => (
                  <option key={c.id} value={c.id}>{c.configReportName ?? `Config #${c.id}`}</option>
                ))}
              </select>
            )}
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label className="text-small font-medium text-secondary">Frequency</label>
            <div className="flex gap-2 flex-wrap">
              {(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={
                    frequency === f
                      ? "px-3 py-1.5 rounded-md text-small bg-brand/10 text-brand font-medium"
                      : "px-3 py-1.5 rounded-md text-small text-muted hover:text-secondary hover:bg-surface-tertiary/50"
                  }
                >
                  {f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Day of week — only for weekly */}
          {frequency === "WEEKLY" && (
            <div className="space-y-1.5">
              <label className="text-small font-medium text-secondary">Day of Week</label>
              <select
                value={dow}
                onChange={e => setDow(e.target.value)}
                className="w-full input text-small"
              >
                {DAYS_OF_WEEK.map(d => (
                  <option key={d.cron} value={d.cron}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time */}
          <div className="space-y-1.5">
            <label className="text-small font-medium text-secondary">Time (UTC)</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full input text-small"
            />
          </div>

          {/* Cron preview */}
          <p className="text-tiny text-muted font-mono bg-surface-secondary px-2 py-1.5 rounded">
            cron: {(() => { const [h, m] = time.split(":").map(Number); return buildCron(frequency, h, m, dow); })()}
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
            <button type="button" onClick={onClose} className="btn-ghost text-small px-4 py-2">Cancel</button>
            <button
              type="submit"
              disabled={saving || complianceId === "" || configs.length === 0}
              className="btn-primary text-small px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
