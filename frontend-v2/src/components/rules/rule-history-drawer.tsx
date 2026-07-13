"use client";

import { useEffect, useState } from "react";
import { X, Clock, RotateCcw, GitBranch, Loader2, ChevronRight } from "lucide-react";
import { detectionService, type RuleVersion, type CorrelationRule } from "@/services/detection.service";
import { cn } from "@/lib/utils";

interface RuleHistoryDrawerProps {
  ruleId: number;
  ruleName: string;
  onClose: () => void;
  onRollback: (rule: CorrelationRule) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RuleHistoryDrawer({ ruleId, ruleName, onClose, onRollback }: RuleHistoryDrawerProps) {
  const [versions, setVersions] = useState<RuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    detectionService.getVersions(ruleId)
      .then(setVersions)
      .catch((err) => console.error("Failed to load versions:", err))
      .finally(() => setLoading(false));
  }, [ruleId]);

  const handleRollback = async (vNum: number) => {
    setRollingBack(vNum);
    try {
      const updated = await detectionService.rollback(ruleId, vNum);
      onRollback(updated);
      onClose();
    } catch (err) {
      console.error("Rollback failed:", err);
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[50]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[420px] z-[60] bg-surface-primary border-l border-surface-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center">
              <GitBranch className="w-3.5 h-3.5 text-brand" />
            </div>
            <div>
              <p className="text-small font-semibold text-primary">Version History</p>
              <p className="text-tiny text-muted truncate max-w-[260px]">{ruleName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-small text-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
            </div>
          ) : versions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-small text-muted text-center">
              <div>
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No version history yet.</p>
                <p className="text-tiny mt-1">Versions are saved when you update the rule.</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-surface-border" />

              <div className="space-y-1">
                {versions.map((v, idx) => (
                  <div key={v.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-[9px] top-3.5 w-3 h-3 rounded-full border-2",
                      idx === 0
                        ? "border-brand bg-brand"
                        : "border-surface-border bg-surface-secondary"
                    )} />

                    <div className={cn(
                      "rounded-lg border p-3 transition-colors",
                      expanded === v.versionNum
                        ? "border-brand/40 bg-brand-subtle"
                        : "border-surface-border bg-surface-secondary hover:border-surface-border-focus"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            "text-tiny font-bold px-1.5 py-0.5 rounded",
                            idx === 0 ? "bg-brand text-white" : "bg-surface-tertiary text-secondary"
                          )}>
                            v{v.versionNum}
                          </span>
                          {idx === 0 && (
                            <span className="text-tiny text-brand font-medium">Current</span>
                          )}
                        </div>
                        <button
                          onClick={() => setExpanded(expanded === v.versionNum ? null : v.versionNum)}
                          className="text-muted hover:text-secondary shrink-0"
                        >
                          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded === v.versionNum && "rotate-90")} />
                        </button>
                      </div>

                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-tiny text-muted">
                          <Clock className="w-3 h-3" /> {formatDate(v.changedAt)}
                        </span>
                        <span className="text-tiny text-secondary truncate">{v.changedBy}</span>
                      </div>

                      {v.changeNote && (
                        <p className="text-tiny text-muted mt-1 italic">{v.changeNote}</p>
                      )}

                      {expanded === v.versionNum && (
                        <div className="mt-2 pt-2 border-t border-surface-border">
                          <pre className="text-tiny text-muted font-mono bg-surface-tertiary rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                            {v.ruleSnapshot}
                          </pre>
                        </div>
                      )}

                      {idx > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => handleRollback(v.versionNum)}
                            disabled={rollingBack === v.versionNum}
                            className="btn btn-xs btn-secondary gap-1.5 disabled:opacity-50"
                          >
                            {rollingBack === v.versionNum
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Rolling back…</>
                              : <><RotateCcw className="w-3 h-3" /> Rollback to v{v.versionNum}</>
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
