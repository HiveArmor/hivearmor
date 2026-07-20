"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  Plus, Trash2, Save, ToggleLeft, ToggleRight, ExternalLink,
  Info, Zap, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { moduleService, type UtmModuleGroupConf, type UtmModuleGroup } from "@/services/module.service";

// ── Constants ──────────────────────────────────────────────────────────────

const MODULE_NAME = "SOC_AI";
const MASKED = "***";

// Backend config key names
const K = {
  PROVIDER:        "hivearmor.socai.provider",
  MODEL:           "hivearmor.socai.model",
  URL:             "hivearmor.socai.url",
  MAX_TOKENS:      "hivearmor.socai.maxTokens",
  AUTH_TYPE:       "hivearmor.socai.authType",
  CUSTOM_HEADERS:  "hivearmor.socai.customHeaders",
  AUTO_ANALYZE:    "hivearmor.socai.autoAnalyze",
  INCIDENT:        "hivearmor.socai.incidentCreation",
  CHANGE_STATUS:   "hivearmor.socai.changeAlertStatus",
} as const;

// Per-provider auth header formats
const AUTH_HEADERS: Record<string, { header: string; prefix: string }> = {
  openai:    { header: "Authorization", prefix: "Bearer " },
  anthropic: { header: "x-api-key",     prefix: "" },
  azure:     { header: "api-key",        prefix: "" },
  gemini:    { header: "Authorization",  prefix: "Bearer " },
  mistral:   { header: "Authorization",  prefix: "Bearer " },
  deepseek:  { header: "Authorization",  prefix: "Bearer " },
  groq:      { header: "Authorization",  prefix: "Bearer " },
};

// ── Provider definitions ───────────────────────────────────────────────────

interface ModelOption { value: string; label: string }

interface ProviderDef {
  id: string;
  name: string;
  icon: string;   // emoji fallback
  color: string;
  docsUrl?: string;
  description: string;
  needsApiKey: boolean;
  needsUrl: boolean;
  models?: ModelOption[];  // undefined → free-text model field
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "openai", name: "OpenAI", icon: "🟢", color: "bg-emerald-500/20 text-emerald-400",
    docsUrl: "https://platform.openai.com/api-keys",
    description: "Industry-leading GPT models. Get your API key from the OpenAI dashboard.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "gpt-4.1",      label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { value: "gpt-4o",       label: "GPT-4o" },
      { value: "gpt-4o-mini",  label: "GPT-4o mini" },
      { value: "o3-mini",      label: "o3-mini" },
    ],
  },
  {
    id: "anthropic", name: "Anthropic", icon: "🟤", color: "bg-amber-600/20 text-amber-400",
    docsUrl: "https://console.anthropic.com/settings/keys",
    description: "Claude models — known for nuanced reasoning and safety. API key from Anthropic Console.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "claude-opus-4-20250514",   label: "Claude Opus 4" },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-haiku-4-20250414",  label: "Claude Haiku 4" },
    ],
  },
  {
    id: "gemini", name: "Google Gemini", icon: "🔵", color: "bg-blue-500/20 text-blue-400",
    docsUrl: "https://aistudio.google.com/apikey",
    description: "Gemini models via Google AI Studio. Fast and cost-effective.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "gemini-2.5-pro",   label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "azure", name: "Azure OpenAI", icon: "☁️", color: "bg-sky-500/20 text-sky-400",
    docsUrl: "https://portal.azure.com/",
    description: "Azure-hosted OpenAI models. Requires your Azure endpoint URL and deployment name.",
    needsApiKey: true, needsUrl: true,
    models: undefined,
  },
  {
    id: "groq", name: "Groq", icon: "⚡", color: "bg-yellow-500/20 text-yellow-400",
    docsUrl: "https://console.groq.com/keys",
    description: "Groq LPU inference — extremely fast token throughput.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant",    label: "Llama 3.1 8B" },
      { value: "mixtral-8x7b-32768",      label: "Mixtral 8×7B" },
    ],
  },
  {
    id: "mistral", name: "Mistral AI", icon: "🌊", color: "bg-orange-500/20 text-orange-400",
    docsUrl: "https://console.mistral.ai/api-keys/",
    description: "European AI provider — Mistral Large, Medium and Small models.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "mistral-large-latest",  label: "Mistral Large" },
      { value: "mistral-medium-latest", label: "Mistral Medium" },
      { value: "mistral-small-latest",  label: "Mistral Small" },
    ],
  },
  {
    id: "deepseek", name: "DeepSeek", icon: "🔍", color: "bg-purple-500/20 text-purple-400",
    docsUrl: "https://platform.deepseek.com/api_keys",
    description: "High-capability open-source-backed models at low cost.",
    needsApiKey: true, needsUrl: false,
    models: [
      { value: "deepseek-chat",      label: "DeepSeek Chat" },
      { value: "deepseek-reasoner",  label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "ollama", name: "Ollama", icon: "🦙", color: "bg-teal-500/20 text-teal-400",
    docsUrl: "https://ollama.ai",
    description: "Run local LLMs on your own infrastructure. No API key needed.",
    needsApiKey: false, needsUrl: true,
    models: undefined,
  },
  {
    id: "custom", name: "Custom", icon: "🔧", color: "bg-neutral-500/20 text-neutral-400",
    description: "Any OpenAI-compatible /chat/completions endpoint.",
    needsApiKey: false, needsUrl: true,
    models: undefined,
  },
];

// ── Form state per provider ───────────────────────────────────────────────

interface ProviderForm {
  apiKey: string;
  model: string;
  customModel: string;
  url: string;
  maxTokens: string;
  authType: string;
  customHeaders: { key: string; value: string }[];
}

function emptyForm(): ProviderForm {
  return { apiKey: "", model: "", customModel: "", url: "", maxTokens: "4096", authType: "custom-headers", customHeaders: [] };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isMasked(v: string) {
  return v === MASKED || /^\*+$/.test(v);
}

function confVal(confs: UtmModuleGroupConf[], key: string): string {
  return confs.find(c => c.confKey === key)?.confValue ?? "";
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SocAiSettingsPage() {
  // Module / group IDs loaded from backend
  const [moduleId, setModuleId]     = useState<number | null>(null);
  const [group, setGroup]           = useState<UtmModuleGroup | null>(null);
  const [moduleActive, setModuleActive] = useState(false);

  // UI state
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [activating, setActivating] = useState(false);

  // Provider tab
  const [provider, setProvider]     = useState("openai");

  // Per-provider form cache (preserves state when switching tabs)
  const [formCache, setFormCache]   = useState<Record<string, ProviderForm>>({});

  // Behavior toggles (global, not provider-specific)
  const [autoAnalyze, setAutoAnalyze]         = useState(false);
  const [incidentCreation, setIncidentCreation] = useState(false);
  const [changeStatus, setChangeStatus]       = useState(false);

  // Original masked customHeaders value from backend (to detect if user changed it)
  const [savedMasked, setSavedMask] = useState<string | null>(null);
  const [savedProvider, setSavedProvider] = useState<string>("openai");

  // Show/hide password fields
  const [showKey, setShowKey]       = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mod = await moduleService.getModuleByName(MODULE_NAME);
      if (!mod) { setLoading(false); return; }
      setModuleId(mod.id);
      setModuleActive(mod.moduleActive ?? false);

      const groups = await moduleService.getGroups(mod.id);
      if (groups.length === 0) { setLoading(false); return; }

      const g = groups[0];
      setGroup(g);
      const confs = g.moduleGroupConfigurations ?? [];

      // Behavior toggles
      setAutoAnalyze(confVal(confs, K.AUTO_ANALYZE) === "true");
      setIncidentCreation(confVal(confs, K.INCIDENT) === "true");
      setChangeStatus(confVal(confs, K.CHANGE_STATUS) === "true");

      // Active provider
      const savedProv = confVal(confs, K.PROVIDER) || "openai";
      setProvider(savedProv);
      setSavedProvider(savedProv);

      // Build form state for the saved provider
      const form = emptyForm();
      form.model = confVal(confs, K.MODEL);
      form.url   = confVal(confs, K.URL);
      form.maxTokens = confVal(confs, K.MAX_TOKENS) || "4096";
      form.authType  = confVal(confs, K.AUTH_TYPE)  || "custom-headers";

      const rawHeaders = confVal(confs, K.CUSTOM_HEADERS);
      if (rawHeaders && rawHeaders !== "{}") {
        if (isMasked(rawHeaders)) {
          form.apiKey = MASKED;
          setSavedMask(rawHeaders);
        } else {
          try {
            const parsed = JSON.parse(rawHeaders) as Record<string, string>;
            const authConf = AUTH_HEADERS[savedProv];
            if (authConf && parsed[authConf.header]) {
              form.apiKey = MASKED;
              setSavedMask(rawHeaders);
            }
            if (savedProv === "custom") {
              form.customHeaders = Object.entries(parsed).map(([k, v]) => ({ key: k, value: v }));
            }
          } catch {/* ignore */}
        }
      }

      // Detect custom model
      const provDef = PROVIDERS.find(p => p.id === savedProv);
      if (provDef?.models) {
        const known = provDef.models.find(m => m.value === form.model);
        if (!known && form.model) {
          form.customModel = form.model;
          form.model = "__custom__";
        }
      }

      setFormCache({ [savedProv]: form });
    } catch (e) {
      toast("error", "Failed to load configuration", String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Current form ─────────────────────────────────────────────────────────

  const currentForm: ProviderForm = formCache[provider] ?? emptyForm();

  function updateForm(patch: Partial<ProviderForm>) {
    setFormCache(prev => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? emptyForm()), ...patch },
    }));
  }

  function switchProvider(id: string) {
    setProvider(id);
    if (!formCache[id]) {
      const defaults = emptyForm();
      const def = PROVIDERS.find(p => p.id === id);
      if (def?.models?.[0]) defaults.model = def.models[0].value;
      setFormCache(prev => ({ ...prev, [id]: defaults }));
    }
    setShowKey(false);
  }

  // Effective model value (resolves __custom__ → customModel)
  function effectiveModel(f: ProviderForm) {
    return f.model === "__custom__" ? f.customModel : f.model;
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!moduleId || !group) {
      toast("error", "Module not found", "SOC AI module is not registered on this server.");
      return;
    }

    const form = currentForm;
    const provDef = PROVIDERS.find(p => p.id === provider)!;

    // Validate
    const model = effectiveModel(form);
    if (!model) { toast("error", "Model is required"); return; }
    if (provDef.needsApiKey && !form.apiKey && provider !== savedProvider) {
      toast("error", "API key is required for " + provDef.name); return;
    }
    if (provDef.needsUrl && !form.url) {
      toast("error", "URL is required for " + provDef.name); return;
    }

    setSaving(true);
    try {
      const confs = group.moduleGroupConfigurations ?? [];

      const makeKey = (key: string, value: string, dtype = "text"): UtmModuleGroupConf => {
        const existing = confs.find(c => c.confKey === key);
        return {
          ...(existing ?? {}),
          groupId: group.id,
          confKey: key,
          confValue: value,
          confDataType: dtype,
        } as UtmModuleGroupConf;
      };

      const changes: UtmModuleGroupConf[] = [
        makeKey(K.PROVIDER,      provider),
        makeKey(K.MODEL,         model),
        makeKey(K.URL,           form.url),
        makeKey(K.MAX_TOKENS,    form.maxTokens || "4096"),
        makeKey(K.AUTO_ANALYZE,  autoAnalyze    ? "true" : "false"),
        makeKey(K.INCIDENT,      incidentCreation ? "true" : "false"),
        makeKey(K.CHANGE_STATUS, changeStatus   ? "true" : "false"),
      ];

      // Auth
      if (provider === "ollama") {
        changes.push(makeKey(K.AUTH_TYPE, "none"));
        changes.push(makeKey(K.CUSTOM_HEADERS, "{}", "password"));
      } else if (provider === "custom") {
        changes.push(makeKey(K.AUTH_TYPE, form.authType || "custom-headers"));
        const headersJson = form.customHeaders.length > 0
          ? JSON.stringify(Object.fromEntries(form.customHeaders.map(r => [r.key, r.value])))
          : "{}";
        changes.push(makeKey(K.CUSTOM_HEADERS, headersJson, "password"));
      } else {
        const authConf = AUTH_HEADERS[provider];
        const isStillMasked = isMasked(form.apiKey);
        if (authConf && form.apiKey && !isStillMasked) {
          // User entered a new key — build the auth header object
          const headers: Record<string, string> = {};
          headers[authConf.header] = authConf.prefix + form.apiKey;
          changes.push(makeKey(K.AUTH_TYPE, "custom-headers"));
          changes.push(makeKey(K.CUSTOM_HEADERS, JSON.stringify(headers), "password"));
        } else if (isStillMasked && savedMasked) {
          // Unchanged — send the original masked value back; backend skips it
          changes.push(makeKey(K.AUTH_TYPE, "custom-headers"));
          changes.push(makeKey(K.CUSTOM_HEADERS, savedMasked, "password"));
        }
      }

      await moduleService.saveConfig(moduleId, changes);
      toast("success", "Configuration saved", "SOC AI will pick up the new settings automatically.");
      setSavedProvider(provider);
      await load(); // refresh to reflect backend-stored values
    } catch (e) {
      const msg = String(e);
      if (msg.includes("400") || msg.includes("Invalid")) {
        toast("error", "Invalid configuration", msg);
      } else {
        toast("error", "Save failed", msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Activate/deactivate ───────────────────────────────────────────────────

  async function handleToggleActive() {
    if (!moduleId) return;
    setActivating(true);
    try {
      await moduleService.setActive(moduleId, 1, !moduleActive);
      setModuleActive(v => !v);
      toast("success", moduleActive ? "SOC AI disabled" : "SOC AI enabled");
    } catch (e) {
      toast("error", "Failed to toggle module", String(e));
    } finally {
      setActivating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  const provDef = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-h2 font-bold text-primary">AI Engine</h1>
            <p className="text-small text-muted mt-0.5">
              Configure the LLM provider for SOC AI alert analysis. Changes take effect immediately — no restart required.
            </p>
          </div>
        </div>

        {/* Module active toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-small text-muted">
            {moduleActive ? "Enabled" : "Disabled"}
          </span>
          <button
            onClick={handleToggleActive}
            disabled={activating || !moduleId}
            className="disabled:opacity-50"
            title={moduleActive ? "Disable SOC AI module" : "Enable SOC AI module"}
          >
            {activating
              ? <Loader2 className="w-5 h-5 animate-spin text-muted" />
              : moduleActive
                ? <ToggleRight className="w-7 h-7 text-brand" />
                : <ToggleLeft className="w-7 h-7 text-muted" />
            }
          </button>
        </div>
      </div>

      {/* ── No module warning ────────────────────────────────────────── */}
      {!moduleId && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-small font-medium text-warning">SOC AI module not found</p>
            <p className="text-tiny text-secondary mt-0.5">
              The SOC_AI module is not registered on this server. Ensure the plugin service is running.
            </p>
          </div>
        </div>
      )}

      {moduleId && (
        <>
          {/* ── Provider tabs ──────────────────────────────────────────── */}
          <div>
            <h2 className="text-small font-semibold text-secondary uppercase tracking-wide mb-3">
              AI Provider
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all",
                    provider === p.id
                      ? "border-brand bg-brand/10 shadow-sm"
                      : "border-surface-border bg-surface-secondary hover:bg-surface-tertiary"
                  )}
                >
                  <span className="text-lg leading-none">{p.icon}</span>
                  <span className={cn("text-tiny font-medium leading-tight", provider === p.id ? "text-brand" : "text-secondary")}>
                    {p.name}
                  </span>
                  {p.id === savedProvider && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success" title="Currently configured" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Provider config form ────────────────────────────────────── */}
          <div className="card p-5 space-y-4">
            {/* Provider description */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded text-tiny font-semibold", provDef.color)}>
                  {provDef.name}
                </span>
                {provDef.docsUrl && (
                  <a
                    href={provDef.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-tiny text-brand hover:underline"
                  >
                    Get API key <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {provider === savedProvider && (
                <span className="flex items-center gap-1 text-tiny text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              )}
            </div>

            <p className="text-tiny text-muted">{provDef.description}</p>

            {/* API Key */}
            {provDef.needsApiKey && (
              <div className="space-y-1.5">
                <label className="block text-small font-medium text-secondary">
                  API Key <span className="text-critical">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    className="input-base w-full pr-9"
                    placeholder={isMasked(currentForm.apiKey) ? "Key saved (enter new value to replace)" : "Paste your API key…"}
                    value={isMasked(currentForm.apiKey) ? "" : currentForm.apiKey}
                    onChange={e => updateForm({ apiKey: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                    onClick={() => setShowKey(v => !v)}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isMasked(currentForm.apiKey) && (
                  <p className="text-tiny text-muted flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    API key is saved. Leave blank to keep the existing key, or type a new one to replace it.
                  </p>
                )}
              </div>
            )}

            {/* URL (azure, ollama, custom) */}
            {provDef.needsUrl && (
              <div className="space-y-1.5">
                <label className="block text-small font-medium text-secondary">
                  {provider === "ollama" ? "Ollama Server URL" : "Endpoint URL"}
                  {provDef.needsUrl && <span className="text-critical ml-1">*</span>}
                </label>
                <input
                  type="text"
                  className="input-base w-full"
                  placeholder={
                    provider === "ollama"
                      ? "http://your-server:11434/v1/chat/completions"
                      : provider === "azure"
                        ? "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT/chat/completions?api-version=2024-02-01"
                        : "https://your-provider.com/v1/chat/completions"
                  }
                  value={currentForm.url}
                  onChange={e => updateForm({ url: e.target.value })}
                />
                {provider === "ollama" &&
                  (currentForm.url.includes("localhost") || currentForm.url.includes("127.0.0.1")) && (
                  <div className="flex items-start gap-2 p-2.5 rounded-md bg-warning/10 border border-warning/30">
                    <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-tiny text-warning">
                      <span className="font-semibold">Docker networking:</span>{" "}
                      HiveArmor runs inside Docker, so{" "}
                      <code className="font-mono bg-warning/20 px-1 rounded">localhost</code> refers to the container, not your machine.{" "}
                      Replace it with{" "}
                      <button
                        type="button"
                        className="font-mono bg-warning/20 px-1 rounded underline decoration-dotted cursor-pointer hover:bg-warning/30"
                        onClick={() => updateForm({
                          url: currentForm.url
                            .replace(/localhost/g, "host.docker.internal")
                            .replace(/127\.0\.0\.1/g, "host.docker.internal")
                        })}
                      >
                        host.docker.internal
                      </button>
                      {" "}to reach Ollama on your host machine.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Model */}
            <div className="space-y-1.5">
              <label className="block text-small font-medium text-secondary">
                Model <span className="text-critical">*</span>
              </label>
              {provDef.models ? (
                <select
                  className="input-base w-full"
                  value={currentForm.model || ""}
                  onChange={e => updateForm({ model: e.target.value })}
                >
                  <option value="" disabled>Select model…</option>
                  {provDef.models.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  <option value="__custom__">Custom model name…</option>
                </select>
              ) : (
                <input
                  type="text"
                  className="input-base w-full"
                  placeholder={provider === "ollama" ? "llama3" : "model-name"}
                  value={currentForm.model}
                  onChange={e => updateForm({ model: e.target.value })}
                />
              )}
              {currentForm.model === "__custom__" && (
                <input
                  type="text"
                  className="input-base w-full mt-1.5"
                  placeholder="Enter exact model identifier…"
                  value={currentForm.customModel}
                  onChange={e => updateForm({ customModel: e.target.value })}
                  autoFocus
                />
              )}
            </div>

            {/* Max Tokens */}
            <div className="space-y-1.5">
              <label className="block text-small font-medium text-secondary">Max Tokens</label>
              <input
                type="number"
                className="input-base w-48"
                placeholder="4096"
                min={256}
                max={128000}
                value={currentForm.maxTokens}
                onChange={e => updateForm({ maxTokens: e.target.value })}
              />
              <p className="text-tiny text-muted">Maximum tokens per LLM request (default: 4096).</p>
            </div>

            {/* Custom headers (for "custom" provider) */}
            {provider === "custom" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-small font-medium text-secondary">Custom Headers</label>
                  <button
                    className="btn btn-xs btn-secondary gap-1"
                    onClick={() => updateForm({
                      customHeaders: [...(currentForm.customHeaders ?? []), { key: "", value: "" }]
                    })}
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                {(currentForm.customHeaders ?? []).map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="input-base flex-1 text-tiny"
                      placeholder="Header name"
                      value={row.key}
                      onChange={e => {
                        const rows = [...(currentForm.customHeaders ?? [])];
                        rows[i] = { ...rows[i], key: e.target.value };
                        updateForm({ customHeaders: rows });
                      }}
                    />
                    <input
                      className="input-base flex-1 text-tiny"
                      placeholder="Value"
                      value={row.value}
                      onChange={e => {
                        const rows = [...(currentForm.customHeaders ?? [])];
                        rows[i] = { ...rows[i], value: e.target.value };
                        updateForm({ customHeaders: rows });
                      }}
                    />
                    <button
                      className="toolbar-btn shrink-0"
                      onClick={() => {
                        const rows = (currentForm.customHeaders ?? []).filter((_, j) => j !== i);
                        updateForm({ customHeaders: rows });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-critical" />
                    </button>
                  </div>
                ))}
                {(currentForm.customHeaders ?? []).length === 0 && (
                  <p className="text-tiny text-muted">No custom headers. Click Add to include an Authorization header.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Behavior toggles ────────────────────────────────────────── */}
          <div className="card p-5 space-y-3">
            <h2 className="text-small font-semibold text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand" />
              Automation Behavior
            </h2>

            <BehaviorToggle
              label="Auto-analyze alerts"
              description="Automatically send every incoming alert for LLM analysis (requires the soc-ai plugin to be processing the alert stream)."
              checked={autoAnalyze}
              onChange={setAutoAnalyze}
            />
            <BehaviorToggle
              label="Auto-create incidents"
              description="Automatically create an incident when the AI classifies an alert as a 'possible incident'."
              checked={incidentCreation}
              onChange={setIncidentCreation}
            />
            <BehaviorToggle
              label="Change alert status after analysis"
              description='After analysis, mark alerts as "In Review" so analysts know they have been triaged by AI.'
              checked={changeStatus}
              onChange={setChangeStatus}
            />
          </div>

          {/* ── How it works note ────────────────────────────────────────── */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-surface-secondary border border-surface-border">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-tiny text-secondary space-y-1">
              <p className="font-medium text-primary">How configuration propagates</p>
              <p>
                Configuration is saved to the database and streamed to the running SOC AI plugin over gRPC in real time.
                No service restart is needed — changes take effect within seconds.
              </p>
              <p>
                In production, the plugin service (<code className="text-brand">eventprocessor:8090</code>) is always running.
                The backend communicates with it automatically using the internal service key.
              </p>
            </div>
          </div>

          {/* ── Save button ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              className="btn btn-sm btn-secondary gap-1.5"
              onClick={load}
              disabled={loading || saving}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Reload
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !moduleId}
              className="btn btn-primary gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── BehaviorToggle ─────────────────────────────────────────────────────────

function BehaviorToggle({
  label, description, checked, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-t border-surface-border first:border-t-0">
      <button
        onClick={() => onChange(!checked)}
        className="shrink-0 mt-0.5"
        aria-label={label}
      >
        {checked
          ? <ToggleRight className="w-6 h-6 text-brand" />
          : <ToggleLeft  className="w-6 h-6 text-muted"  />
        }
      </button>
      <div>
        <p className="text-small font-medium text-primary">{label}</p>
        <p className="text-tiny text-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}
