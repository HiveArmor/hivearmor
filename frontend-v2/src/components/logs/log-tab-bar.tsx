"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogTab } from "@/hooks/use-log-tabs";

interface LogTabBarProps {
  tabs: LogTab[];
  activeId: string;
  canAddTab: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
}

function TabItem({
  tab,
  active,
  onSelect,
  onRemove,
  onRename,
  showClose,
}: {
  tab: LogTab;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (label: string) => void;
  showClose: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = useCallback(() => {
    const trimmed = draft.trim();
    onRename(trimmed.length > 0 ? trimmed : tab.label);
    setDraft(trimmed.length > 0 ? trimmed : tab.label);
    setEditing(false);
  }, [draft, tab.label, onRename]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  // Keep draft in sync if label changes externally (e.g. after add)
  useEffect(() => {
    if (!editing) setDraft(tab.label);
  }, [tab.label, editing]);

  return (
    <div
      className={cn(
        "group relative flex items-center shrink-0 h-8 border-r border-surface-border transition-colors",
        active
          ? "bg-surface-primary border-b-2 border-b-brand text-primary"
          : "bg-surface-secondary text-muted hover:bg-surface-tertiary hover:text-secondary"
      )}
      style={{ minWidth: 100, maxWidth: 180 }}
    >
      {/* Tab click target */}
      <button
        onClick={onSelect}
        onDoubleClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
        className="flex-1 min-w-0 h-full flex items-center pl-3 pr-1 text-tiny font-medium overflow-hidden"
        title={`${tab.label} — double-click to rename`}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setDraft(tab.label); setEditing(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-tiny text-primary outline-none border-b border-brand/60 font-medium"
            maxLength={32}
          />
        ) : (
          <span className="truncate">{tab.label}</span>
        )}
      </button>

      {/* Close button */}
      {showClose && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={cn(
            "shrink-0 w-4 h-4 mr-1 flex items-center justify-center rounded transition-opacity",
            "opacity-0 group-hover:opacity-100",
            active && "opacity-60 hover:opacity-100",
            "hover:bg-surface-border text-muted hover:text-critical"
          )}
          title="Close tab"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export function LogTabBar({
  tabs,
  activeId,
  canAddTab,
  onSelect,
  onAdd,
  onRemove,
  onRename,
}: LogTabBarProps) {
  return (
    <div className="flex items-end h-8 bg-surface-secondary border-b border-surface-border overflow-x-auto scrollbar-none">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          onSelect={() => onSelect(tab.id)}
          onRemove={() => onRemove(tab.id)}
          onRename={(label) => onRename(tab.id, label)}
          showClose={tabs.length > 1}
        />
      ))}

      {/* Add tab button */}
      {canAddTab && (
        <button
          onClick={onAdd}
          className="shrink-0 w-8 h-8 flex items-center justify-center text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
          title="New tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
