"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, RefreshCw, CheckCircle2, XCircle, ExternalLink, AlertTriangle,
  Loader2, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { detectionService, type CorrelationRule } from "@/services/detection.service";

const ACCURACY_COLOR: Record<string, string> = {
  critical: "text-critical bg-critical/10 border-critical/20",
  high:     "text-warning  bg-warning/10  border-warning/20",
  medium:   "text-brand    bg-brand/10    border-brand/20",
  low:      "text-success  bg-success/10  border-success/20",
};

function AccuracyBadge({ level }: { level?: string }) {
  const key = (level ?? "medium").toLowerCase();
  return (
    <span className={cn("text-tiny font-medium px-2 py-0.5 rounded border capitalize", ACCURACY_COLOR[key] ?? ACCURACY_COLOR.medium)}>
      {key}
    </span>
  );
}

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export function SigmaReviewDrawer({ onClose, onChanged }: Props) {
  const [rules, setRules] = useState<CorrelationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await detectionService.getStagedRules();
      setRules(data);
    } catch {
      toast("error", "Failed to load staged rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async (rule: CorrelationRule) => {
    setWorking((prev) => new Set(prev).add(rule.id));
    try {
      await detectionService.activateStagedRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast("success", "Rule activated", rule.name);
      onChanged();
    } catch {
      toast("error", "Failed to activate rule");
    } finally {
      setWorking((prev) => { const s = new Set(prev); s.delete(rule.id); return s; });
    }
  };

  const handleDismiss = async (rule: CorrelationRule) => {
    setWorking((prev) => new Set(prev).add(rule.id));
    try {
      await detectionService.dismissStagedRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast("success", "Rule dismissed", rule.name);
      onChanged();
    } catch {
      toast("error", "Failed to dismiss rule");
    } finally {
      setWorking((prev) => { const s = new Set(prev); s.delete(rule.id); return s; });
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-[70] w-[560px] bg-surface-primary border-l border-surface-border shadow-drawer flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">Sigma Community Rules</p>
            {!loading && (
              <span className="text-tiny font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                {rules.length} pending review
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="btn btn-sm btn-secondary gap-1.5" disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
            <button onClick={onClose} className="btn btn-sm btn-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading staged rules…
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
              <CheckCircle2 className="w-8 h-8 text-success" />
              <p className="text-small">No rules pending review</p>
              <p className="text-tiny">All staged Sigma rules have been reviewed.</p>
            </div>
          ) : (
            rules.map((rule) => {
              const busy = working.has(rule.id);
              return (
                <div key={rule.id}
                  className="bg-surface-ground border border-surface-border rounded-lg p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-small font-semibold text-primary leading-tight">{rule.name}</p>
                    <AccuracyBadge level={rule.sigmaAccuracy} />
                  </div>

                  {rule.description && (
                    <p className="text-tiny text-secondary line-clamp-3">{rule.description}</p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    {rule.category && (
                      <span className="text-tiny text-muted flex items-center gap-1">
                        <Shield className="w-3 h-3" /> {rule.category}
                      </span>
                    )}
                    {rule.technique && rule.technique !== "T0000" && (
                      <span className="text-tiny text-muted flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {rule.technique}
                      </span>
                    )}
                    {rule.sigmaRuleUrl && (
                      <a href={rule.sigmaRuleUrl} target="_blank" rel="noopener noreferrer"
                        className="text-tiny text-brand flex items-center gap-1 hover:underline">
                        <ExternalLink className="w-3 h-3" /> View on GitHub
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleActivate(rule)}
                      disabled={busy}
                      className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Activate
                    </button>
                    <button
                      onClick={() => handleDismiss(rule)}
                      disabled={busy}
                      className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: bulk actions */}
        {rules.length > 1 && (
          <div className="px-4 py-3 border-t border-surface-border shrink-0 flex items-center justify-between">
            <span className="text-tiny text-muted">{rules.length} rules awaiting review</span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  for (const r of [...rules]) await handleActivate(r).catch(() => {});
                }}
                className="btn btn-sm btn-primary gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Activate All
              </button>
              <button
                onClick={async () => {
                  for (const r of [...rules]) await handleDismiss(r).catch(() => {});
                }}
                className="btn btn-sm btn-secondary gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Dismiss All
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
