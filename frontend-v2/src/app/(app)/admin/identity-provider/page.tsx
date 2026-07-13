"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, TestTube2, AlertCircle, Loader2,
  KeyRound, Copy, CheckCircle, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  identityProviderService,
  PROVIDER_TYPE_LABELS,
  type IdentityProvider,
  type IdentityProviderFormData,
  type ProviderType,
} from "@/services/identity-provider.service";

// ── Constants ──────────────────────────────────────────────────────────────

const PROVIDER_TYPES: ProviderType[] = ["GOOGLE", "KEYCLOAK", "OKTA", "MICROSOFT"];

// ── SP identifier helpers ──────────────────────────────────────────────────

function buildSpIdentifiers(providerType: ProviderType): { spEntityId: string; spAcsUrl: string } {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    spEntityId: `${origin}/saml/sp`,
    spAcsUrl:   `${origin}/login/saml2/sso/${providerType.toLowerCase()}`,
  };
}

// ── Copy-to-clipboard button ───────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-sm btn-secondary p-1.5"
      title="Copy to clipboard"
    >
      {copied ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Provider form ──────────────────────────────────────────────────────────

interface ProviderFormProps {
  initial?: IdentityProvider;
  takenTypes: ProviderType[];
  onSave: (data: IdentityProviderFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function ProviderForm({ initial, takenTypes, onSave, onCancel, saving }: ProviderFormProps) {
  const isEdit = !!initial?.id;

  const [name, setName]               = useState(initial?.name ?? "");
  const [providerType, setProviderType] = useState<ProviderType>(initial?.providerType ?? "GOOGLE");
  const [metadataUrl, setMetadataUrl] = useState(initial?.metadataUrl ?? "");
  const [active, setActive]           = useState(initial?.active ?? true);
  const [spEntityId, setSpEntityId]   = useState(initial?.spEntityId ?? "");
  const [spAcsUrl, setSpAcsUrl]       = useState(initial?.spAcsUrl ?? "");
  const [keyFileName, setKeyFileName] = useState("");
  const [certFileName, setCertFileName] = useState("");
  const [errors, setErrors]           = useState<Record<string, string>>({});

  const keyRef  = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  // Auto-generate SP identifiers when provider type changes (create mode only)
  useEffect(() => {
    if (!isEdit) {
      const ids = buildSpIdentifiers(providerType);
      setSpEntityId(ids.spEntityId);
      setSpAcsUrl(ids.spAcsUrl);
    }
  }, [providerType, isEdit]);

  // On mount (create mode), generate from default type
  useEffect(() => {
    if (!isEdit) {
      const ids = buildSpIdentifiers(providerType);
      setSpEntityId(ids.spEntityId);
      setSpAcsUrl(ids.spAcsUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 3) errs.name = "Name is required (minimum 3 characters)";
    if (!metadataUrl.trim() || !/^https?:\/\/.+/.test(metadataUrl)) errs.metadataUrl = "Valid HTTP(S) URL is required";
    if (!isEdit && !keyRef.current?.files?.[0])  errs.spPrivateKeyFile  = "Private key file is required";
    if (!isEdit && !certRef.current?.files?.[0]) errs.spCertificateFile = "Certificate file is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      name: name.trim(),
      providerType,
      metadataUrl: metadataUrl.trim(),
      spEntityId,
      spAcsUrl,
      active,
      spPrivateKeyFile:  keyRef.current?.files?.[0],
      spCertificateFile: certRef.current?.files?.[0],
    });
  }

  const availableTypes = isEdit
    ? [initial!.providerType]
    : PROVIDER_TYPES.filter(t => !takenTypes.includes(t));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="card p-5 space-y-4">
        <h2 className="text-small font-semibold text-secondary uppercase tracking-wide">
          Basic Information
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">
              Provider Name <span className="text-critical">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Company Okta"
              className={cn("input-base w-full text-small", errors.name && "border-critical/50")}
            />
            {errors.name && <p className="text-tiny text-critical mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">
              Provider Type <span className="text-critical">*</span>
            </label>
            {isEdit ? (
              <input
                value={PROVIDER_TYPE_LABELS[initial!.providerType]}
                readOnly
                className="input-base w-full text-small opacity-70 cursor-not-allowed"
              />
            ) : (
              <select
                value={providerType}
                onChange={e => setProviderType(e.target.value as ProviderType)}
                className="input-base w-full text-small"
              >
                {availableTypes.map(t => (
                  <option key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</option>
                ))}
              </select>
            )}
            {isEdit && (
              <p className="text-tiny text-muted mt-1">Provider type cannot be changed after creation</p>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="card p-5 space-y-4">
        <h2 className="text-small font-semibold text-secondary uppercase tracking-wide">
          SAML Metadata
        </h2>
        <p className="text-tiny text-muted -mt-2">
          Provide your IdP&apos;s metadata URL. It will be fetched to extract signing certificates and endpoints.
        </p>

        <div>
          <label className="text-tiny font-medium text-secondary mb-1 block">
            Metadata URL <span className="text-critical">*</span>
          </label>
          <input
            type="url"
            value={metadataUrl}
            onChange={e => setMetadataUrl(e.target.value)}
            placeholder="https://your-idp.com/metadata.xml"
            className={cn("input-base w-full text-small", errors.metadataUrl && "border-critical/50")}
          />
          {errors.metadataUrl && <p className="text-tiny text-critical mt-1">{errors.metadataUrl}</p>}
          <div className="mt-2 space-y-0.5">
            <p className="text-tiny text-muted">Examples:</p>
            <p className="text-tiny text-muted">• Okta: <code className="font-mono bg-surface-tertiary px-1 rounded">https://your-org.okta.com/app/exkXXX/sso/saml/metadata</code></p>
            <p className="text-tiny text-muted">• Keycloak: <code className="font-mono bg-surface-tertiary px-1 rounded">https://keycloak.example.com/realms/REALM/protocol/saml/descriptor</code></p>
          </div>
        </div>
      </div>

      {/* SP Certificates */}
      <div className="card p-5 space-y-4">
        <h2 className="text-small font-semibold text-secondary uppercase tracking-wide">
          Service Provider Certificates
        </h2>
        <div className="p-3 rounded-lg border border-brand/20 bg-brand/5 text-tiny text-secondary space-y-1">
          <p className="font-medium text-brand">Generate an RSA key pair if you don&apos;t have one:</p>
          <code className="block font-mono text-micro text-muted">openssl genrsa -out private.pem 2048</code>
          <code className="block font-mono text-micro text-muted">openssl req -new -x509 -key private.pem -out certificate.pem -days 365</code>
        </div>

        {isEdit && (
          <div className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-tiny text-warning">
            Private key is already configured. Upload a new file only to replace it.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">
              SP Private Key (.pem / .key) {!isEdit && <span className="text-critical">*</span>}
            </label>
            <input
              ref={keyRef}
              type="file"
              accept=".pem,.key,.txt"
              onChange={e => setKeyFileName(e.target.files?.[0]?.name ?? "")}
              className={cn("input-base w-full text-tiny", errors.spPrivateKeyFile && "border-critical/50")}
            />
            {keyFileName && <p className="text-tiny text-success mt-1">{keyFileName}</p>}
            {errors.spPrivateKeyFile && <p className="text-tiny text-critical mt-1">{errors.spPrivateKeyFile}</p>}
          </div>

          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">
              SP Certificate (.pem / .crt) {!isEdit && <span className="text-critical">*</span>}
            </label>
            <input
              ref={certRef}
              type="file"
              accept=".pem,.crt,.cer,.txt"
              onChange={e => setCertFileName(e.target.files?.[0]?.name ?? "")}
              className={cn("input-base w-full text-tiny", errors.spCertificateFile && "border-critical/50")}
            />
            {certFileName && <p className="text-tiny text-success mt-1">{certFileName}</p>}
            {errors.spCertificateFile && <p className="text-tiny text-critical mt-1">{errors.spCertificateFile}</p>}
          </div>
        </div>
      </div>

      {/* SP configuration info for admin to copy into IdP */}
      <div className="card p-5 space-y-4">
        <h2 className="text-small font-semibold text-secondary uppercase tracking-wide">
          Service Provider Configuration
        </h2>
        <p className="text-tiny text-muted -mt-2">
          Copy these values into your Identity Provider&apos;s SAML configuration.
        </p>
        <div className="p-3 rounded-lg border border-critical/20 bg-critical/5 text-tiny text-critical font-medium">
          Configure these values in your IdP before users can log in.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Entity ID (SP Audience URI)</label>
            <div className="flex items-center gap-2">
              <input value={spEntityId} readOnly className="input-base flex-1 text-small font-mono opacity-80" />
              <CopyButton value={spEntityId} />
            </div>
          </div>
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Assertion Consumer Service (ACS) URL</label>
            <div className="flex items-center gap-2">
              <input value={spAcsUrl} readOnly className="input-base flex-1 text-small font-mono opacity-80" />
              <CopyButton value={spAcsUrl} />
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="card p-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            role="switch"
            aria-checked={active}
            onClick={() => setActive(v => !v)}
            className={cn(
              "w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer",
              active ? "bg-brand" : "bg-surface-border",
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white shadow transition-transform",
              active ? "translate-x-4" : "translate-x-0",
            )} />
          </div>
          <span className="text-small text-secondary">
            {active ? "Provider enabled" : "Provider disabled"}
          </span>
        </label>
        <p className="text-tiny text-muted mt-1 ml-12">
          Users can only authenticate via this provider when it is enabled.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {saving ? "Saving…" : (isEdit ? "Save Changes" : "Create Provider")}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-sm btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

type Mode = "list" | "create" | "edit";

export default function IdentityProviderPage() {
  const [providers, setProviders]     = useState<IdentityProvider[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [mode, setMode]               = useState<Mode>("list");
  const [editing, setEditing]         = useState<IdentityProvider | null>(null);
  const [saving, setSaving]           = useState(false);
  const [testingId, setTestingId]     = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean | null>>({});
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setProviders(await identityProviderService.list());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const takenTypes = providers.map(p => p.providerType);

  async function handleSave(data: IdentityProviderFormData) {
    setSaving(true);
    try {
      if (mode === "create") {
        await identityProviderService.create(data);
        toast("success", "Identity provider created.");
      } else if (editing?.id !== undefined) {
        await identityProviderService.update(editing.id, data);
        toast("success", "Identity provider updated.");
      }
      await load();
      setMode("list");
      setEditing(null);
    } catch (err: unknown) {
      toast("error", "Save failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(p: IdentityProvider) {
    if (!p.id) return;
    setTestingId(p.id);
    setTestResults(r => ({ ...r, [p.id!]: null }));
    try {
      const res = await identityProviderService.testConnection(p);
      setTestResults(r => ({ ...r, [p.id!]: res.success }));
      if (res.success) toast("success", "Connection test passed.");
      else toast("error", "Connection test failed", res.message);
    } catch {
      setTestResults(r => ({ ...r, [p.id!]: false }));
      toast("error", "Connection test could not be reached.");
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(p: IdentityProvider) {
    if (!p.id) return;
    if (!confirm(`Delete "${p.name}"? Users signed in via this provider will be logged out on their next request.`)) return;
    setDeletingId(p.id);
    try {
      await identityProviderService.delete(p.id);
      toast("success", "Identity provider deleted.");
      await load();
    } catch {
      toast("error", "Failed to delete provider.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Form view ──────────────────────────────────────────────────────────────

  if (mode === "create" || mode === "edit") {
    return (
      <div className="space-y-5 max-w-2xl">
        <div>
          <h1 className="text-h1">{mode === "create" ? "Add Identity Provider" : "Edit Identity Provider"}</h1>
          <p className="text-secondary text-small mt-0.5">
            Configure a SAML 2.0 identity provider for SSO.
          </p>
        </div>
        <ProviderForm
          initial={editing ?? undefined}
          takenTypes={takenTypes}
          onSave={handleSave}
          onCancel={() => { setMode("list"); setEditing(null); }}
          saving={saving}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Identity Providers</h1>
          <p className="text-secondary text-small mt-0.5">
            Configure SAML 2.0 providers for SSO. Each provider type can only be registered once.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setMode("create"); }}
          disabled={takenTypes.length >= PROVIDER_TYPES.length}
          className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
          title={takenTypes.length >= PROVIDER_TYPES.length ? "All provider types already configured" : undefined}
        >
          <Plus className="w-3.5 h-3.5" /> Add Provider
        </button>
      </div>

      {error && (
        <div className="card p-4 flex items-center gap-2 text-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-small">Failed to load identity providers.</span>
          <button onClick={load} className="ml-auto btn btn-sm btn-secondary">Retry</button>
        </div>
      )}

      <div className="card overflow-hidden divide-y divide-surface-border">
        {loading ? (
          <div className="py-12 text-center text-small text-muted">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
          </div>
        ) : providers.length === 0 ? (
          <div className="py-12 text-center text-small text-muted">
            <KeyRound className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No identity providers configured. Click &ldquo;Add Provider&rdquo; to start.
          </div>
        ) : (
          providers.map(p => {
            const tested = p.id !== undefined ? testResults[p.id] : undefined;
            return (
              <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand/10 text-brand shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-small font-semibold text-primary">{p.name}</span>
                    <span className="text-micro text-muted uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-tertiary">
                      {PROVIDER_TYPE_LABELS[p.providerType]}
                    </span>
                    <span className={cn(
                      "text-micro px-1.5 py-0.5 rounded",
                      p.active
                        ? "bg-success/10 text-success"
                        : "bg-surface-tertiary text-muted",
                    )}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {tested !== undefined && tested !== null && (
                    <div className={cn(
                      "flex items-center gap-1 text-tiny mt-0.5",
                      tested ? "text-success" : "text-critical",
                    )}>
                      {tested
                        ? <CheckCircle className="w-3 h-3" />
                        : <XCircle    className="w-3 h-3" />
                      }
                      {tested ? "Connection test passed" : "Connection test failed"}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTest(p)}
                    disabled={testingId === p.id}
                    className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50"
                  >
                    {testingId === p.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <TestTube2 className="w-3.5 h-3.5" />
                    }
                    Test
                  </button>
                  <button
                    onClick={() => { setEditing(p); setMode("edit"); }}
                    className="btn btn-sm btn-secondary gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    className="btn btn-sm gap-1.5 text-critical border border-critical/20 bg-critical/5 hover:bg-critical/15 disabled:opacity-50"
                  >
                    {deletingId === p.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2  className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
