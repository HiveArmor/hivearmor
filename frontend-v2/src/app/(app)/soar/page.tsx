"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Workflow, ExternalLink, Trash2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { playbookService, type SavedPlaybook } from "@/services/playbook.service";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

function formatRelative(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SoarPage() {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<SavedPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    playbookService.list()
      .then(setPlaybooks)
      .catch((err) => console.error("Failed to load playbooks:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await playbookService.delete(id);
      setPlaybooks((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete playbook:", err);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Playbooks</h1>
          <p className="text-secondary mt-1">Security Orchestration, Automation and Response</p>
        </div>
        <button
          onClick={() => router.push("/soar/flows")}
          className="btn btn-primary gap-2"
        >
          <Plus className="w-4 h-4" />
          New Playbook
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="card min-h-[60vh] flex items-center justify-center">
          <div className="text-small text-muted">Loading playbooks…</div>
        </div>
      ) : playbooks.length === 0 ? (
        <div className="card min-h-[60vh] flex items-center justify-center">
          <EmptyState
            icon={<Workflow className="w-6 h-6" />}
            title="No playbooks yet"
            description="Build your first automated response playbook"
            action={
              <button onClick={() => router.push("/soar/flows")} className="btn btn-primary gap-2">
                <Plus className="w-4 h-4" /> New Playbook
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-surface-border">
            {playbooks.map((pb) => (
              <div key={pb.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors group">
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Workflow className="w-4 h-4 text-brand" />
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-small font-semibold text-primary truncate">{pb.name}</p>
                    {pb.isActive ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-success/10 text-success">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-tertiary text-muted">
                        <AlertCircle className="w-2.5 h-2.5" /> Inactive
                      </span>
                    )}
                  </div>
                  {pb.description && (
                    <p className="text-tiny text-muted truncate mt-0.5">{pb.description}</p>
                  )}
                </div>

                {/* Last modified */}
                <div className="flex items-center gap-1 text-tiny text-muted shrink-0 hidden sm:flex">
                  <Clock className="w-3 h-3" />
                  {formatRelative(pb.lastModifiedDate ?? pb.createdDate)}
                </div>

                {/* Actions */}
                <div className={cn(
                  "flex items-center gap-1 shrink-0 transition-opacity",
                  confirmDeleteId === pb.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  {confirmDeleteId === pb.id ? (
                    <>
                      <span className="text-tiny text-muted mr-1">Delete?</span>
                      <button
                        onClick={() => handleDelete(pb.id)}
                        disabled={deletingId === pb.id}
                        className="btn btn-xs btn-danger"
                      >
                        {deletingId === pb.id ? "Deleting…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn btn-xs btn-secondary"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push(`/soar/flows?id=${pb.id}`)}
                        className="btn btn-xs btn-secondary gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Open
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(pb.id)}
                        className="btn btn-xs btn-ghost text-muted hover:text-critical"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
