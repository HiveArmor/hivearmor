"use client";

import { useState, useEffect } from "react";
import {
  X, Zap, GitBranch, PlayCircle, Brain, Layers, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybookNodeData, NodeKind } from "./playbook-nodes";

const TRIGGER_TYPES = [
  "alert.created", "alert.severity_changed", "alert.status_changed",
  "incident.created", "schedule.cron", "webhook.inbound", "manual",
];

const CONDITION_OPS = ["==", "!=", ">", ">=", "<", "<=", "contains", "not_contains", "matches_regex"];

const INTEGRATIONS = [
  { id: "firewall",   label: "Firewall" },
  { id: "edr",        label: "EDR / Endpoint" },
  { id: "siem",       label: "SIEM / Log" },
  { id: "ticketing",  label: "Ticketing (Jira/ServiceNow)" },
  { id: "messaging",  label: "Messaging (Slack/Teams)" },
  { id: "email",      label: "Email" },
  { id: "threat-intel", label: "Threat Intel (VT/Shodan)" },
  { id: "ad",         label: "Active Directory" },
];

const INTEGRATION_ACTIONS: Record<string, string[]> = {
  firewall:     ["block_ip", "unblock_ip", "create_acl_rule", "delete_acl_rule"],
  edr:          ["isolate_host", "unisolate_host", "kill_process", "delete_file", "run_scan"],
  siem:         ["create_log_entry", "enrich_alert", "tag_alert"],
  ticketing:    ["create_ticket", "update_ticket", "close_ticket", "add_comment"],
  messaging:    ["send_message", "create_channel", "post_attachment"],
  email:        ["send_email", "send_email_with_attachment"],
  "threat-intel": ["query_ip", "query_hash", "query_domain", "query_url"],
  ad:           ["disable_user", "enable_user", "reset_password", "add_to_group", "remove_from_group"],
};

const AI_MODELS = [
  "gpt-4o", "claude-sonnet-5", "gemini-pro", "llama-3.1-70b",
];

interface PlaybookConfigPanelProps {
  nodeId: string | null;
  data: PlaybookNodeData | null;
  onUpdate: (nodeId: string, data: Partial<PlaybookNodeData>) => void;
  onClose: () => void;
}

function SelectField({
  label, value, options, onChange,
}: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="space-y-1">
      <label className="text-tiny text-muted">{label}</label>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-small text-secondary transition-colors text-left",
            "bg-surface-tertiary border-surface-border hover:border-surface-border-focus"
          )}
        >
          <span className="truncate">{current?.label ?? "Select…"}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-full card shadow-dropdown py-1 max-h-48 overflow-y-auto animate-scale-in">
              {options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-small transition-colors",
                    value === o.value ? "text-brand bg-brand-subtle" : "text-secondary hover:bg-surface-tertiary"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, mono, multiline,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-tiny text-muted">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("input-base w-full text-small resize-none h-24", mono && "font-mono")}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("input-base w-full text-small", mono && "font-mono")}
        />
      )}
    </div>
  );
}

const KIND_ICONS: Record<NodeKind, React.ReactNode> = {
  trigger:   <Zap className="w-4 h-4 text-yellow-400" />,
  condition: <GitBranch className="w-4 h-4 text-brand-accent" />,
  action:    <PlayCircle className="w-4 h-4 text-brand" />,
  ai:        <Brain className="w-4 h-4 text-purple-400" />,
  subflow:   <Layers className="w-4 h-4 text-green-400" />,
};

export function PlaybookConfigPanel({ nodeId, data, onUpdate, onClose }: PlaybookConfigPanelProps) {
  const [localData, setLocalData] = useState<PlaybookNodeData | null>(data);

  // Sync when selection changes
  useEffect(() => { setLocalData(data); }, [data]);

  if (!nodeId || !localData) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6">
        <div className="w-12 h-12 rounded-full bg-surface-tertiary flex items-center justify-center">
          <PlayCircle className="w-6 h-6 text-muted" />
        </div>
        <p className="text-small text-muted text-center">Select a node to configure it</p>
      </div>
    );
  }

  const patch = (partial: Partial<PlaybookNodeData>) => {
    const next = { ...localData, ...partial };
    setLocalData(next);
    onUpdate(nodeId, partial);
  };

  const actions = INTEGRATION_ACTIONS[localData.actionIntegration ?? ""] ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border shrink-0">
        {KIND_ICONS[localData.kind]}
        <div className="flex-1 min-w-0">
          <p className="text-small font-semibold text-primary capitalize">{localData.kind} Node</p>
          <p className="text-tiny text-muted truncate">{localData.label}</p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label (always) */}
        <TextField
          label="Node label"
          value={localData.label}
          onChange={(v) => patch({ label: v })}
          placeholder="Describe this step…"
        />

        {/* ── Trigger ── */}
        {localData.kind === "trigger" && (
          <>
            <SelectField
              label="Trigger event"
              value={localData.triggerType ?? ""}
              options={TRIGGER_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(v) => patch({ triggerType: v })}
            />
            <TextField
              label="Filter expression (optional)"
              value={(localData.filterExpr as string) ?? ""}
              onChange={(v) => patch({ filterExpr: v })}
              placeholder='severity >= 7 AND category == "malware"'
              mono
            />
          </>
        )}

        {/* ── Condition ── */}
        {localData.kind === "condition" && (
          <>
            <TextField
              label="Field"
              value={localData.conditionField ?? ""}
              onChange={(v) => patch({ conditionField: v })}
              placeholder="alert.severity"
              mono
            />
            <SelectField
              label="Operator"
              value={localData.conditionOp ?? "=="}
              options={CONDITION_OPS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => patch({ conditionOp: v })}
            />
            <TextField
              label="Value"
              value={localData.conditionValue ?? ""}
              onChange={(v) => patch({ conditionValue: v })}
              placeholder="critical"
              mono
            />
          </>
        )}

        {/* ── Action ── */}
        {localData.kind === "action" && (
          <>
            <SelectField
              label="Integration"
              value={localData.actionIntegration ?? ""}
              options={INTEGRATIONS.map((i) => ({ value: i.id, label: i.label }))}
              onChange={(v) => patch({ actionIntegration: v, actionName: "" })}
            />
            {localData.actionIntegration && (
              <SelectField
                label="Action"
                value={localData.actionName ?? ""}
                options={actions.map((a) => ({ value: a, label: a.replace(/_/g, " ") }))}
                onChange={(v) => patch({ actionName: v })}
              />
            )}
            <TextField
              label="Parameters (JSON)"
              value={(localData.actionParams as string) ?? "{}"}
              onChange={(v) => patch({ actionParams: v })}
              placeholder='{"target_ip": "{{alert.adversary.ip}}"}'
              mono
              multiline
            />
          </>
        )}

        {/* ── AI ── */}
        {localData.kind === "ai" && (
          <>
            <SelectField
              label="Model"
              value={localData.aiModel ?? "claude-sonnet-5"}
              options={AI_MODELS.map((m) => ({ value: m, label: m }))}
              onChange={(v) => patch({ aiModel: v })}
            />
            <TextField
              label="System prompt"
              value={(localData.aiSystemPrompt as string) ?? ""}
              onChange={(v) => patch({ aiSystemPrompt: v })}
              placeholder="You are a SOC analyst. Analyze this alert and decide…"
              multiline
            />
            <TextField
              label="User prompt template"
              value={localData.aiPrompt ?? ""}
              onChange={(v) => patch({ aiPrompt: v })}
              placeholder="Alert details: {{alert | json}}"
              multiline
            />
            <TextField
              label="Output variable"
              value={(localData.aiOutputVar as string) ?? "ai_result"}
              onChange={(v) => patch({ aiOutputVar: v })}
              placeholder="ai_result"
              mono
            />
          </>
        )}

        {/* ── Subflow ── */}
        {localData.kind === "subflow" && (
          <>
            <TextField
              label="Playbook reference"
              value={localData.subflowRef ?? ""}
              onChange={(v) => patch({ subflowRef: v })}
              placeholder="playbook-isolate-host"
              mono
            />
            <TextField
              label="Input mapping (JSON)"
              value={(localData.subflowInputs as string) ?? "{}"}
              onChange={(v) => patch({ subflowInputs: v })}
              placeholder='{"alert": "{{alert}}"}'
              mono
              multiline
            />
          </>
        )}

        {/* Timeout (all types) */}
        <TextField
          label="Timeout (seconds)"
          value={(localData.timeout as string) ?? ""}
          onChange={(v) => patch({ timeout: v })}
          placeholder="30"
          mono
        />

        {/* On failure */}
        <SelectField
          label="On failure"
          value={(localData.onFailure as string) ?? "continue"}
          options={[
            { value: "continue", label: "Continue" },
            { value: "abort",    label: "Abort playbook" },
            { value: "retry",    label: "Retry once" },
            { value: "skip",     label: "Skip & continue" },
          ]}
          onChange={(v) => patch({ onFailure: v })}
        />
      </div>
    </div>
  );
}
