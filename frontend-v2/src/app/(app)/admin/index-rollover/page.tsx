"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { indexRolloverService, RolloverPolicy } from "@/services/index-rollover.service";

const DURATION_REGEX = /^\d+(s|m|h|d|w)$/i;

function validate(deleteAfter: string): string | null {
  if (!deleteAfter.trim()) return "Retention period is required.";
  if (!DURATION_REGEX.test(deleteAfter.trim()))
    return 'Must be a duration like "30d", "90d", "1w".';
  return null;
}

export default function IndexRolloverPage() {
  const [policy, setPolicy] = useState<RolloverPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isError, setIsError] = useState(false);

  // form state
  const [snapshotActive, setSnapshotActive] = useState(false);
  const [deleteAfter, setDeleteAfter] = useState("30d");
  const [deleteAfterError, setDeleteAfterError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setIsError(false);
    try {
      const data = await indexRolloverService.get();
      setPolicy(data);
      setSnapshotActive(data.snapshotActive);
      setDeleteAfter(data.deleteAfter ?? "30d");
    } catch {
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty =
    policy !== null &&
    (snapshotActive !== policy.snapshotActive || deleteAfter !== policy.deleteAfter);

  async function handleSave() {
    const err = validate(deleteAfter);
    setDeleteAfterError(err);
    if (err) return;

    setSaving(true);
    try {
      await indexRolloverService.update({ snapshotActive, deleteAfter: deleteAfter.trim() });
      setPolicy({ snapshotActive, deleteAfter: deleteAfter.trim() });
      toast("success", "Rollover policy saved.");
    } catch {
      toast("error", "Failed to save rollover policy.");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="p-8 flex items-center gap-2 text-critical text-small">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        Failed to load rollover policy. Is the backend and OpenSearch running?
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-h2 text-primary font-semibold flex items-center gap-2">
          <ArchiveRestore className="w-5 h-5 text-brand" />
          Index Rollover
        </h1>
        <p className="text-small text-muted mt-1">
          Configure when OpenSearch indices are rolled over and how long data is retained.
          This applies to the{" "}
          <code className="text-tiny bg-surface-tertiary px-1 py-0.5 rounded font-mono">
            hivearmor_ism_policy
          </code>.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-surface-tertiary text-small text-secondary">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
        Changes take effect at the next ISM policy evaluation (usually within 5 minutes).
        Existing indices are not retroactively affected.
      </div>

      {loading ? (
        <div className="space-y-5">
          {[180, 240, 180].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div
                className="h-3 rounded bg-surface-tertiary animate-pulse"
                style={{ width: w }}
              />
              <div className="h-9 rounded bg-surface-tertiary animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Snapshot toggle */}
          <div className="card p-4 space-y-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-small font-medium text-primary">Enable Snapshots Before Delete</p>
                <p className="text-tiny text-muted mt-0.5">
                  Take a snapshot of each index before it is deleted. Requires the{" "}
                  <code className="font-mono">hivearmor_backups</code> repository to be registered.
                </p>
              </div>
              {/* Toggle */}
              <button
                role="switch"
                aria-checked={snapshotActive}
                onClick={() => setSnapshotActive((v) => !v)}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-brand/50",
                  snapshotActive ? "bg-brand" : "bg-surface-tertiary"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                    snapshotActive ? "left-5" : "left-0.5"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Delete after */}
          <div className="space-y-1.5">
            <label className="text-small font-medium text-secondary" htmlFor="deleteAfter">
              Delete Index After
            </label>
            <input
              id="deleteAfter"
              className={cn(
                "input-base w-full max-w-xs font-mono",
                deleteAfterError && "border-critical focus:ring-critical/50"
              )}
              value={deleteAfter}
              onChange={(e) => {
                setDeleteAfter(e.target.value);
                if (deleteAfterError) setDeleteAfterError(validate(e.target.value));
              }}
              placeholder="30d"
            />
            {deleteAfterError ? (
              <p className="text-tiny text-critical">{deleteAfterError}</p>
            ) : (
              <p className="text-tiny text-muted">
                Retention period. e.g. <code className="font-mono">30d</code>,{" "}
                <code className="font-mono">90d</code>, <code className="font-mono">1w</code>.
                Older indices are deleted automatically.
              </p>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Rollover Policy"}
          </button>
        </div>
      )}
    </div>
  );
}
