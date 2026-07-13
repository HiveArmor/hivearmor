"use client";

import { useState, useRef, type ReactNode } from "react";
import {
  Play, Square, Save, Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize2, Zap, GitBranch, PlayCircle, Brain, Layers,
  Plus, History, PenLine, CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeKind } from "./playbook-nodes";

interface NodePaletteItem {
  kind: NodeKind;
  label: string;
  icon: ReactNode;
  color: string;
}

const PALETTE: NodePaletteItem[] = [
  { kind: "trigger",   label: "Trigger",   icon: <Zap className="w-3.5 h-3.5" />,        color: "text-yellow-400" },
  { kind: "condition", label: "Condition", icon: <GitBranch className="w-3.5 h-3.5" />,  color: "text-brand-accent" },
  { kind: "action",    label: "Action",    icon: <PlayCircle className="w-3.5 h-3.5" />, color: "text-brand" },
  { kind: "ai",        label: "AI",        icon: <Brain className="w-3.5 h-3.5" />,      color: "text-purple-400" },
  { kind: "subflow",   label: "Subflow",   icon: <Layers className="w-3.5 h-3.5" />,     color: "text-green-400" },
];

export type BuilderView = "build" | "execute";

interface PlaybookToolbarProps {
  name: string;
  onNameChange: (n: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onSave?: () => void;
  onRun?: () => void;
  onStop?: () => void;
  onAddNode?: (kind: NodeKind) => void;
  view?: BuilderView;
  onViewChange?: (v: BuilderView) => void;
  running?: boolean;
  saving?: boolean;
  saveLabel?: string;
}

export function PlaybookToolbar({
  name,
  onNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitView,
  onSave,
  onRun,
  onStop,
  onAddNode,
  view = "build",
  onViewChange,
  running,
  saving,
  saveLabel,
}: PlaybookToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(name);
  const nameRef = useRef<HTMLInputElement>(null);

  const commitName = () => {
    setEditing(false);
    onNameChange(localName.trim() || "Untitled Playbook");
  };

  return (
    <div className="flex items-center gap-2 px-3 h-12 bg-surface-primary border-b border-surface-border shrink-0 select-none">
      {/* ── Playbook name ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mr-2 min-w-0">
        {editing ? (
          <input
            ref={nameRef}
            autoFocus
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setLocalName(name); setEditing(false); }
            }}
            className="input-base text-small font-semibold px-2 py-1 max-w-[240px]"
          />
        ) : (
          <button
            onClick={() => { setLocalName(name); setEditing(true); }}
            className="flex items-center gap-1.5 text-small font-semibold text-primary hover:text-brand transition-colors group"
            title="Click to rename"
          >
            <span className="truncate max-w-[200px]">{name}</span>
            <PenLine className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        )}
      </div>

      <div className="w-px h-5 bg-surface-border" />

      {/* ── Add node palette ────────────────────────────────── */}
      {view === "build" && (
        <>
          <div className="flex items-center gap-0.5">
            <span className="text-tiny text-muted mr-1">Add:</span>
            {PALETTE.map((p) => (
              <button
                key={p.kind}
                onClick={() => onAddNode?.(p.kind)}
                title={`Add ${p.label} node`}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded text-tiny transition-colors",
                  "hover:bg-surface-tertiary",
                  p.color
                )}
              >
                {p.icon}
                <span className="hidden lg:inline text-muted">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-surface-border" />
        </>
      )}

      {/* ── Undo / Redo ─────────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          className="toolbar-btn disabled:opacity-30"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          className="toolbar-btn disabled:opacity-30"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-surface-border" />

      {/* ── Zoom controls ───────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <button onClick={onZoomIn}  title="Zoom in"  className="toolbar-btn"><ZoomIn  className="w-3.5 h-3.5" /></button>
        <button onClick={onZoomOut} title="Zoom out" className="toolbar-btn"><ZoomOut className="w-3.5 h-3.5" /></button>
        <button onClick={onFitView} title="Fit view (⇧1)" className="toolbar-btn"><Maximize2 className="w-3.5 h-3.5" /></button>
      </div>

      {/* ── Spacer ──────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── View toggle ─────────────────────────────────────── */}
      <div className="flex items-center rounded-lg border border-surface-border overflow-hidden">
        <button
          onClick={() => onViewChange?.("build")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-tiny transition-colors",
            view === "build"
              ? "bg-surface-tertiary text-primary"
              : "text-muted hover:text-secondary"
          )}
        >
          <Plus className="w-3 h-3" /> Build
        </button>
        <button
          onClick={() => onViewChange?.("execute")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-tiny transition-colors border-l border-surface-border",
            view === "execute"
              ? "bg-surface-tertiary text-primary"
              : "text-muted hover:text-secondary"
          )}
        >
          <History className="w-3 h-3" /> Execute
        </button>
      </div>

      <div className="w-px h-5 bg-surface-border" />

      {/* ── Save ───────────────────────────────────────────── */}
      <button
        onClick={onSave}
        disabled={saving}
        className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50 min-w-[70px]"
      >
        {saving
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
          : saveLabel === "saved"
            ? <><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Saved</>
            : <><Save className="w-3.5 h-3.5" /> Save</>
        }
      </button>

      {/* ── Run / Stop ─────────────────────────────────────── */}
      {running ? (
        <button
          onClick={onStop}
          className="btn btn-sm gap-1.5 bg-critical/15 text-critical border border-critical/30 hover:bg-critical/25"
        >
          <Square className="w-3.5 h-3.5" /> Stop
        </button>
      ) : (
        <button
          onClick={onRun}
          className="btn btn-sm btn-primary gap-1.5"
        >
          <Play className="w-3.5 h-3.5" /> Run
        </button>
      )}
    </div>
  );
}
