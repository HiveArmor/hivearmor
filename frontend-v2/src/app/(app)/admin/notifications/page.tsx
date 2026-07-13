"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, Mail, MessageSquare, Webhook, Plus, Trash2, Edit2, TestTube2,
  CheckCircle2, XCircle, Loader2, ChevronRight, RefreshCw,
  AlertTriangle, Route, Zap, Clock, ToggleLeft, ToggleRight,
  Filter, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  notificationService,
  type InAppNotification,
  type NotificationChannel,
  type NotificationRoute,
  type ChannelType,
  type EmailChannelConfig,
  type SlackChannelConfig,
  type WebhookChannelConfig,
} from "@/services/notification.service";

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"];
const SOURCE_OPTIONS   = ["ALERTS", "AWS", "AZURE", "BIT_DEFENDER", "EMAIL_SETTING", "GOOGLE", "OFFICE_365", "SOPHOS"];
const TYPE_OPTIONS     = ["ERROR", "WARNING", "INFO"];

const TYPE_COLOR: Record<string, string> = {
  ERROR:   "text-critical",
  WARNING: "text-warning",
  INFO:    "text-brand",
};

const TYPE_DOT: Record<string, string> = {
  ERROR:   "bg-critical",
  WARNING: "bg-warning",
  INFO:    "bg-brand",
};

// ── Channel type icon ──────────────────────────────────────────────────────

function ChannelIcon({ type, className }: { type: ChannelType; className?: string }) {
  const cls = cn("w-4 h-4", className);
  if (type === "email")   return <Mail    className={cls} />;
  if (type === "slack")   return <MessageSquare className={cls} />;
  if (type === "webhook") return <Webhook className={cls} />;
  return <Zap className={cls} />;
}

// ── Channel form modal ─────────────────────────────────────────────────────

function ChannelModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: NotificationChannel | null;
  onClose: () => void;
  onSaved: (ch: NotificationChannel) => void;
}) {
  const isNew = !channel?.id;
  const [name, setName]         = useState(channel?.name ?? "");
  const [type, setType]         = useState<ChannelType>(channel?.channelType ?? "email");
  const [enabled, setEnabled]   = useState(channel?.enabled ?? true);
  const [configJson, setConfigJson] = useState(channel?.configJson ?? "");
  const [saving, setSaving]     = useState(false);
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    if (!isNew) return;
    const templates: Record<ChannelType, object> = {
      email: {
        host: "smtp.example.com", port: 587, username: "", password: "",
        from: "HiveArmor <alerts@example.com>",
        authType: "STARTTLS", toAddresses: ["soc@example.com"],
      } as EmailChannelConfig,
      slack: {
        webhookUrl: "https://hooks.slack.com/services/T000/B000/xxxx",
        channel: "#soc-alerts", username: "HiveArmor", iconEmoji: ":shield:",
      } as SlackChannelConfig,
      webhook: {
        url: "https://events.pagerduty.com/v2/enqueue", method: "POST",
        headers: { "Content-Type": "application/json" },
        bodyTemplate: '{"message":"{{message}}","severity":"{{severity}}","source":"HiveArmor"}',
      } as WebhookChannelConfig,
    };
    setConfigJson(JSON.stringify(templates[type], null, 2));
  }, [type, isNew]);

  const validateJson = (v: string) => {
    try { JSON.parse(v); setJsonError(""); return true; }
    catch (e: unknown) { setJsonError(String(e)); return false; }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast("error", "Name required"); return; }
    if (!validateJson(configJson)) return;
    setSaving(true);
    try {
      const payload: NotificationChannel = { name, channelType: type, enabled, configJson };
      const saved = channel?.id
        ? await notificationService.updateChannel(channel.id, payload)
        : await notificationService.createChannel(payload);
      onSaved(saved);
      toast("success", isNew ? "Channel created" : "Channel updated", name);
    } catch {
      toast("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10vh] z-[70] mx-auto max-w-2xl bg-surface-primary rounded-2xl border border-surface-border shadow-drawer overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2.5">
            <ChannelIcon type={type} className="text-brand" />
            <p className="text-small font-semibold text-primary">
              {isNew ? "New Channel" : `Edit — ${channel?.name}`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-base w-full text-small"
                placeholder="e.g. SOC Email"
              />
            </div>
            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as ChannelType)}
                disabled={!isNew}
                className="input-base w-full text-small disabled:opacity-60"
              >
                <option value="email">Email (SMTP)</option>
                <option value="slack">Slack Webhook</option>
                <option value="webhook">Generic Webhook</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-tiny font-medium text-secondary">Configuration (JSON)</label>
              {jsonError && <span className="text-tiny text-critical">{jsonError}</span>}
            </div>
            <textarea
              value={configJson}
              onChange={e => { setConfigJson(e.target.value); validateJson(e.target.value); }}
              rows={12}
              className={cn(
                "input-base w-full text-tiny font-mono resize-none",
                jsonError && "border-critical/50",
              )}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "w-9 h-5 rounded-full transition-colors flex items-center px-0.5",
                enabled ? "bg-brand" : "bg-surface-border",
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-4" : "translate-x-0",
              )} />
            </div>
            <span className="text-small text-secondary">Enabled</span>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-surface-border flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !!jsonError}
            className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isNew ? "Create Channel" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Route form modal ───────────────────────────────────────────────────────

function RouteModal({
  route,
  channels,
  onClose,
  onSaved,
}: {
  route: NotificationRoute | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: (r: NotificationRoute) => void;
}) {
  const isNew = !route?.id;
  const [name, setName]         = useState(route?.name ?? "");
  const [channelId, setChannelId] = useState<number>(route?.channelId ?? (channels[0]?.id ?? 0));
  const [severities, setSeverities] = useState<string[]>(route?.matchSeverity?.split(",").filter(Boolean) ?? []);
  const [sources, setSources]   = useState<string[]>(route?.matchSource?.split(",").filter(Boolean) ?? []);
  const [types, setTypes]       = useState<string[]>(route?.matchType?.split(",").filter(Boolean) ?? []);
  const [enabled, setEnabled]   = useState(route?.enabled ?? true);
  const [throttle, setThrottle] = useState(route?.throttleMinutes ?? 5);
  const [saving, setSaving]     = useState(false);

  const toggleMulti = (val: string, arr: string[], set: (v: string[]) => void) => {
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast("error", "Name required"); return; }
    if (!channelId)   { toast("error", "Select a channel"); return; }
    setSaving(true);
    try {
      const payload: NotificationRoute = {
        name, channelId,
        matchSeverity: severities.join(","),
        matchSource:   sources.join(","),
        matchType:     types.join(","),
        enabled, throttleMinutes: throttle,
      };
      const saved = route?.id
        ? await notificationService.updateRoute(route.id, payload)
        : await notificationService.createRoute(payload);
      onSaved(saved);
      toast("success", isNew ? "Route created" : "Route updated", name);
    } catch {
      toast("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const CheckGroup = ({
    label, options, value, onChange,
  }: {
    label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
  }) => (
    <div>
      <label className="text-tiny font-medium text-secondary mb-1.5 block">
        {label} <span className="text-muted font-normal">(empty = any)</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => toggleMulti(opt, value, onChange)}
            className={cn(
              "px-2.5 py-1 rounded-full text-tiny transition-colors border",
              value.includes(opt)
                ? "bg-brand/15 text-brand border-brand/30"
                : "text-muted border-surface-border hover:text-secondary hover:border-surface-border-strong",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[15vh] z-[70] mx-auto max-w-xl bg-surface-primary rounded-2xl border border-surface-border shadow-drawer overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <Route className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">
              {isNew ? "New Routing Rule" : `Edit — ${route?.name}`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Rule Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-base w-full text-small"
              placeholder="e.g. Critical → SOC Email"
            />
          </div>

          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Destination Channel</label>
            <select
              value={channelId}
              onChange={e => setChannelId(Number(e.target.value))}
              className="input-base w-full text-small"
            >
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name} ({ch.channelType})</option>
              ))}
            </select>
          </div>

          <CheckGroup label="Severity" options={SEVERITY_OPTIONS} value={severities} onChange={setSeverities} />
          <CheckGroup label="Source"   options={SOURCE_OPTIONS}   value={sources}    onChange={setSources} />
          <CheckGroup label="Type"     options={TYPE_OPTIONS}     value={types}      onChange={setTypes} />

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-tiny font-medium text-secondary mb-1 block">Throttle (minutes)</label>
              <input
                type="number" min={0} max={1440} value={throttle}
                onChange={e => setThrottle(Number(e.target.value))}
                className="input-base w-full text-small"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer mt-5">
              <div
                onClick={() => setEnabled(!enabled)}
                className={cn(
                  "w-9 h-5 rounded-full transition-colors flex items-center px-0.5",
                  enabled ? "bg-brand" : "bg-surface-border",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-4" : "translate-x-0",
                )} />
              </div>
              <span className="text-small text-secondary">Enabled</span>
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-surface-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isNew ? "Create Rule" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

type Tab = "feed" | "channels" | "routes";

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("feed");

  // Feed
  const [feedItems, setFeedItems]   = useState<InAppNotification[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState<"all" | "unread">("all");

  // Channels
  const [channels, setChannels]     = useState<NotificationChannel[]>([]);
  const [chLoading, setChLoading]   = useState(true);
  const [editChannel, setEditChannel] = useState<NotificationChannel | null | "new">(null);
  const [testingId, setTestingId]   = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, boolean | null>>({});

  // Routes
  const [routes, setRoutes]         = useState<NotificationRoute[]>([]);
  const [rtLoading, setRtLoading]   = useState(true);
  const [editRoute, setEditRoute]   = useState<NotificationRoute | null | "new">(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const page = await notificationService.getFeed(0, 50);
      const items = Array.isArray(page) ? page : (page?.content ?? []);
      setFeedItems(items);
    } catch { /* keep empty */ }
    finally { setFeedLoading(false); }
  }, []);

  const loadChannels = useCallback(async () => {
    setChLoading(true);
    try { setChannels(await notificationService.listChannels()); }
    catch { /* keep empty */ }
    finally { setChLoading(false); }
  }, []);

  const loadRoutes = useCallback(async () => {
    setRtLoading(true);
    try { setRoutes(await notificationService.listRoutes()); }
    catch { /* keep empty */ }
    finally { setRtLoading(false); }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);
  useEffect(() => {
    if (tab === "channels") loadChannels();
  }, [tab, loadChannels]);
  useEffect(() => {
    if (tab === "routes") { loadChannels(); loadRoutes(); }
  }, [tab, loadChannels, loadRoutes]);

  // ── Feed actions ──────────────────────────────────────────────────────────

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setFeedItems(ns => ns.map(n => ({ ...n, read: true })));
      toast("success", "All marked as read");
    } catch { toast("error", "Failed"); }
  };

  const handleDismiss = async (n: InAppNotification) => {
    try {
      await notificationService.updateStatus(n.id, "HIDDEN");
      setFeedItems(ns => ns.filter(x => x.id !== n.id));
    } catch { toast("error", "Failed"); }
  };

  // ── Channel actions ───────────────────────────────────────────────────────

  const handleTestChannel = async (id: number) => {
    setTestingId(id);
    setTestResults(r => ({ ...r, [id]: null }));
    try {
      const res = await notificationService.testChannel(id);
      setTestResults(r => ({ ...r, [id]: res.ok }));
      toast(res.ok ? "success" : "error", res.ok ? "Test passed" : "Test failed", res.error || undefined);
    } catch {
      setTestResults(r => ({ ...r, [id]: false }));
      toast("error", "Test failed");
    } finally { setTestingId(null); }
  };

  const handleDeleteChannel = async (id: number, name: string) => {
    if (!confirm(`Delete channel "${name}"? Routes using it will break.`)) return;
    try {
      await notificationService.deleteChannel(id);
      setChannels(cs => cs.filter(c => c.id !== id));
      toast("success", "Channel deleted");
    } catch { toast("error", "Delete failed"); }
  };

  const handleChannelSaved = (ch: NotificationChannel) => {
    setChannels(cs => {
      const idx = cs.findIndex(c => c.id === ch.id);
      return idx >= 0 ? cs.map((c, i) => i === idx ? ch : c) : [ch, ...cs];
    });
    setEditChannel(null);
  };

  const handleToggleChannel = async (ch: NotificationChannel) => {
    try {
      const saved = await notificationService.updateChannel(ch.id!, { ...ch, enabled: !ch.enabled });
      setChannels(cs => cs.map(c => c.id === ch.id ? saved : c));
    } catch { toast("error", "Toggle failed"); }
  };

  // ── Route actions ─────────────────────────────────────────────────────────

  const handleDeleteRoute = async (id: number, name: string) => {
    if (!confirm(`Delete route "${name}"?`)) return;
    try {
      await notificationService.deleteRoute(id);
      setRoutes(rs => rs.filter(r => r.id !== id));
      toast("success", "Route deleted");
    } catch { toast("error", "Delete failed"); }
  };

  const handleRouteSaved = (r: NotificationRoute) => {
    setRoutes(rs => {
      const idx = rs.findIndex(x => x.id === r.id);
      return idx >= 0 ? rs.map((x, i) => i === idx ? r : x) : [r, ...rs];
    });
    setEditRoute(null);
  };

  const handleToggleRoute = async (r: NotificationRoute) => {
    try {
      const saved = await notificationService.updateRoute(r.id!, { ...r, enabled: !r.enabled });
      setRoutes(rs => rs.map(x => x.id === r.id ? saved : x));
    } catch { toast("error", "Toggle failed"); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const visibleFeed = feedFilter === "unread" ? feedItems.filter(n => !n.read) : feedItems;
  const unreadCount = feedItems.filter(n => !n.read).length;
  const channelMap  = Object.fromEntries(channels.map(c => [c.id!, c]));

  const TABS = [
    { id: "feed"     as Tab, label: "In-App Feed",    icon: <Bell   className="w-3.5 h-3.5" />, badge: unreadCount || undefined },
    { id: "channels" as Tab, label: "Channels",       icon: <Mail   className="w-3.5 h-3.5" />, badge: undefined },
    { id: "routes"   as Tab, label: "Routing Rules",  icon: <Route  className="w-3.5 h-3.5" />, badge: undefined },
  ];

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Notifications</h1>
          <p className="text-secondary text-small mt-0.5">
            In-app feed, outbound channels (email / Slack / webhook), and routing rules
          </p>
        </div>
        {tab === "channels" && (
          <button onClick={() => setEditChannel("new")} className="btn btn-sm btn-primary gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Channel
          </button>
        )}
        {tab === "routes" && (
          <button
            onClick={() => setEditRoute("new")}
            disabled={channels.length === 0}
            className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> New Route
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-surface-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-small font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-secondary",
            )}
          >
            {t.icon} {t.label}
            {t.badge ? (
              <span className="ml-1 text-micro px-1.5 py-0.5 rounded-full bg-critical/15 text-critical font-medium">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Feed tab ──────────────────────────────────────────────────── */}
      {tab === "feed" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFeedFilter("all")}
                className={cn(
                  "text-tiny px-3 py-1.5 rounded-full border transition-colors",
                  feedFilter === "all"
                    ? "bg-brand/10 text-brand border-brand/30"
                    : "text-muted border-surface-border hover:text-secondary",
                )}
              >All</button>
              <button
                onClick={() => setFeedFilter("unread")}
                className={cn(
                  "text-tiny px-3 py-1.5 rounded-full border transition-colors",
                  feedFilter === "unread"
                    ? "bg-brand/10 text-brand border-brand/30"
                    : "text-muted border-surface-border hover:text-secondary",
                )}
              >
                Unread {unreadCount > 0 && <span className="ml-1 font-semibold">{unreadCount}</span>}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="btn btn-sm btn-secondary gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button onClick={loadFeed} disabled={feedLoading} className="btn btn-sm btn-secondary gap-1.5">
                <RefreshCw className={cn("w-3.5 h-3.5", feedLoading && "animate-spin")} /> Refresh
              </button>
            </div>
          </div>

          <div className="card overflow-hidden divide-y divide-surface-border">
            {feedLoading ? (
              <div className="py-12 text-center text-small text-muted">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading feed…
              </div>
            ) : visibleFeed.length === 0 ? (
              <div className="py-12 text-center text-small text-muted">
                <Bell className="w-5 h-5 mx-auto mb-2 opacity-40" />
                {feedFilter === "unread" ? "No unread notifications" : "No notifications"}
              </div>
            ) : (
              visibleFeed.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 hover:bg-surface-secondary/40 transition-colors group",
                    !n.read && "bg-surface-secondary/20",
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", TYPE_DOT[n.type] || "bg-muted")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("text-tiny font-semibold", TYPE_COLOR[n.type] || "text-secondary")}>
                        {n.type}
                      </span>
                      <span className="text-tiny text-muted">·</span>
                      <span className="text-tiny text-muted">{n.source}</span>
                      {!n.read && (
                        <span className="text-micro px-1.5 py-0.5 rounded-full bg-brand/10 text-brand font-medium">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-small text-primary">{n.message}</p>
                    <p className="text-tiny text-muted mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleDismiss(n)}
                    className="opacity-0 group-hover:opacity-100 btn btn-sm btn-secondary gap-1 transition-opacity"
                  >
                    <EyeOff className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Channels tab ──────────────────────────────────────────────── */}
      {tab === "channels" && (
        <div className="space-y-3">
          {chLoading ? (
            <div className="card py-12 text-center text-small text-muted">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
            </div>
          ) : channels.length === 0 ? (
            <div className="card py-12 text-center text-small text-muted">
              <Mail className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No channels yet — click <strong>New Channel</strong> to add one
            </div>
          ) : (
            channels.map(ch => {
              const tested = testResults[ch.id!];
              return (
                <div key={ch.id} className="card p-4 flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    ch.channelType === "email"   ? "bg-blue-500/10 text-blue-400"   :
                    ch.channelType === "slack"   ? "bg-purple-500/10 text-purple-400" :
                                                   "bg-orange-500/10 text-orange-400",
                  )}>
                    <ChannelIcon type={ch.channelType as ChannelType} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-small font-semibold text-primary">{ch.name}</span>
                      <span className="text-micro text-muted uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-tertiary">
                        {ch.channelType}
                      </span>
                      {!ch.enabled && (
                        <span className="text-micro text-muted px-1.5 py-0.5 rounded bg-surface-tertiary">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {ch.lastTestedAt && (
                        <span className={cn(
                          "text-tiny flex items-center gap-1",
                          ch.lastTestOk ? "text-success" : "text-critical",
                        )}>
                          {ch.lastTestOk
                            ? <CheckCircle2 className="w-3 h-3" />
                            : <XCircle className="w-3 h-3" />
                          }
                          Last test {timeAgo(ch.lastTestedAt)}
                        </span>
                      )}
                      {tested !== undefined && (
                        <span className={cn("text-tiny flex items-center gap-1", tested ? "text-success" : "text-critical")}>
                          {tested ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {tested ? "OK" : "Failed"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleToggleChannel(ch)} className="btn btn-sm btn-secondary gap-1.5">
                      {ch.enabled
                        ? <ToggleRight className="w-3.5 h-3.5 text-success" />
                        : <ToggleLeft  className="w-3.5 h-3.5 text-muted" />
                      }
                      {ch.enabled ? "On" : "Off"}
                    </button>
                    <button
                      onClick={() => handleTestChannel(ch.id!)}
                      disabled={testingId === ch.id!}
                      className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50"
                    >
                      {testingId === ch.id!
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <TestTube2 className="w-3.5 h-3.5" />
                      }
                      Test
                    </button>
                    <button
                      onClick={() => setEditChannel(ch)}
                      className="btn btn-sm btn-secondary gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteChannel(ch.id!, ch.name)}
                      className="btn btn-sm gap-1.5 text-critical border border-critical/20 bg-critical/5 hover:bg-critical/15"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Routes tab ────────────────────────────────────────────────── */}
      {tab === "routes" && (
        <div className="space-y-3">
          {channels.length === 0 && !chLoading && (
            <div className="p-3 rounded-lg border border-warning/30 bg-warning/5 text-tiny text-warning flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              No channels configured. Create a channel first before adding routes.
            </div>
          )}
          {rtLoading ? (
            <div className="card py-12 text-center text-small text-muted">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
            </div>
          ) : routes.length === 0 ? (
            <div className="card py-12 text-center text-small text-muted">
              <Route className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No routing rules yet — alerts will only appear in-app
            </div>
          ) : (
            routes.map(r => {
              const ch = channelMap[r.channelId];
              return (
                <div key={r.id} className="card p-4 flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    r.enabled ? "bg-brand/10 text-brand" : "bg-surface-tertiary text-muted",
                  )}>
                    <Filter className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-small font-semibold text-primary">{r.name}</span>
                      {!r.enabled && (
                        <span className="text-micro text-muted px-1.5 py-0.5 rounded bg-surface-tertiary">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-tiny text-muted">
                        <ChevronRight className="w-3 h-3" />
                        {ch ? (
                          <>
                            <ChannelIcon type={ch.channelType as ChannelType} className="w-3 h-3" />
                            <span>{ch.name}</span>
                          </>
                        ) : (
                          <span className="text-critical">Channel #{r.channelId} (deleted)</span>
                        )}
                      </span>
                      {r.matchSeverity && (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-surface-tertiary text-muted">
                          sev: {r.matchSeverity}
                        </span>
                      )}
                      {r.matchSource && (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-surface-tertiary text-muted">
                          src: {r.matchSource}
                        </span>
                      )}
                      {(r.throttleMinutes ?? 0) > 0 && (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-surface-tertiary text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3" />{r.throttleMinutes}m throttle
                        </span>
                      )}
                      {r.lastFiredAt && (
                        <span className="text-micro text-muted">fired {timeAgo(r.lastFiredAt)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleToggleRoute(r)} className="btn btn-sm btn-secondary gap-1.5">
                      {r.enabled
                        ? <ToggleRight className="w-3.5 h-3.5 text-success" />
                        : <ToggleLeft  className="w-3.5 h-3.5 text-muted" />
                      }
                      {r.enabled ? "On" : "Off"}
                    </button>
                    <button onClick={() => setEditRoute(r)} className="btn btn-sm btn-secondary gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(r.id!, r.name)}
                      className="btn btn-sm gap-1.5 text-critical border border-critical/20 bg-critical/5 hover:bg-critical/15"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modals */}
      {editChannel !== null && (
        <ChannelModal
          channel={editChannel === "new" ? null : editChannel}
          onClose={() => setEditChannel(null)}
          onSaved={handleChannelSaved}
        />
      )}
      {editRoute !== null && (
        <RouteModal
          route={editRoute === "new" ? null : editRoute}
          channels={channels}
          onClose={() => setEditRoute(null)}
          onSaved={handleRouteSaved}
        />
      )}
    </div>
  );
}
