"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import {
  AlertTriangle, FileText, Globe, Hash, Link2, Plus,
  X, Pin, Tag, Clock, Shield, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type EvidenceType = "alert" | "artifact" | "note" | "ioc" | "file" | "network";

export interface EvidenceCard {
  id: string;
  type: EvidenceType;
  title: string;
  body: string;
  tags: string[];
  severity?: "critical" | "high" | "medium" | "low";
  timestamp?: number;
  x: number;
  y: number;
  pinned?: boolean;
  linkedTo?: string[];
}

// ── Metadata ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<EvidenceType, { label: string; icon: ReactNode; accent: string; bg: string; border: string }> = {
  alert:    { label: "Alert",    icon: <AlertTriangle className="w-3.5 h-3.5" />, accent: "text-critical",     bg: "bg-critical/5",     border: "border-critical/30" },
  artifact: { label: "Artifact", icon: <Hash className="w-3.5 h-3.5" />,         accent: "text-brand-accent", bg: "bg-brand-accent/5", border: "border-brand-accent/30" },
  note:     { label: "Note",     icon: <FileText className="w-3.5 h-3.5" />,      accent: "text-warning",      bg: "bg-warning/5",      border: "border-warning/30" },
  ioc:      { label: "IOC",      icon: <Shield className="w-3.5 h-3.5" />,        accent: "text-high",         bg: "bg-high/5",         border: "border-high/30" },
  file:     { label: "File",     icon: <FileText className="w-3.5 h-3.5" />,      accent: "text-secondary",    bg: "bg-surface-tertiary", border: "border-surface-border" },
  network:  { label: "Network",  icon: <Globe className="w-3.5 h-3.5" />,         accent: "text-brand",        bg: "bg-brand/5",        border: "border-brand/30" },
};

const SEV_COLOR: Record<string, string> = {
  critical: "bg-critical/15 text-critical",
  high:     "bg-high/15 text-high",
  medium:   "bg-medium/15 text-medium",
  low:      "bg-low/15 text-low",
};

function timeLabel(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Demo data ─────────────────────────────────────────────────────────────────

export const DEMO_EVIDENCE: EvidenceCard[] = [
  {
    id: "ev1", type: "alert", title: "Brute Force Detected",
    body: "141 failed SSH logins from 192.168.4.21 in 2 minutes targeting srv-db-01.",
    tags: ["ssh", "brute-force"], severity: "critical",
    timestamp: Date.now() - 7200000, x: 60, y: 60, pinned: true,
    linkedTo: ["ev2", "ev3"],
  },
  {
    id: "ev2", type: "ioc", title: "Malicious IP: 192.168.4.21",
    body: "VirusTotal: 38/95 engines flagged. Tags: botnet, scanner. ASN: AS12345 (Suspicious ISP).",
    tags: ["ip", "vt-flagged"], x: 340, y: 40, linkedTo: ["ev1"],
  },
  {
    id: "ev3", type: "artifact", title: "SSH Auth Log Excerpt",
    body: "Failed password for root from 192.168.4.21 port 49212 ssh2\nFailed password for admin …",
    tags: ["log", "ssh"], timestamp: Date.now() - 7100000, x: 60, y: 280,
    linkedTo: ["ev1"],
  },
  {
    id: "ev4", type: "alert", title: "Privilege Escalation: srv-db-01",
    body: "Suspicious sudo execution: sudo /bin/bash by user 'backup'. No prior pattern.",
    tags: ["privesc", "sudo"], severity: "high",
    timestamp: Date.now() - 6500000, x: 580, y: 160, linkedTo: ["ev5"],
  },
  {
    id: "ev5", type: "network", title: "Lateral Move: srv-db-01 → srv-app-02",
    body: "Unusual SMB connection from srv-db-01 (10.0.0.12) to srv-app-02 (10.0.0.14) on port 445.",
    tags: ["lateral", "smb"], timestamp: Date.now() - 6200000, x: 580, y: 360,
  },
  {
    id: "ev6", type: "note", title: "Analyst Note",
    body: "Attacker appears to have pivoted from external IP → db server → app server. Check for data exfil next.",
    tags: ["analyst"], x: 320, y: 280,
  },
];

// ── Card component ────────────────────────────────────────────────────────────

interface CardProps {
  card: EvidenceCard;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function EvidenceCardComp({ card, selected, onSelect, onMove, onDelete, onTogglePin }: CardProps) {
  const dragOffset = useRef({ x: 0, y: 0 });
  const meta = TYPE_META[card.type];
  const [expanded, setExpanded] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    onSelect(card.id);
    const startX = e.clientX - card.x;
    const startY = e.clientY - card.y;
    dragOffset.current = { x: startX, y: startY };

    const onMove_ = (me: MouseEvent) => {
      onMove(card.id, me.clientX - dragOffset.current.x, me.clientY - dragOffset.current.y);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove_);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove_);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ left: card.x, top: card.y, width: 240 }}
      className={cn(
        "absolute rounded-xl border shadow-sm cursor-grab active:cursor-grabbing select-none",
        "bg-surface-secondary transition-shadow",
        meta.border,
        selected && "ring-2 ring-brand shadow-glow z-10",
        card.pinned && "ring-1 ring-warning/40"
      )}
    >
      {/* Header */}
      <div className={cn("flex items-start gap-2 px-3 pt-2.5 pb-2 rounded-t-xl", meta.bg)}>
        <span className={cn("shrink-0 mt-0.5", meta.accent)}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-small font-semibold text-primary leading-tight">{card.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-tiny font-medium", meta.accent)}>{meta.label}</span>
            {card.severity && (
              <span className={cn("text-tiny px-1.5 py-0 rounded-full font-medium", SEV_COLOR[card.severity])}>
                {card.severity}
              </span>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onTogglePin(card.id)}
            title={card.pinned ? "Unpin" : "Pin"}
            className={cn("w-5 h-5 rounded flex items-center justify-center hover:bg-surface-tertiary", card.pinned ? "text-warning" : "text-muted")}
          >
            <Pin className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-critical hover:bg-critical/10"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className={cn("text-tiny text-muted font-mono whitespace-pre-wrap leading-relaxed", !expanded && "line-clamp-3")}>
          {card.body}
        </p>
        {card.body.length > 120 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 text-tiny text-brand mt-1"
          >
            {expanded ? "less" : "more"} <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Footer */}
      {(card.tags.length > 0 || card.timestamp) && (
        <div className="px-3 pb-2.5 flex items-center justify-between gap-2">
          <div className="flex gap-1 flex-wrap">
            {card.tags.slice(0, 3).map((t) => (
              <span key={t} className="flex items-center gap-0.5 text-tiny text-muted bg-surface-tertiary rounded px-1.5 py-0.5">
                <Tag className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
          {card.timestamp && (
            <span className="text-tiny text-muted shrink-0 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{timeLabel(card.timestamp)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── SVG edge renderer ─────────────────────────────────────────────────────────

function EdgeLines({ cards }: { cards: EvidenceCard[] }) {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const c of cards) {
    if (!c.linkedTo) continue;
    for (const targetId of c.linkedTo) {
      const target = cardMap.get(targetId);
      if (!target) continue;
      const key = [c.id, targetId].sort().join("--");
      if (lines.some((l) => l.key === key)) continue;
      lines.push({
        key,
        x1: c.x + 120,
        y1: c.y + 30,
        x2: target.x + 120,
        y2: target.y + 30,
      });
    }
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--brand-primary)" opacity="0.5" />
        </marker>
      </defs>
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="var(--brand-primary)"
          strokeWidth="1.5"
          strokeDasharray="5 3"
          opacity="0.4"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
}

// ── Add Evidence Modal ────────────────────────────────────────────────────────

interface AddEvidenceModalProps {
  onAdd: (card: Omit<EvidenceCard, "id" | "x" | "y">) => void;
  onClose: () => void;
}

function AddEvidenceModal({ onAdd, onClose }: AddEvidenceModalProps) {
  const [type, setType] = useState<EvidenceType>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      type,
      title: title.trim(),
      body: body.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      timestamp: Date.now(),
    });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/4 z-[70] mx-auto max-w-md bg-surface-primary rounded-xl border border-surface-border shadow-drawer animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h3 className="text-small font-semibold text-primary">Add Evidence</h3>
          <button onClick={onClose} className="toolbar-btn"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Type */}
          <div className="space-y-1">
            <label className="text-tiny text-muted">Type</label>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(TYPE_META) as EvidenceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-tiny border transition-colors",
                    type === t
                      ? `${TYPE_META[t].bg} ${TYPE_META[t].border} ${TYPE_META[t].accent}`
                      : "border-surface-border text-muted hover:bg-surface-tertiary"
                  )}
                >
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-tiny text-muted">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evidence title…"
              className="input-base w-full text-small"
            />
          </div>
          <div className="space-y-1">
            <label className="text-tiny text-muted">Details</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Description, raw data, notes…"
              className="input-base w-full text-small font-mono resize-none h-24"
            />
          </div>
          <div className="space-y-1">
            <label className="text-tiny text-muted">Tags (comma separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="malware, lateral, host"
              className="input-base w-full text-small"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-border">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!title.trim()} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

interface InvestigationEvidenceBoardProps {
  initialCards?: EvidenceCard[];
  showAddModal?: boolean;
  onCloseAddModal?: () => void;
}

export function InvestigationEvidenceBoard({
  initialCards = DEMO_EVIDENCE,
  showAddModal,
  onCloseAddModal,
}: InvestigationEvidenceBoardProps) {
  const [cards, setCards] = useState<EvidenceCard[]>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const boardRef = useRef<HTMLDivElement>(null);

  const moveCard = useCallback((id: string, x: number, y: number) => {
    setCards((cs) => cs.map((c) => c.id === id ? { ...c, x: Math.max(0, x), y: Math.max(0, y) } : c));
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((cs) => cs.filter((c) => c.id !== id));
    setSelectedId(null);
  }, []);

  const togglePin = useCallback((id: string) => {
    setCards((cs) => cs.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, []);

  const addCard = useCallback((partial: Omit<EvidenceCard, "id" | "x" | "y">) => {
    const id = `ev-${Date.now()}`;
    setCards((cs) => [...cs, { ...partial, id, x: 60 + (cs.length % 4) * 60, y: 60 + (cs.length % 3) * 80 }]);
  }, []);

  const visible = typeFilter === "all"
    ? cards
    : cards.filter((c) => c.type === typeFilter);

  const typeCounts = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-surface-border shrink-0 bg-surface-primary">
        <Link2 className="w-3.5 h-3.5 text-muted mr-1" />
        <button
          onClick={() => setTypeFilter("all")}
          className={cn(
            "px-2 py-1 rounded text-tiny transition-colors",
            typeFilter === "all" ? "bg-surface-tertiary text-primary" : "text-muted hover:text-secondary"
          )}
        >
          All <span className="ml-1 text-muted">({cards.length})</span>
        </button>
        {(Object.keys(TYPE_META) as EvidenceType[]).map((t) => {
          const count = typeCounts[t] ?? 0;
          if (count === 0) return null;
          const m = TYPE_META[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-tiny transition-colors",
                typeFilter === t ? `${m.bg} ${m.accent}` : "text-muted hover:text-secondary"
              )}
            >
              {m.icon} {m.label}
              <span className="ml-0.5 text-muted">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div
        ref={boardRef}
        className="flex-1 relative overflow-auto bg-surface-ground"
        style={{
          backgroundImage: "radial-gradient(circle, var(--surface-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          minHeight: 600,
          minWidth: 900,
        }}
        onClick={() => setSelectedId(null)}
      >
        <EdgeLines cards={visible} />
        {visible.map((card) => (
          <EvidenceCardComp
            key={card.id}
            card={card}
            selected={selectedId === card.id}
            onSelect={setSelectedId}
            onMove={moveCard}
            onDelete={deleteCard}
            onTogglePin={togglePin}
          />
        ))}
      </div>

      {showAddModal && (
        <AddEvidenceModal onAdd={addCard} onClose={onCloseAddModal ?? (() => {})} />
      )}
    </div>
  );
}
