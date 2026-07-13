"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key, Plus, Trash2, RefreshCw, Copy, Check, Terminal,
  X, AlertTriangle, Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { format } from "date-fns";
import {
  connectionKeysService,
  type ApiKeyRecord,
  type ApiKeyUpsert,
} from "@/services/connection-keys.service";

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return format(d, "MMM d, yyyy");
}

function isExpired(record: ApiKeyRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt) < new Date();
}

// ─── Modal primitive ─────────────────────────────────────────────────────────

function Modal({
  open, onClose, title, children, width = "max-w-lg",
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-10 w-full bg-surface-secondary border border-surface-border rounded-xl shadow-2xl", width)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="text-h4 text-primary font-semibold">{title}</h3>
          <button onClick={onClose} className="toolbar-btn w-7 h-7 flex items-center justify-center rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={cn("toolbar-btn p-1.5 rounded transition-colors", className)}
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── SecretField ─────────────────────────────────────────────────────────────

function SecretField({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <code className={cn(
        "text-tiny font-mono bg-surface-tertiary px-2 py-1 rounded select-all",
        !visible && "tracking-wider"
      )}>
        {visible ? value : "•".repeat(Math.min(value.length, 32))}
      </code>
      <button
        onClick={() => setVisible(v => !v)}
        className="toolbar-btn p-1 rounded"
        title={visible ? "Hide" : "Reveal"}
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <CopyButton text={value} />
    </div>
  );
}

// ─── AgentCommandBuilder ─────────────────────────────────────────────────────

type AgentOS = "linux" | "macos" | "windows";

const OS_TABS: { id: AgentOS; label: string; shell: string }[] = [
  { id: "linux",   label: "Linux",   shell: "bash" },
  { id: "macos",   label: "macOS",   shell: "bash" },
  { id: "windows", label: "Windows", shell: "PowerShell" },
];

function buildCommand(os: AgentOS, host: string, port: string, token: string): string {
  switch (os) {
    case "linux":
    case "macos":
      return `bash <(curl -s http://${host}:${port}/agent/install.sh) --token ${token}`;
    case "windows":
      return `$env:HA_TOKEN="${token}"; Invoke-Expression (Invoke-WebRequest -UseBasicParsing "http://${host}:${port}/agent/install.ps1").Content`;
  }
}

const OS_NOTE: Record<AgentOS, string> = {
  linux:   "Run as root on the target host.",
  macos:   "Run as root (sudo) on the target host.",
  windows: "Run in an elevated PowerShell session (Run as Administrator).",
};

function AgentCommandBuilder({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [os, setOs] = useState<AgentOS>("linux");
  const [host, setHost] = useState(
    typeof window !== "undefined" ? window.location.hostname : "your-siem-host"
  );
  const [port, setPort] = useState("8088");

  const cmd = buildCommand(os, host, port, token);

  return (
    <div className="mt-3 border border-surface-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-tertiary/40 hover:bg-surface-tertiary/70 transition-colors text-small"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2 text-secondary font-medium">
          <Terminal className="w-3.5 h-3.5 text-muted" />
          Agent Install Command
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3">
          {/* OS tabs */}
          <div className="flex items-center gap-1 p-1 bg-surface-primary border border-surface-border rounded-lg w-fit">
            {OS_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setOs(tab.id)}
                className={cn(
                  "px-3 py-1 rounded text-small font-medium transition-colors",
                  os === tab.id
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:text-secondary hover:bg-surface-tertiary"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Host / port */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-tiny text-muted mb-1 block">SIEM Host</label>
              <input
                value={host}
                onChange={e => setHost(e.target.value)}
                className="input-base w-full text-small font-mono"
                placeholder="your-siem-host"
              />
            </div>
            <div>
              <label className="text-tiny text-muted mb-1 block">Port</label>
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                className="input-base w-full text-small font-mono"
                placeholder="8088"
              />
            </div>
          </div>

          {/* Command block */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-tiny text-muted uppercase tracking-wider font-medium">
                {OS_TABS.find(t => t.id === os)?.shell}
              </span>
            </div>
            <div className="relative">
              <pre className="text-tiny font-mono bg-surface-primary border border-surface-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all text-secondary pr-10">
                {cmd}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={cmd} />
              </div>
            </div>
          </div>

          <p className="text-tiny text-muted">{OS_NOTE[os]} The token authenticates the agent with this HiveArmor instance.</p>
        </div>
      )}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function KeyStatusBadge({ record }: { record: ApiKeyRecord }) {
  if (!record.generatedAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium bg-surface-tertiary text-muted border border-surface-border">
        Not Generated
      </span>
    );
  }
  if (isExpired(record)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium bg-critical/10 text-critical border border-critical/20">
        <AlertTriangle className="w-3 h-3" /> Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium bg-success/10 text-success border border-success/20">
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      Active
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ConnectionKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ApiKeyUpsert>({ name: "" });
  const [creating, setCreating] = useState(false);

  // Newly-generated plain-text token (one-time display)
  const [newToken, setNewToken] = useState<{ keyId: number; token: string } | null>(null);

  // Regenerate confirm
  const [regenConfirm, setRegenConfirm] = useState<ApiKeyRecord | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<ApiKeyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await connectionKeysService.list();
      setKeys(result || []);
    } catch {
      toast("error", "Failed to load connection keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast("warning", "Key name is required");
      return;
    }
    setCreating(true);
    try {
      const created = await connectionKeysService.create(createForm);
      toast("success", "Key created", `Generating secret for "${created.name}"…`);

      // Immediately generate the actual secret
      const plain = await connectionKeysService.generate(created.id);
      setNewToken({ keyId: created.id, token: plain });
      setShowCreate(false);
      setCreateForm({ name: "" });
      load();
    } catch (e: unknown) {
      toast("error", "Failed to create key", e instanceof Error ? e.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  // ── Regenerate ──────────────────────────────────────────────────────────────
  const handleRegenerate = async () => {
    if (!regenConfirm) return;
    setRegenerating(true);
    try {
      const plain = await connectionKeysService.generate(regenConfirm.id);
      setNewToken({ keyId: regenConfirm.id, token: plain });
      setRegenConfirm(null);
      load();
    } catch (e: unknown) {
      toast("error", "Failed to regenerate key", e instanceof Error ? e.message : undefined);
    } finally {
      setRegenerating(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await connectionKeysService.delete(deleteConfirm.id);
      toast("success", "Key deleted", `"${deleteConfirm.name}" has been removed`);
      setDeleteConfirm(null);
      load();
    } catch (e: unknown) {
      toast("error", "Failed to delete key", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Connection Keys</h1>
          <p className="text-secondary text-small mt-0.5">
            API keys used to authenticate agents and federation services
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Generate New Key
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-brand/5 border border-brand/20 text-small text-secondary">
        <Key className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
        <span>
          Connection keys are included in agent install commands and federation service configurations.
          Keep them confidential — regenerate immediately if compromised.
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Key className="w-8 h-8" />}
            title="No connection keys"
            description="Generate your first key to start connecting agents"
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Generate New Key
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium hidden md:table-cell">Created</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium hidden lg:table-cell">Last Generated</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium hidden lg:table-cell">Expires</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                        <span className="text-body text-primary font-medium">{key.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <KeyStatusBadge record={key} />
                    </td>
                    <td className="px-4 py-3 text-small text-muted hidden md:table-cell">
                      {format(new Date(key.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-small text-muted hidden lg:table-cell">
                      {timeAgo(key.generatedAt)}
                    </td>
                    <td className="px-4 py-3 text-small hidden lg:table-cell">
                      {key.expiresAt ? (
                        <span className={isExpired(key) ? "text-critical" : "text-muted"}>
                          {format(new Date(key.expiresAt), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setRegenConfirm(key)}
                          className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-brand transition-colors"
                          title="Regenerate key"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(key)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                          title="Delete key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Key Modal ──────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateForm({ name: "" }); }} title="Generate New Connection Key">
        <div className="space-y-4">
          <div>
            <label className="text-small text-secondary font-medium block mb-1.5">Key Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Production Agent Key"
              className="input-base w-full"
              autoFocus
            />
            <p className="text-tiny text-muted mt-1">A descriptive name to identify where this key is used.</p>
          </div>
          <div>
            <label className="text-small text-secondary font-medium block mb-1.5">
              Allowed IPs <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={(createForm.allowedIp || []).join(", ")}
              onChange={e => {
                const raw = e.target.value;
                setCreateForm(p => ({
                  ...p,
                  allowedIp: raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : undefined,
                }));
              }}
              placeholder="192.168.1.0/24, 10.0.0.1"
              className="input-base w-full font-mono text-small"
            />
            <p className="text-tiny text-muted mt-1">Comma-separated IPs or CIDR ranges. Leave blank for no restriction.</p>
          </div>
          <div>
            <label className="text-small text-secondary font-medium block mb-1.5">
              Expiration <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={createForm.expiresAt ? createForm.expiresAt.slice(0, 16) : ""}
              onChange={e => setCreateForm(p => ({
                ...p,
                expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              }))}
              className="input-base w-full"
            />
            <p className="text-tiny text-muted mt-1">Leave blank for a non-expiring key.</p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleCreate}
              disabled={creating || !createForm.name.trim()}
              className="btn-primary flex-1 gap-2"
            >
              {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
              {creating ? "Generating…" : "Generate Key"}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateForm({ name: "" }); }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── New Token Display Modal ───────────────────────────────────────────── */}
      <Modal
        open={!!newToken}
        onClose={() => setNewToken(null)}
        title="Connection Key Generated"
        width="max-w-xl"
      >
        {newToken && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-warning/5 border border-warning/20 text-small text-secondary">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-primary">Copy this key now.</strong> For security, it will not be shown again.
                If you lose it, you can regenerate a new one.
              </span>
            </div>

            <div>
              <label className="text-tiny text-muted uppercase tracking-wider font-medium block mb-2">
                Your Connection Key
              </label>
              <SecretField value={newToken.token} />
            </div>

            <AgentCommandBuilder token={newToken.token} />

            <div className="flex items-center gap-2 pt-2">
              <button onClick={() => setNewToken(null)} className="btn-primary flex-1">
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Regenerate Confirm Modal ──────────────────────────────────────────── */}
      <Modal open={!!regenConfirm} onClose={() => setRegenConfirm(null)} title="Regenerate Connection Key">
        {regenConfirm && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-critical/5 border border-critical/20 text-small text-secondary">
              <AlertTriangle className="w-4 h-4 text-critical mt-0.5 flex-shrink-0" />
              <span>
                Regenerating <strong className="text-primary">&quot;{regenConfirm.name}&quot;</strong> will
                immediately invalidate the existing key. Any agents or services using the old key
                will stop authenticating until updated.
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="btn-primary flex-1 gap-2 bg-warning/80 hover:bg-warning border-warning/50"
              >
                {regenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {regenerating ? "Regenerating…" : "Yes, Regenerate"}
              </button>
              <button onClick={() => setRegenConfirm(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Connection Key">
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-small text-secondary">
              Are you sure you want to delete{" "}
              <strong className="text-primary">&quot;{deleteConfirm.name}&quot;</strong>?
              This action cannot be undone. Agents using this key will immediately lose access.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-primary flex-1 gap-2 bg-critical/80 hover:bg-critical border-critical/50"
              >
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? "Deleting…" : "Delete Key"}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
