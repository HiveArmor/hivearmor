"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Zap, RefreshCw, CheckCircle, XCircle, Save, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccelerationSetting {
  id: number;
  settingKey: string;
  settingValue: string;
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface ApplySubResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface ApplyResult {
  ok: boolean;
  cluster_settings?: ApplySubResult;
  index_settings?: ApplySubResult;
  error?: string;
}

const SETTING_META: Record<string, { label: string; hint: string; category: "cluster" | "index" }> = {
  fielddata_cache_size:        { label: "Fielddata Cache Size",       hint: 'Percentage of heap for fielddata cache (e.g. "20%")',              category: "cluster" },
  indices_query_cache_size:    { label: "Query Cache Size",           hint: 'Percentage of heap for query cache (e.g. "10%")',                  category: "cluster" },
  indices_requests_cache_size: { label: "Requests Cache Size",        hint: 'Percentage of heap for requests cache (e.g. "2%")',                category: "cluster" },
  max_result_window:           { label: "Max Result Window",          hint: "Max documents per search request (e.g. 10000)",                    category: "index"   },
  refresh_interval:            { label: "Index Refresh Interval",     hint: 'How often index is refreshed (e.g. "5s", "30s", "-1" to disable)', category: "index"   },
  translog_durability:         { label: "Translog Durability",        hint: '"request" (safe) or "async" (faster, less durable)',               category: "index"   },
};

export default function SearchAccelerationPage() {
  const [settings, setSettings] = useState<AccelerationSetting[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AccelerationSetting[]>("/api/search-acceleration");
      setSettings(data ?? []);
      const initial: Record<string, string> = {};
      (data ?? []).forEach((s) => { initial[s.settingKey] = s.settingValue; });
      setEdits(initial);
    } catch {
      toast("error", "Failed to load search acceleration settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/api/search-acceleration", edits);
      toast("success", "Settings saved");
      await load();
    } catch {
      toast("error", "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setApplyResult(null);
    try {
      const result = await api.post<ApplyResult>("/api/search-acceleration/apply", {});
      setApplyResult(result);
      if (result.ok) {
        toast("success", "Settings applied to OpenSearch successfully");
      } else {
        toast("warning", "Applied with errors — check results below");
      }
    } catch {
      toast("error", "Failed to apply settings to OpenSearch");
    } finally {
      setApplying(false);
    }
  };

  const isDirty = settings.some((s) => edits[s.settingKey] !== s.settingValue);

  const clusterSettings = settings.filter((s) => SETTING_META[s.settingKey]?.category === "cluster");
  const indexSettings   = settings.filter((s) => SETTING_META[s.settingKey]?.category === "index");
  const unknownSettings = settings.filter((s) => !SETTING_META[s.settingKey]);

  function SettingRow({ setting }: { setting: AccelerationSetting }) {
    const meta = SETTING_META[setting.settingKey];
    const val  = edits[setting.settingKey] ?? setting.settingValue;
    const dirty = val !== setting.settingValue;
    return (
      <div className="grid grid-cols-[1fr_auto] gap-3 items-start py-3 border-b border-surface-border last:border-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-small font-medium text-primary">{meta?.label ?? setting.settingKey}</span>
            {dirty && <span className="text-tiny px-1.5 py-0.5 rounded bg-warning/15 text-warning">modified</span>}
          </div>
          {meta?.hint && (
            <p className="text-tiny text-muted flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />{meta.hint}
            </p>
          )}
          {setting.updatedAt && (
            <p className="text-tiny text-muted mt-1">Last updated: {new Date(setting.updatedAt).toLocaleString()}{setting.updatedBy ? ` by ${setting.updatedBy}` : ""}</p>
          )}
        </div>
        <input
          className="input-base w-44 text-small font-mono"
          value={val}
          onChange={(e) => setEdits((prev) => ({ ...prev, [setting.settingKey]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-primary flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand" /> Search Acceleration
          </h1>
          <p className="text-small text-muted mt-1">Configure OpenSearch performance settings for alert indexing and query execution.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost text-small p-2" title="Refresh">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button onClick={handleSave} disabled={!isDirty || saving} className="btn-secondary text-small flex items-center gap-1.5 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={handleApply} disabled={applying} className="btn-primary text-small flex items-center gap-1.5 disabled:opacity-50">
            <Zap className="w-3.5 h-3.5" /> {applying ? "Applying…" : "Apply to OpenSearch"}
          </button>
        </div>
      </div>

      {/* Apply Result */}
      {applyResult && (
        <div className="border border-surface-border rounded-lg p-4 space-y-2">
          <h4 className="text-h4 text-primary mb-2">Apply Results</h4>
          {applyResult.cluster_settings && (
            <div className="flex items-center gap-3 text-small">
              {applyResult.cluster_settings.ok
                ? <CheckCircle className="w-4 h-4 text-brand" />
                : <XCircle className="w-4 h-4 text-severity-critical" />}
              <span className={applyResult.cluster_settings.ok ? "text-brand" : "text-severity-critical"}>
                Cluster settings ({applyResult.cluster_settings.ok ? "ok" : "failed"})
              </span>
              {applyResult.cluster_settings.error && (
                <span className="text-tiny text-muted">{applyResult.cluster_settings.error}</span>
              )}
            </div>
          )}
          {applyResult.index_settings && (
            <div className="flex items-center gap-3 text-small">
              {applyResult.index_settings.ok
                ? <CheckCircle className="w-4 h-4 text-brand" />
                : <XCircle className="w-4 h-4 text-severity-critical" />}
              <span className={applyResult.index_settings.ok ? "text-brand" : "text-severity-critical"}>
                Index settings ({applyResult.index_settings.ok ? "ok" : "failed"})
              </span>
              {applyResult.index_settings.error && (
                <span className="text-tiny text-muted">{applyResult.index_settings.error}</span>
              )}
            </div>
          )}
          {applyResult.error && (
            <p className="text-small text-severity-critical">{applyResult.error}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-small text-muted">Loading settings…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cluster settings */}
          {clusterSettings.length > 0 && (
            <div className="border border-surface-border rounded-lg p-4">
              <h3 className="text-h3 text-primary mb-1">Cluster Settings</h3>
              <p className="text-tiny text-muted mb-3">Applied to the entire OpenSearch cluster via <code>/_cluster/settings</code></p>
              {clusterSettings.map((s) => <SettingRow key={s.settingKey} setting={s} />)}
            </div>
          )}

          {/* Index settings */}
          {indexSettings.length > 0 && (
            <div className="border border-surface-border rounded-lg p-4">
              <h3 className="text-h3 text-primary mb-1">Index Settings</h3>
              <p className="text-tiny text-muted mb-3">Applied to alert indices matching <code>_v3_hive_alert-*</code></p>
              {indexSettings.map((s) => <SettingRow key={s.settingKey} setting={s} />)}
            </div>
          )}

          {/* Unknown / extra settings */}
          {unknownSettings.length > 0 && (
            <div className="border border-surface-border rounded-lg p-4">
              <h3 className="text-h3 text-primary mb-3">Other Settings</h3>
              {unknownSettings.map((s) => <SettingRow key={s.settingKey} setting={s} />)}
            </div>
          )}

          {settings.length === 0 && (
            <div className="text-center py-16">
              <Zap className="w-8 h-8 text-muted mx-auto mb-3 opacity-50" />
              <p className="text-body text-muted">No settings found. Run the Liquibase migration to seed defaults.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
