"use client";

import { useReducer, useEffect, useCallback } from "react";
import { DEFAULT_TIME_RANGE, type TimeRange } from "@/components/logs/log-time-picker";
import type { SyntaxMode } from "@/components/logs/log-query-bar";
import type { ElasticFilter } from "@/services/elastic.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LogTab {
  id: string;
  label: string;
  query: string;
  syntaxMode: SyntaxMode;
  indexPattern: string;
  timeRange: TimeRange;
  activeFilters: ElasticFilter[];
  selectedFields: string[];
}

export type LogTabAction =
  | { type: "ADD_TAB" }
  | { type: "REMOVE_TAB"; id: string }
  | { type: "SELECT_TAB"; id: string }
  | { type: "RENAME_TAB"; id: string; label: string }
  | { type: "UPDATE_TAB"; id: string; patch: Partial<Omit<LogTab, "id" | "label">> };

interface LogTabsState {
  tabs: LogTab[];
  activeId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TABS = 8;
const STORAGE_KEY = "hivearmor_log_tabs";
const DEFAULT_INDEX = "v3-hive-*";
const DEFAULT_FIELDS = ["message", "severity", "source.ip", "event.action", "host.name"];

function newTab(index = 1): LogTab {
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: `Tab ${index}`,
    query: "",
    syntaxMode: "kql",
    indexPattern: DEFAULT_INDEX,
    timeRange: DEFAULT_TIME_RANGE,
    activeFilters: [],
    selectedFields: DEFAULT_FIELDS,
  };
}

function defaultState(): LogTabsState {
  const first = newTab(1);
  return { tabs: [first], activeId: first.id };
}

// ── Persistence ───────────────────────────────────────────────────────────────

function loadState(): LogTabsState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as LogTabsState;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return defaultState();
    // Validate activeId still exists
    const activeExists = parsed.tabs.some((t) => t.id === parsed.activeId);
    return {
      tabs: parsed.tabs,
      activeId: activeExists ? parsed.activeId : parsed.tabs[0].id,
    };
  } catch {
    return defaultState();
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: LogTabsState, action: LogTabAction): LogTabsState {
  switch (action.type) {
    case "ADD_TAB": {
      if (state.tabs.length >= MAX_TABS) return state;
      const tab = newTab(state.tabs.length + 1);
      return { tabs: [...state.tabs, tab], activeId: tab.id };
    }
    case "REMOVE_TAB": {
      if (state.tabs.length <= 1) return state;
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      const next = state.tabs.filter((t) => t.id !== action.id);
      const newActive =
        state.activeId === action.id
          ? (next[Math.max(0, idx - 1)]?.id ?? next[0].id)
          : state.activeId;
      return { tabs: next, activeId: newActive };
    }
    case "SELECT_TAB":
      return { ...state, activeId: action.id };
    case "RENAME_TAB":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, label: action.label } : t
        ),
      };
    case "UPDATE_TAB":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLogTabs() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // Persist on every change (metadata only — no results)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota exceeded — ignore */ }
  }, [state]);

  const activeTab = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];

  const addTab = useCallback(() => dispatch({ type: "ADD_TAB" }), []);
  const removeTab = useCallback((id: string) => dispatch({ type: "REMOVE_TAB", id }), []);
  const selectTab = useCallback((id: string) => dispatch({ type: "SELECT_TAB", id }), []);
  const renameTab = useCallback((id: string, label: string) => dispatch({ type: "RENAME_TAB", id, label }), []);
  const updateActiveTab = useCallback(
    (patch: Partial<Omit<LogTab, "id" | "label">>) =>
      dispatch({ type: "UPDATE_TAB", id: state.activeId, patch }),
    [state.activeId]
  );

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    activeTab,
    canAddTab: state.tabs.length < MAX_TABS,
    addTab,
    removeTab,
    selectTab,
    renameTab,
    updateActiveTab,
  };
}
