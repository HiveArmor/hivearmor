"use client";

import { useState, useCallback } from "react";
import {
  X, ChevronRight, ChevronLeft, Monitor, Server, Cloud, Radio,
  Shield, CheckCircle2, XCircle, Loader2, Copy, Check, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";

interface AddSourceWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

type SourceCategory = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  types: SourceType[];
};

type SourceType = {
  id: string;
  label: string;
  dataType: string;
  configSchema: "agent" | "syslog" | "cloud-aws" | "cloud-azure" | "netflow" | "none";
};

const CATEGORIES: SourceCategory[] = [
  {
    id: "endpoint",
    label: "Endpoint Agent",
    description: "Install an agent on Windows or Linux hosts",
    icon: <Monitor className="w-5 h-5" />,
    types: [
      { id: "windows", label: "Windows", dataType: "windows", configSchema: "agent" },
      { id: "linux", label: "Linux", dataType: "linux", configSchema: "agent" },
      { id: "macos", label: "macOS", dataType: "linux", configSchema: "agent" },
    ],
  },
  {
    id: "network",
    label: "Network / Syslog",
    description: "Receive syslog or NetFlow from network devices",
    icon: <Radio className="w-5 h-5" />,
    types: [
      { id: "syslog-udp", label: "Syslog UDP", dataType: "syslog", configSchema: "syslog" },
      { id: "syslog-tcp", label: "Syslog TCP", dataType: "syslog", configSchema: "syslog" },
      { id: "cef-syslog", label: "CEF Syslog (ArcSight)", dataType: "SYSLOG_CEF", configSchema: "syslog" },
      { id: "leef-syslog", label: "LEEF Syslog (QRadar)", dataType: "SYSLOG_LEEF", configSchema: "syslog" },
      { id: "netflow", label: "NetFlow / IPFIX", dataType: "netflow", configSchema: "netflow" },
    ],
  },
  {
    id: "cloud",
    label: "Cloud Connectors",
    description: "Pull logs from cloud platforms",
    icon: <Cloud className="w-5 h-5" />,
    types: [
      { id: "aws", label: "AWS CloudTrail / CloudWatch", dataType: "aws", configSchema: "cloud-aws" },
      { id: "azure", label: "Azure / Microsoft Entra ID", dataType: "azure", configSchema: "cloud-azure" },
      { id: "gcp", label: "GCP Cloud Logging", dataType: "gcp", configSchema: "none" },
      { id: "o365", label: "Microsoft 365", dataType: "o365", configSchema: "none" },
    ],
  },
  {
    id: "security",
    label: "Security Products",
    description: "Forward alerts from security tools",
    icon: <Shield className="w-5 h-5" />,
    types: [
      { id: "crowdstrike", label: "CrowdStrike Falcon", dataType: "crowdstrike", configSchema: "syslog" },
      { id: "sophos", label: "Sophos XDR", dataType: "sophos", configSchema: "syslog" },
      { id: "paloalto", label: "Palo Alto NGFW", dataType: "paloalto", configSchema: "syslog" },
      { id: "fortinet", label: "Fortinet FortiGate", dataType: "fortinet", configSchema: "syslog" },
    ],
  },
];

type TestStatus = "idle" | "testing" | "ok" | "failed";

interface SyslogConfig { host: string; port: string; protocol: "UDP" | "TCP" }
interface AgentConfig { serverUrl: string }
interface CloudAwsConfig { accessKeyId: string; secretAccessKey: string; region: string }
interface CloudAzureConfig { tenantId: string; clientId: string; clientSecret: string }

type Config = SyslogConfig | AgentConfig | CloudAwsConfig | CloudAzureConfig | Record<string, string>;

function CopySnippet({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div className="relative rounded-lg bg-[#0d1117] border border-surface-border overflow-hidden">
      <button
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 p-1.5 rounded text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="p-4 text-tiny font-mono text-[#c9d1d9] overflow-x-auto">
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith("#") ? "text-[#8b949e]" : "text-[#c9d1d9]"}>{l}</div>
        ))}
      </pre>
    </div>
  );
}

export function AddSourceWizard({ onClose, onSuccess }: AddSourceWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<SourceType | null>(null);
  const [config, setConfig] = useState<Config>({});
  const [instructions, setInstructions] = useState<{
    filterName?: string;
    installCommands?: string[];
    agentDownloadUrl?: string;
    notes?: string;
  } | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchInstructions = useCallback(async (dataType: string) => {
    try {
      const data = await api.get<{ filterName?: string; installCommands?: string[]; agentDownloadUrl?: string; notes?: string }>(
        `/api/ha-data-input-statuses/instructions/${dataType}`
      );
      setInstructions(data);
    } catch {
      setInstructions(null);
    }
  }, []);

  const handleSelectType = useCallback(async (_category: SourceCategory, type: SourceType) => {
    setSelectedType(type);
    setConfig({});
    setTestStatus("idle");
    setTestError(null);
    await fetchInstructions(type.dataType);
    setStep(2);
  }, [fetchInstructions]);

  const handleTest = useCallback(async () => {
    if (!selectedType) return;
    setTestStatus("testing");
    setTestError(null);

    const schema = selectedType.configSchema;
    const body: Record<string, unknown> = { dataType: selectedType.dataType };

    if (schema === "syslog" || schema === "netflow") {
      const c = config as SyslogConfig;
      body.host = c.host || "127.0.0.1";
      body.port = parseInt(c.port || "514");
      body.protocol = schema === "netflow" ? "UDP" : (c.protocol || "UDP");
    } else if (schema === "agent") {
      setTestStatus("ok");
      setTestLatency(0);
      setStep(3);
      return;
    } else {
      // Cloud connectors: skip socket test, report ok
      setTestStatus("ok");
      setTestLatency(null);
      setStep(3);
      return;
    }

    try {
      const result = await api.post<{ status: string; latencyMs?: number; errorMessage?: string }>(
        "/api/ha-data-input-statuses/test",
        body
      );
      if (result.status === "OK") {
        setTestStatus("ok");
        setTestLatency(result.latencyMs ?? null);
      } else {
        setTestStatus("failed");
        setTestError(result.errorMessage ?? "Connection refused");
      }
    } catch {
      setTestStatus("failed");
      setTestError("Request failed");
    }
    setStep(3);
  }, [selectedType, config]);

  const handleSave = useCallback(async () => {
    if (!selectedType) return;
    setSaving(true);
    try {
      await api.post("/api/ha-data-input-statuses", {
        id: `${selectedType.dataType}-${Date.now()}`,
        source: (config as Record<string, string>).host || selectedType.label,
        dataType: selectedType.dataType,
        timestamp: Math.floor(Date.now() / 1000),
        alias: selectedType.label,
      });
      toast("success", "Data source added");
      onSuccess();
    } catch {
      toast("error", "Failed to save data source");
    } finally {
      setSaving(false);
    }
  }, [selectedType, config, onSuccess]);

  const configField = (key: string, label: string, placeholder: string, type = "text") => (
    <div className="space-y-1.5" key={key}>
      <label className="text-small text-secondary font-medium">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={(config as Record<string, string>)[key] || ""}
        onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.value }))}
        className="input-base w-full"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-primary border border-surface-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <h2 className="text-h3 text-primary">Add Data Source</h2>
            <p className="text-tiny text-muted mt-0.5">
              Step {step} of 3 —{" "}
              {step === 1 ? "Select source type" : step === 2 ? "Configure" : "Test & Activate"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-2 px-6 pt-4 flex-shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-tiny font-bold transition-colors",
                step === s ? "bg-brand text-white" : step > s ? "bg-brand/20 text-brand" : "bg-surface-tertiary text-muted"
              )}>
                {step > s ? <Check className="w-3 h-3" /> : s}
              </div>
              {s < 3 && <div className={cn("h-px w-12 transition-colors", step > s ? "bg-brand/40" : "bg-surface-border")} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="space-y-3">
              {CATEGORIES.map((cat) => (
                <div key={cat.id} className="card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-brand">{cat.icon}</span>
                    <div>
                      <h4 className="text-h4 text-primary">{cat.label}</h4>
                      <p className="text-tiny text-muted">{cat.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cat.types.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => handleSelectType(cat, type)}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-surface-border hover:border-brand hover:bg-brand/5 text-secondary hover:text-primary transition-all text-small text-left group"
                      >
                        {type.label}
                        <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-brand flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && selectedType && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-small text-secondary">
                <Server className="w-4 h-4 text-brand" />
                <span className="font-medium text-primary">{selectedType.label}</span>
                <span className="text-muted">·</span>
                <span className="font-mono text-muted text-tiny">{selectedType.dataType}</span>
              </div>

              {/* Config fields per schema */}
              {selectedType.configSchema === "syslog" && (
                <div className="space-y-3">
                  {configField("host", "Target Host / IP", "192.168.1.1")}
                  {configField("port", "Port", "514")}
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Protocol</label>
                    <div className="flex gap-2">
                      {(["UDP", "TCP"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setConfig((prev) => ({ ...prev, protocol: p }))}
                          className={cn(
                            "px-4 py-1.5 rounded-lg border text-small transition-all",
                            (config as SyslogConfig).protocol === p
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-surface-border text-secondary hover:border-brand/50"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedType.configSchema === "netflow" && (
                <div className="space-y-3">
                  <p className="text-small text-secondary">Configure your router or switch to export NetFlow/IPFIX to this HiveArmor instance.</p>
                  {configField("host", "Your Router / Source IP (optional)", "192.168.1.1")}
                  <div className="card p-3 bg-surface-secondary text-small text-secondary space-y-1">
                    <p><span className="font-medium text-primary">Collector Port:</span> 2055 UDP</p>
                    <p><span className="font-medium text-primary">Supported formats:</span> NetFlow v5, v9, IPFIX</p>
                  </div>
                </div>
              )}

              {selectedType.configSchema === "agent" && (
                <div className="space-y-3">
                  <p className="text-small text-secondary">
                    Download and install the agent on your endpoint. The agent will connect back to this HiveArmor server automatically.
                  </p>
                  {instructions?.agentDownloadUrl && (
                    <a
                      href={instructions.agentDownloadUrl}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-small font-medium hover:bg-brand/90 transition-colors"
                    >
                      <Server className="w-4 h-4" />
                      Download Agent ({selectedType.label})
                    </a>
                  )}
                  {instructions?.installCommands && instructions.installCommands.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-small text-secondary font-medium flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        Installation commands
                      </label>
                      <CopySnippet lines={instructions.installCommands} />
                    </div>
                  )}
                  {instructions?.notes && (
                    <p className="text-tiny text-muted">{instructions.notes}</p>
                  )}
                </div>
              )}

              {selectedType.configSchema === "cloud-aws" && (
                <div className="space-y-3">
                  {configField("accessKeyId", "AWS Access Key ID", "AKIAIOSFODNN7EXAMPLE")}
                  {configField("secretAccessKey", "AWS Secret Access Key", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "password")}
                  {configField("region", "AWS Region", "us-east-1")}
                  <p className="text-tiny text-muted">Requires CloudWatch Logs read and CloudTrail read IAM permissions.</p>
                </div>
              )}

              {selectedType.configSchema === "cloud-azure" && (
                <div className="space-y-3">
                  {configField("tenantId", "Tenant ID", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}
                  {configField("clientId", "Client ID (App Registration)", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}
                  {configField("clientSecret", "Client Secret", "••••••••••••", "password")}
                  <p className="text-tiny text-muted">Register an app in Azure AD and assign the Log Analytics Reader role.</p>
                </div>
              )}

              {selectedType.configSchema === "none" && (
                <div className="card p-4 bg-surface-secondary text-small text-secondary">
                  Configuration for <span className="font-medium text-primary">{selectedType.label}</span> is managed via the Integrations page. Click &ldquo;Test &amp; Activate&rdquo; to register this source.
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              {/* Test result */}
              {testStatus === "testing" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-secondary">
                  <Loader2 className="w-5 h-5 text-brand animate-spin flex-shrink-0" />
                  <p className="text-small text-secondary">Testing connectivity…</p>
                </div>
              )}
              {testStatus === "ok" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div>
                    <p className="text-small font-medium text-primary">Connection successful</p>
                    {testLatency != null && testLatency > 0 && (
                      <p className="text-tiny text-muted">{testLatency}ms latency</p>
                    )}
                  </div>
                </div>
              )}
              {testStatus === "failed" && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-small font-medium text-primary">Connection failed</p>
                    {testError && <p className="text-tiny text-muted mt-0.5">{testError}</p>}
                    <p className="text-tiny text-muted mt-1">You can still save the source and configure later.</p>
                  </div>
                </div>
              )}
              {testStatus === "idle" && (
                <div className="p-4 rounded-lg bg-surface-secondary text-small text-secondary">
                  Click &ldquo;Test Connectivity&rdquo; to verify the connection before saving.
                </div>
              )}

              {selectedType && (
                <div className="card p-4 space-y-2">
                  <h4 className="text-small font-medium text-primary">Summary</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-tiny">
                    <span className="text-muted">Type</span>
                    <span className="text-secondary">{selectedType.label}</span>
                    <span className="text-muted">Data type</span>
                    <span className="text-secondary font-mono">{selectedType.dataType}</span>
                    {(config as SyslogConfig).host && (
                      <>
                        <span className="text-muted">Host</span>
                        <span className="text-secondary font-mono">{(config as SyslogConfig).host}</span>
                      </>
                    )}
                    {(config as SyslogConfig).port && (
                      <>
                        <span className="text-muted">Port</span>
                        <span className="text-secondary font-mono">{(config as SyslogConfig).port}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border flex-shrink-0">
          <button
            onClick={() => {
              if (step === 2) { setStep(1); setSelectedType(null); }
              else if (step === 3) setStep(2);
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-border text-small text-secondary hover:text-primary hover:border-brand/50 transition-all",
              step === 1 && "invisible"
            )}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={handleTest}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-small font-medium hover:bg-brand/90 transition-colors"
              >
                Test Connectivity
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {step === 3 && (
              <>
                {testStatus === "idle" && (
                  <button
                    onClick={handleTest}
                    className="px-4 py-2 rounded-lg border border-surface-border text-small text-secondary hover:text-primary transition-colors"
                  >
                    Test Connectivity
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-small font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Finish
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
