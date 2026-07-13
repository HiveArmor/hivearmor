"use client";

import { useState, useRef } from "react";
import {
  Settings,
  Bell,
  Key,
  Palette,
  Server,
  Clock,
  Calendar,
  Save,
  Mail,
  MessageSquare,
  Smartphone,
  Webhook,
  AlertTriangle,
  Plus,
  X,
  Copy,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Shield,
  Cpu,
  Zap,
  Activity,
  Check,
  ChevronRight,
  Info,
  Lock,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "general" | "notifications" | "apikeys" | "appearance" | "system";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string;
  expires: string;
  permissions: string[];
}

interface HealthCheck {
  component: string;
  status: "healthy" | "degraded" | "offline";
  lastCheck: string;
  latency: number | null;
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_API_KEYS: ApiKey[] = [
  {
    id: "1",
    name: "SOC Automation",
    prefix: "as_k1a2b3",
    created: "2025-11-15",
    lastUsed: "2026-07-04",
    expires: "2026-12-31",
    permissions: ["read", "write"],
  },
  {
    id: "2",
    name: "SOAR Integration",
    prefix: "as_m7n8p9",
    created: "2025-09-01",
    lastUsed: "2026-07-03",
    expires: "2027-01-01",
    permissions: ["read"],
  },
  {
    id: "3",
    name: "External Dashboard",
    prefix: "as_q2r3s4",
    created: "2026-01-20",
    lastUsed: "2026-06-28",
    expires: "2026-09-30",
    permissions: ["read", "admin"],
  },
];

const DEMO_HEALTH: HealthCheck[] = [
  { component: "Backend API", status: "healthy", lastCheck: "2s ago", latency: 4 },
  { component: "OpenSearch", status: "healthy", lastCheck: "5s ago", latency: 12 },
  { component: "PostgreSQL", status: "healthy", lastCheck: "5s ago", latency: 2 },
  { component: "Message Queue", status: "degraded", lastCheck: "8s ago", latency: 143 },
  { component: "Cache (Redis)", status: "healthy", lastCheck: "3s ago", latency: 1 },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const ACCENT_COLORS = [
  { id: "blue",   label: "Blue",   value: "#3B82F6" },
  { id: "purple", label: "Purple", value: "#8B5CF6" },
  { id: "cyan",   label: "Cyan",   value: "#06B6D4" },
  { id: "green",  label: "Green",  value: "#10B981" },
  { id: "orange", label: "Orange", value: "#F59E0B" },
  { id: "red",    label: "Red",    value: "#EF4444" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-h2">{title}</h2>
      <p className="text-secondary text-small mt-1">{description}</p>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 py-4 border-b border-surface-border last:border-0">
      <div className="sm:w-52 shrink-0">
        <p className="text-primary text-small font-medium">{label}</p>
        {hint && <p className="text-muted text-tiny mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function PillToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        checked ? "bg-brand-primary" : "bg-surface-tertiary"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end pt-6 mt-2 border-t border-surface-border">
      <button
        onClick={onSave}
        disabled={saving}
        className="btn btn-primary"
      >
        {saving ? (
          <>
            <RefreshCw size={14} className="animate-spin mr-2" />
            Saving…
          </>
        ) : (
          <>
            <Save size={14} className="mr-2" />
            Save Changes
          </>
        )}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: HealthCheck["status"] }) {
  const map = {
    healthy:  { label: "Healthy",  cls: "text-success bg-success/10" },
    degraded: { label: "Degraded", cls: "text-warning bg-warning/10" },
    offline:  { label: "Offline",  cls: "text-critical bg-critical/10" },
  };
  const { label, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-tiny font-medium", cls)}>
      <span
        className={cn("w-1.5 h-1.5 rounded-full", {
          "bg-[--color-success]": status === "healthy",
          "bg-[--color-warning]": status === "degraded",
          "bg-[--color-critical]": status === "offline",
        })}
      />
      {label}
    </span>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function GeneralSection() {
  const [org, setOrg] = useState("HiveArmor Security Operations");
  const [tz, setTz] = useState("UTC");
  const [dtFormat, setDtFormat] = useState("YYYY-MM-DD HH:mm:ss");
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [logRetention, setLogRetention] = useState(90);
  const [alertsPerPage, setAlertsPerPage] = useState("50");
  const [saving, setSaving] = useState(false);

  const retentionOptions = [30, 60, 90, 180, 365];
  const retentionIdx = retentionOptions.indexOf(logRetention);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    toast("success", "General settings saved", "Configuration updated successfully.");
  };

  return (
    <div>
      <SectionHeader title="General" description="Organization-level configuration and defaults." />

      <div className="card p-6">
        <FieldRow label="Organization Name" hint="Displayed in reports and notifications.">
          <input
            className="input-base w-full max-w-md"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
          />
        </FieldRow>

        <FieldRow label="Timezone" hint="Used for log timestamps and scheduled reports.">
          <select
            className="input-base w-full max-w-xs"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Date / Time Format" hint="Applied across the UI and exported data.">
          <select
            className="input-base w-full max-w-xs"
            value={dtFormat}
            onChange={(e) => setDtFormat(e.target.value)}
          >
            <option value="YYYY-MM-DD HH:mm:ss">YYYY-MM-DD HH:mm:ss (ISO)</option>
            <option value="MM/DD/YYYY hh:mm A">MM/DD/YYYY hh:mm A (US)</option>
            <option value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm (EU)</option>
            <option value="relative">Relative (e.g. &ldquo;5 min ago&rdquo;)</option>
          </select>
        </FieldRow>

        <FieldRow label="Session Timeout" hint="Idle minutes before automatic sign-out.">
          <div className="flex items-center gap-3">
            <input
              type="number"
              className="input-base w-28"
              min={5}
              max={1440}
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(Number(e.target.value))}
            />
            <span className="text-muted text-small">minutes</span>
          </div>
        </FieldRow>

        <FieldRow
          label="Log Retention"
          hint="How long raw logs are kept in storage."
        >
          <div className="space-y-3 max-w-sm">
            <div className="flex justify-between text-tiny text-muted">
              {retentionOptions.map((d) => (
                <span
                  key={d}
                  className={cn("cursor-pointer transition-colors", d === logRetention && "text-brand font-semibold")}
                  onClick={() => setLogRetention(d)}
                >
                  {d}d
                </span>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={retentionOptions.length - 1}
              step={1}
              value={retentionIdx === -1 ? 0 : retentionIdx}
              onChange={(e) => setLogRetention(retentionOptions[Number(e.target.value)])}
              className="w-full accent-[--brand-primary] cursor-pointer"
            />
            <p className="text-small text-primary font-medium">
              {logRetention} days
            </p>
          </div>
        </FieldRow>

        <FieldRow label="Max Alerts Per Page" hint="Default page size in the Alerts view.">
          <select
            className="input-base w-32"
            value={alertsPerPage}
            onChange={(e) => setAlertsPerPage(e.target.value)}
          >
            {["25", "50", "100", "200"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </FieldRow>

        <SaveBar onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [email, setEmail] = useState(true);
  const [slack, setSlack] = useState(true);
  const [pagerduty, setPagerduty] = useState(false);
  const [sms, setSms] = useState(false);
  const [webhook, setWebhook] = useState(true);
  const [threshold, setThreshold] = useState<"critical" | "high" | "medium" | "all">("high");
  const [recipients, setRecipients] = useState(["soc-team@example.com", "ciso@example.com"]);
  const [newRecipient, setNewRecipient] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("https://hooks.example.com/siem/alerts");
  const [saving, setSaving] = useState(false);

  const addRecipient = () => {
    const v = newRecipient.trim();
    if (v && !recipients.includes(v)) {
      setRecipients((r) => [...r, v]);
      setNewRecipient("");
    }
  };

  const handleTest = async () => {
    toast("info", "Test notification sent", "Check your configured channels.");
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    toast("success", "Notification settings saved");
  };

  const thresholdOptions = [
    { id: "critical", label: "Critical only" },
    { id: "high",     label: "High+" },
    { id: "medium",   label: "Medium+" },
    { id: "all",      label: "All severities" },
  ] as const;

  const channels = [
    { key: "email",     label: "Email Alerts",     icon: <Mail size={15} />,           value: email,     set: setEmail },
    { key: "slack",     label: "Slack",             icon: <MessageSquare size={15} />,  value: slack,     set: setSlack },
    { key: "pagerduty", label: "PagerDuty",         icon: <AlertTriangle size={15} />,  value: pagerduty, set: setPagerduty },
    { key: "sms",       label: "SMS",               icon: <Smartphone size={15} />,     value: sms,       set: setSms },
    { key: "webhook",   label: "Webhook",           icon: <Webhook size={15} />,        value: webhook,   set: setWebhook },
  ] as const;

  return (
    <div>
      <SectionHeader title="Notifications" description="Alert delivery channels and escalation thresholds." />

      <div className="card p-6">
        <FieldRow label="Channels" hint="Enable or disable delivery methods.">
          <div className="space-y-3">
            {channels.map(({ key, label, icon, value, set }) => (
              <div key={key} className="flex items-center justify-between max-w-xs">
                <div className="flex items-center gap-2 text-primary text-small">
                  <span className="text-muted">{icon}</span>
                  {label}
                </div>
                <PillToggle checked={value} onChange={set} />
              </div>
            ))}
          </div>
        </FieldRow>

        <FieldRow label="Severity Threshold" hint="Only send notifications at or above this level.">
          <div className="flex flex-wrap gap-2">
            {thresholdOptions.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setThreshold(id)}
                className={cn(
                  "btn btn-sm",
                  threshold === id ? "btn-primary" : "btn-secondary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </FieldRow>

        {email && (
          <FieldRow label="Email Recipients" hint="Add recipient email addresses.">
            <div className="space-y-3 max-w-md">
              <div className="flex flex-wrap gap-2">
                {recipients.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-tiny bg-surface-tertiary border border-surface-border text-primary"
                  >
                    {r}
                    <button
                      onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))}
                      className="text-muted hover:text-critical transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input-base flex-1"
                  placeholder="analyst@company.com"
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                />
                <button onClick={addRecipient} className="btn btn-secondary btn-sm">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </FieldRow>
        )}

        {webhook && (
          <FieldRow label="Webhook URL" hint="POST payload sent for each matching alert.">
            <input
              className="input-base w-full max-w-md font-mono text-small"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/…"
            />
          </FieldRow>
        )}

        <div className="flex items-center justify-between pt-6 mt-2 border-t border-surface-border">
          <button onClick={handleTest} className="btn btn-secondary btn-sm">
            <Zap size={13} className="mr-1.5" />
            Test Notification
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? (
              <><RefreshCw size={14} className="animate-spin mr-2" />Saving…</>
            ) : (
              <><Save size={14} className="mr-2" />Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>(DEMO_API_KEYS);
  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("2027-01-01");
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>(["read"]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const togglePerm = (p: string) =>
    setNewKeyPerms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );

  const generateKey = () => {
    const raw = "as_" + Array.from({ length: 40 }, () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
    ).join("");
    const entry: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName || "New Key",
      prefix: raw.slice(0, 8),
      created: new Date().toISOString().slice(0, 10),
      lastUsed: "Never",
      expires: newKeyExpiry,
      permissions: newKeyPerms,
    };
    setKeys((prev) => [entry, ...prev]);
    setGeneratedKey(raw);
  };

  const copyKey = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast("success", "Copied to clipboard");
  };

  const revokeKey = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setRevokeId(null);
    toast("info", "API key revoked", "The key can no longer be used to authenticate.");
  };

  const closeModal = () => {
    setShowModal(false);
    setGeneratedKey(null);
    setNewKeyName("");
    setNewKeyPerms(["read"]);
    setNewKeyExpiry("2027-01-01");
  };

  return (
    <div>
      <SectionHeader title="API Keys" description="Manage programmatic access credentials." />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <p className="text-primary text-small font-medium">{keys.length} active key{keys.length !== 1 ? "s" : ""}</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
            <Plus size={14} className="mr-1.5" />
            Generate New Key
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="siem-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Permissions</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Expires</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="font-medium text-primary">{k.name}</td>
                  <td>
                    <span className="code-block">{k.prefix}••••••••••••</span>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {k.permissions.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded text-tiny bg-surface-tertiary border border-surface-border text-muted capitalize">
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-secondary text-small">{k.created}</td>
                  <td className="text-secondary text-small">{k.lastUsed}</td>
                  <td className="text-secondary text-small">{k.expires}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="toolbar-btn"
                        title="Copy prefix"
                        onClick={() => copyKey(k.prefix + "••••••••", k.id)}
                      >
                        {copiedId === k.id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                      </button>
                      {revokeId === k.id ? (
                        <>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => revokeKey(k.id)}
                          >
                            Revoke
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setRevokeId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="toolbar-btn text-critical hover:bg-critical/10"
                          title="Revoke key"
                          onClick={() => setRevokeId(k.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.length === 0 && (
            <div className="py-12 text-center text-muted text-small">
              No API keys. Generate one to get started.
            </div>
          )}
        </div>
      </div>

      {/* Generate Key Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--surface-overlay)" }}>
          <div className="card w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-h3">Generate API Key</h3>
              <button onClick={closeModal} className="toolbar-btn">
                <X size={16} />
              </button>
            </div>

            {!generatedKey ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-small text-secondary mb-1.5">Key Name</label>
                  <input
                    className="input-base w-full"
                    placeholder="e.g. CI/CD Pipeline"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-small text-secondary mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    className="input-base w-full"
                    value={newKeyExpiry}
                    onChange={(e) => setNewKeyExpiry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-small text-secondary mb-2">Permissions</label>
                  <div className="flex gap-2">
                    {["read", "write", "admin"].map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePerm(p)}
                        className={cn(
                          "btn btn-sm capitalize",
                          newKeyPerms.includes(p) ? "btn-primary" : "btn-secondary"
                        )}
                      >
                        {newKeyPerms.includes(p) && <Check size={12} className="mr-1" />}
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button
                    onClick={generateKey}
                    disabled={!newKeyName.trim() || newKeyPerms.length === 0}
                    className="btn btn-primary"
                  >
                    <Key size={14} className="mr-1.5" />
                    Generate
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10 border border-warning/30">
                  <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                  <p className="text-small text-warning">
                    <strong>This key is shown only once.</strong> Copy it now and store it securely. You cannot retrieve it again.
                  </p>
                </div>
                <div>
                  <label className="block text-small text-secondary mb-1.5">Your new API key</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="input-base flex-1 font-mono text-small text-brand"
                      value={generatedKey}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyKey(generatedKey, "modal")}
                    >
                      {copiedId === "modal" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={closeModal} className="btn btn-primary">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [accent, setAccent] = useState("blue");
  const [sidebar, setSidebar] = useState<"collapsed" | "full">("full");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [saving, setSaving] = useState(false);

  const accentColor = ACCENT_COLORS.find((c) => c.id === accent)?.value ?? "#3B82F6";

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    toast("success", "Appearance saved", "Reload may be needed for full effect.");
  };

  return (
    <div>
      <SectionHeader title="Appearance" description="Customize the look and feel of the interface." />

      <div className="card p-6">
        <FieldRow label="Theme" hint="Controls the overall color scheme.">
          <div className="flex rounded-lg border border-surface-border overflow-hidden w-fit">
            {(["dark", "light", "system"] as const).map((t, i) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "px-4 py-2 text-small font-medium capitalize transition-colors",
                  i > 0 && "border-l border-surface-border",
                  theme === t
                    ? "bg-brand-primary text-white"
                    : "text-secondary hover:text-primary hover:bg-surface-tertiary"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </FieldRow>

        <FieldRow label="Accent Color" hint="Used for active states, buttons, and highlights.">
          <div className="flex items-center gap-3">
            {ACCENT_COLORS.map(({ id, label, value }) => (
              <button
                key={id}
                title={label}
                onClick={() => setAccent(id)}
                className={cn(
                  "w-8 h-8 rounded-full border-2 transition-all",
                  accent === id
                    ? "border-white scale-110 shadow-lg"
                    : "border-transparent hover:scale-105"
                )}
                style={{ background: value }}
              />
            ))}
            <span className="text-muted text-small capitalize ml-2">{accent}</span>
          </div>
        </FieldRow>

        <FieldRow label="Sidebar Style" hint="How the navigation sidebar is displayed.">
          <div className="flex flex-col gap-2">
            {[
              { id: "full",      label: "Full labels",    desc: "Show icon and text for each item" },
              { id: "collapsed", label: "Collapsed icons", desc: "Icon only, labels on hover" },
            ].map(({ id, label, desc }) => (
              <label
                key={id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                  sidebar === id
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-surface-border hover:border-surface-border-strong"
                )}
              >
                <input
                  type="radio"
                  name="sidebar"
                  value={id}
                  checked={sidebar === id}
                  onChange={() => setSidebar(id as "collapsed" | "full")}
                  className="accent-[--brand-primary]"
                />
                <div>
                  <p className="text-small font-medium text-primary">{label}</p>
                  <p className="text-tiny text-muted">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </FieldRow>

        <FieldRow label="Density" hint="Controls spacing and element sizes.">
          <div className="flex gap-2">
            {(["compact", "comfortable", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={cn(
                  "btn btn-sm capitalize",
                  density === d ? "btn-primary" : "btn-secondary"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </FieldRow>

        {/* Preview */}
        <div className="mt-6 pt-6 border-t border-surface-border">
          <p className="text-small text-secondary mb-3 font-medium">Preview</p>
          <div
            className="rounded-lg border border-surface-border overflow-hidden"
            style={{ height: 140 }}
          >
            {/* Mock shell */}
            <div className="flex h-full">
              {/* Mock sidebar */}
              <div
                className="h-full border-r border-surface-border flex flex-col gap-1 py-2"
                style={{
                  width: sidebar === "full" ? 120 : 40,
                  background: "var(--surface-secondary)",
                  transition: "width 0.2s",
                }}
              >
                {["Dashboard", "Alerts", "Rules"].map((item) => (
                  <div
                    key={item}
                    className={cn(
                      "flex items-center gap-2 mx-1 rounded px-2 cursor-pointer",
                      density === "compact" ? "py-0.5" : density === "spacious" ? "py-2" : "py-1"
                    )}
                    style={item === "Alerts" ? { background: accentColor + "22", color: accentColor } : {}}
                  >
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: item === "Alerts" ? accentColor : "var(--surface-border-strong)" }}
                    />
                    {sidebar === "full" && (
                      <span style={{ fontSize: 9, color: item === "Alerts" ? accentColor : "var(--text-muted)" }}>
                        {item}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {/* Mock content */}
              <div className="flex-1 p-2" style={{ background: "var(--surface-primary)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-2.5 w-16 rounded" style={{ background: "var(--surface-tertiary)" }} />
                  <div
                    className="h-5 w-14 rounded text-center"
                    style={{ background: accentColor, fontSize: 8, color: "#fff", lineHeight: "20px" }}
                  >
                    New Alert
                  </div>
                </div>
                <div className="space-y-1">
                  {[80, 60, 90].map((w, i) => (
                    <div
                      key={i}
                      className="h-2 rounded"
                      style={{ width: `${w}%`, background: "var(--surface-tertiary)" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <SaveBar onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}

function SystemSection() {
  const [health, setHealth] = useState<HealthCheck[]>(DEMO_HEALTH);
  const [refreshing, setRefreshing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refreshHealth = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1200));
    // Simulate slight latency variance
    setHealth((prev) =>
      prev.map((h) => ({
        ...h,
        latency: h.latency !== null ? h.latency + Math.floor(Math.random() * 10 - 5) : null,
        lastCheck: "just now",
      }))
    );
    setRefreshing(false);
    toast("success", "Health checks refreshed");
  };

  const handleClearCache = async () => {
    setClearing(true);
    await new Promise((r) => setTimeout(r, 1400));
    setClearing(false);
    setClearConfirm(false);
    toast("success", "Cache cleared", "All in-memory caches have been flushed.");
  };

  const handleExportLogs = () => {
    toast("info", "Log export started", "You will receive a download link shortly.");
  };

  const handleExportConfig = () => {
    const config = {
      version: "11.2.0",
      exported: new Date().toISOString(),
      settings: { org: "HiveArmor Security Operations", tz: "UTC" },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hivearmor-config.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("success", "Config exported");
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        JSON.parse(reader.result as string);
        toast("success", "Config imported", `Loaded from ${file.name}`);
      } catch {
        toast("error", "Invalid file", "The selected file is not valid JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const systemInfo = [
    { label: "Version",        value: "11.2.0",              icon: <Shield size={14} /> },
    { label: "Build Date",     value: "2026-06-30",          icon: <Calendar size={14} /> },
    { label: "License Type",   value: "Enterprise",          icon: <Lock size={14} /> },
    { label: "License Expiry", value: "2027-01-01",          icon: <Clock size={14} /> },
    { label: "Active Nodes",   value: "3",                   icon: <Cpu size={14} /> },
    { label: "Uptime",         value: "14d 07h 22m",         icon: <Activity size={14} /> },
  ];

  return (
    <div>
      <SectionHeader title="System" description="Runtime information, health status, and maintenance actions." />

      {/* System Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {systemInfo.map(({ label, value, icon }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-1.5 text-muted text-tiny mb-2">
              {icon}
              {label}
            </div>
            <p className="text-primary text-small font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Health Checks */}
      <div className="card overflow-hidden mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h3 className="text-h4">Component Health</h3>
          <button
            onClick={refreshHealth}
            disabled={refreshing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={13} className={cn("mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="siem-table w-full">
            <thead>
              <tr>
                <th>Component</th>
                <th>Status</th>
                <th>Last Check</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {health.map((h) => (
                <tr key={h.component}>
                  <td className="font-medium text-primary">{h.component}</td>
                  <td><StatusBadge status={h.status} /></td>
                  <td className="text-secondary text-small">{h.lastCheck}</td>
                  <td className="text-secondary text-small font-mono">
                    {h.latency !== null ? (
                      <span
                        className={cn(
                          h.latency > 100 ? "text-warning" : "text-success"
                        )}
                      >
                        {h.latency} ms
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Export / Cache */}
        <div className="card p-5">
          <h3 className="text-h4 mb-1">Maintenance</h3>
          <p className="text-muted text-tiny mb-4">Diagnostic exports and cache management.</p>
          <div className="space-y-2">
            <button onClick={handleExportLogs} className="btn btn-secondary w-full justify-start">
              <Download size={14} className="mr-2" />
              Export System Logs
            </button>
            {!clearConfirm ? (
              <button
                onClick={() => setClearConfirm(true)}
                className="btn btn-secondary w-full justify-start"
              >
                <RotateCcw size={14} className="mr-2" />
                Clear Cache
              </button>
            ) : (
              <div className="p-3 rounded-md bg-critical/10 border border-critical/30 space-y-2">
                <p className="text-small text-critical font-medium flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  Confirm cache clear?
                </p>
                <p className="text-tiny text-muted">This will flush all in-memory caches. Active sessions may experience brief latency.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearCache}
                    disabled={clearing}
                    className="btn btn-danger btn-sm"
                  >
                    {clearing ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : null}
                    {clearing ? "Clearing…" : "Clear"}
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="card p-5">
          <h3 className="text-h4 mb-1">Backup & Restore</h3>
          <p className="text-muted text-tiny mb-4">Export or import the full system configuration as JSON.</p>
          <div className="space-y-2">
            <button onClick={handleExportConfig} className="btn btn-secondary w-full justify-start">
              <Download size={14} className="mr-2" />
              Export Config (JSON)
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="btn btn-secondary w-full justify-start"
            >
              <Upload size={14} className="mr-2" />
              Import Config (JSON)
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportConfig}
            />
          </div>
          <div className="flex items-start gap-2 mt-4 p-3 rounded-md bg-surface-tertiary border border-surface-border">
            <Info size={13} className="text-muted mt-0.5 shrink-0" />
            <p className="text-tiny text-muted">
              Importing a config will overwrite current settings. A backup export is recommended first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general",       label: "General",       icon: <Settings size={16} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { id: "apikeys",       label: "API Keys",      icon: <Key size={16} /> },
  { id: "appearance",    label: "Appearance",    icon: <Palette size={16} /> },
  { id: "system",        label: "System",        icon: <Server size={16} /> },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("general");

  const renderSection = () => {
    switch (active) {
      case "general":       return <GeneralSection />;
      case "notifications": return <NotificationsSection />;
      case "apikeys":       return <ApiKeysSection />;
      case "appearance":    return <AppearanceSection />;
      case "system":        return <SystemSection />;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <nav
        className="shrink-0 border-r border-surface-border bg-surface-secondary flex flex-col py-4 gap-1"
        style={{ width: 200 }}
      >
        <div className="px-4 mb-3">
          <p className="text-tiny text-muted font-semibold uppercase tracking-wider">Configuration</p>
        </div>
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              "flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-small font-medium transition-colors text-left",
              active === id
                ? "bg-brand-primary/15 text-brand"
                : "text-secondary hover:text-primary hover:bg-surface-tertiary"
            )}
          >
            <span className={cn(active === id ? "text-brand" : "text-muted")}>{icon}</span>
            {label}
            {active === id && <ChevronRight size={12} className="ml-auto text-brand/50" />}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
