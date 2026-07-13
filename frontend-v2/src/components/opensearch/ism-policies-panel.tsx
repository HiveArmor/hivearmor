"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Shield, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { opensearchService, type IsmPolicy } from "@/services/opensearch-management.service";
import { cn } from "@/lib/utils";

export function IsmPoliciesPanel() {
  const [policies, setPolicies]   = useState<IsmPolicy[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await opensearchService.listIsmPolicies();
      setPolicies(res?.policies ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <Shield className="w-4 h-4 text-brand" />
        <p className="text-small font-semibold text-primary flex-1">ISM Policies</p>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
        <span className="text-tiny text-muted">{policies.length} policies</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && policies.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading ISM policies…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-warning">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : policies.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-small text-muted">No ISM policies found.</div>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => (
              <div key={p._id} className="card overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors text-left"
                  onClick={() => setExpanded(expanded === p._id ? null : p._id)}
                >
                  <ChevronRight className={cn("w-3.5 h-3.5 text-muted transition-transform", expanded === p._id && "rotate-90")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-medium text-primary">{p._id}</p>
                    <p className="text-tiny text-muted">{p.policy?.description ?? "No description"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-tiny text-muted">Default: <span className="text-secondary font-medium">{p.policy?.default_state}</span></span>
                    <span className="text-tiny bg-surface-tertiary text-secondary px-2 py-0.5 rounded">
                      {Array.isArray(p.policy?.states) ? p.policy.states.length : 0} states
                    </span>
                  </div>
                </button>
                {expanded === p._id && (
                  <div className="border-t border-surface-border bg-surface-secondary px-4 py-3">
                    <pre className="text-tiny font-mono text-muted overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                      {JSON.stringify(p.policy, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
