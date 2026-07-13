"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Zap, GitBranch, PlayCircle, Brain, Layers,
  CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared types ──────────────────────────────────────────────────────────────

export type NodeKind = "trigger" | "condition" | "action" | "ai" | "subflow";
export type ExecStatus = "idle" | "running" | "success" | "error" | "skipped";

export interface PlaybookNodeData {
  kind: NodeKind;
  label: string;
  sublabel?: string;
  status?: ExecStatus;
  // kind-specific fields
  triggerType?: string;
  conditionField?: string;
  conditionOp?: string;
  conditionValue?: string;
  actionIntegration?: string;
  actionName?: string;
  aiModel?: string;
  aiPrompt?: string;
  subflowRef?: string;
  [key: string]: unknown;
}

// ── Status ring ───────────────────────────────────────────────────────────────

function StatusRing({ status }: { status?: ExecStatus }) {
  if (!status || status === "idle") return null;
  return (
    <div className="absolute -top-1.5 -right-1.5 z-10">
      {status === "running"  && <Loader2    className="w-4 h-4 text-brand animate-spin" />}
      {status === "success"  && <CheckCircle2 className="w-4 h-4 text-success" />}
      {status === "error"    && <XCircle     className="w-4 h-4 text-critical" />}
      {status === "skipped"  && <Clock       className="w-4 h-4 text-muted" />}
    </div>
  );
}

// ── Node style config ─────────────────────────────────────────────────────────

const NODE_META: Record<NodeKind, {
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  headerBg: string;
}> = {
  trigger:   {
    icon: <Zap className="w-4 h-4" />,
    color: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-surface-secondary",
    headerBg: "bg-yellow-500/10",
  },
  condition: {
    icon: <GitBranch className="w-4 h-4" />,
    color: "text-brand-accent",
    border: "border-brand-accent/40",
    bg: "bg-surface-secondary",
    headerBg: "bg-brand-accent/10",
  },
  action:    {
    icon: <PlayCircle className="w-4 h-4" />,
    color: "text-brand",
    border: "border-brand/40",
    bg: "bg-surface-secondary",
    headerBg: "bg-brand/10",
  },
  ai:        {
    icon: <Brain className="w-4 h-4" />,
    color: "text-purple-400",
    border: "border-purple-500/40",
    bg: "bg-surface-secondary",
    headerBg: "bg-purple-500/10",
  },
  subflow:   {
    icon: <Layers className="w-4 h-4" />,
    color: "text-green-400",
    border: "border-green-500/40",
    bg: "bg-surface-secondary",
    headerBg: "bg-green-500/10",
  },
};

// ── Generic base node ─────────────────────────────────────────────────────────

function BaseNode({ data, selected }: NodeProps<PlaybookNodeData>) {
  const meta = NODE_META[data.kind as NodeKind];
  const hasInput  = data.kind !== "trigger";
  const hasOutput = true;
  const hasBranch = data.kind === "condition";

  return (
    <div
      className={cn(
        "relative rounded-xl border min-w-[180px] max-w-[220px] overflow-hidden transition-shadow",
        meta.border,
        meta.bg,
        selected ? "shadow-glow ring-1 ring-brand/50" : "shadow-sm",
        data.status === "running" && "animate-live-glow",
        data.status === "error"   && "ring-1 ring-critical/50",
      )}
    >
      <StatusRing status={data.status} />

      {/* Top handle (input) */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-surface-border !border-2 !border-brand/60 !rounded-full hover:!bg-brand transition-colors"
        />
      )}

      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2", meta.headerBg)}>
        <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-small font-semibold text-primary leading-none truncate">{data.label}</p>
          {data.sublabel && (
            <p className="text-tiny text-muted truncate mt-0.5">{data.sublabel}</p>
          )}
        </div>
      </div>

      {/* Body — kind-specific preview */}
      <div className="px-3 py-2 text-tiny text-muted space-y-0.5">
        {data.kind === "trigger"   && data.triggerType  && <span className="font-mono">{data.triggerType}</span>}
        {data.kind === "condition" && data.conditionField && (
          <span className="font-mono">{data.conditionField} {data.conditionOp} {String(data.conditionValue ?? "")}</span>
        )}
        {data.kind === "action"    && data.actionIntegration && (
          <span>{data.actionIntegration} → {data.actionName}</span>
        )}
        {data.kind === "ai"        && data.aiModel     && <span>{data.aiModel}</span>}
        {data.kind === "subflow"   && data.subflowRef  && <span>{data.subflowRef}</span>}
      </div>

      {/* Bottom handle (main output) */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out"
          className="!w-3 !h-3 !bg-surface-border !border-2 !border-brand/60 !rounded-full hover:!bg-brand transition-colors"
        />
      )}

      {/* True/False branch handles for condition nodes */}
      {hasBranch && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "50%" }}
            className="!w-3 !h-3 !bg-success/60 !border-2 !border-success !rounded-full"
          />
          <Handle
            type="source"
            position={Position.Left}
            id="false"
            style={{ top: "50%" }}
            className="!w-3 !h-3 !bg-critical/60 !border-2 !border-critical !rounded-full"
          />
          {/* Branch labels */}
          <div className="absolute right-[-28px] top-1/2 -translate-y-1/2 text-tiny text-success font-medium">T</div>
          <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-tiny text-critical font-medium">F</div>
        </>
      )}
    </div>
  );
}

// Export a single memoized node component — React Flow maps by nodeTypes key
export const PlaybookNode = memo(BaseNode);

// nodeTypes map for ReactFlow
export const PLAYBOOK_NODE_TYPES = {
  trigger:   PlaybookNode,
  condition: PlaybookNode,
  action:    PlaybookNode,
  ai:        PlaybookNode,
  subflow:   PlaybookNode,
};
