"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Terminal, Wifi, WifiOff, Loader2, Search, RefreshCw,
  ChevronRight, Trash2, Send, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  useIncidentCommandWs,
  type CommandPayload,
  type TerminalMessage,
  type WsStatus,
} from "@/hooks/use-incident-command-ws";
import { cn } from "@/lib/utils";

// ─── Agent type (from /api/agent-manager/agents) ─────────────────────────────

interface Agent {
  id: number;
  hostname: string;
  ip: string;
  os: string;
  platform: string;
  status: string; // "ONLINE" | "OFFLINE" | "UNKNOWN"
  version: string;
  lastSeen: string;
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function AgentStatusDot({ status }: { status: string }) {
  const isOnline = status === "ONLINE";
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
        isOnline ? "bg-success" : "bg-muted",
      )}
    />
  );
}

// ─── WS status badge ─────────────────────────────────────────────────────────

function WsStatusBadge({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    connected:    { label: "Connected",    icon: <Wifi className="w-3 h-3" />,        cls: "text-success" },
    connecting:   { label: "Connecting…",  icon: <Loader2 className="w-3 h-3 animate-spin" />, cls: "text-brand" },
    disconnected: { label: "Disconnected", icon: <WifiOff className="w-3 h-3" />,     cls: "text-muted" },
    error:        { label: "Error",        icon: <AlertCircle className="w-3 h-3" />, cls: "text-critical" },
  };
  const { label, icon, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-tiny font-medium", cls)}>
      {icon} {label}
    </span>
  );
}

// ─── Terminal line ────────────────────────────────────────────────────────────

function TerminalLine({ msg }: { msg: TerminalMessage }) {
  const cls: Record<TerminalMessage["type"], string> = {
    input:  "text-brand",
    output: "text-terminal-output",
    error:  "text-critical",
    system: "text-muted italic",
  };
  const prefix: Record<TerminalMessage["type"], string> = {
    input:  "$ ",
    output: "",
    error:  "! ",
    system: "# ",
  };
  return (
    <div className={cn("font-mono text-xs leading-relaxed whitespace-pre-wrap break-all", cls[msg.type])}>
      {prefix[msg.type]}{msg.text}
    </div>
  );
}

// ─── Shell selector ───────────────────────────────────────────────────────────

type Shell = "cmd" | "powershell" | "bash";

function ShellSelector({ value, onChange }: { value: Shell; onChange: (v: Shell) => void }) {
  const shells: Shell[] = ["cmd", "powershell", "bash"];
  return (
    <div className="flex items-center gap-1">
      {shells.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wide transition-colors",
            value === s
              ? "bg-brand text-white"
              : "text-muted hover:text-primary hover:bg-surface-tertiary",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InteractiveConsolePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedHostname, setSelectedHostname] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [shell, setShell] = useState<Shell>("cmd");
  const [input, setInput] = useState("");
  const [historyIdx, setHistoryIdx] = useState(-1);
  const historyRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const { status, messages, sendCommand, addMessage, clearMessages } =
    useIncidentCommandWs(selectedHostname);

  // ── Load agents ──────────────────────────────────────────────────────────
  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const { data } = await api.getWithHeaders<Agent[]>("/api/agent-manager/agents?pageSize=500");
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  // ── Auto-scroll terminal ─────────────────────────────────────────────────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Focus input on agent select ──────────────────────────────────────────
  useEffect(() => {
    if (status === "connected") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [status]);

  // ── Filtered agents ──────────────────────────────────────────────────────
  const visibleAgents = agents.filter(a => {
    const q = search.toLowerCase();
    return (
      (a.hostname ?? "").toLowerCase().includes(q) ||
      (a.ip ?? "").toLowerCase().includes(q) ||
      (a.os ?? "").toLowerCase().includes(q)
    );
  });

  // ── Select agent ─────────────────────────────────────────────────────────
  const selectAgent = (agent: Agent) => {
    const hostname = agent.hostname;
    setSelectedAgent(agent);
    setSelectedHostname(hostname);
    setInput("");
    historyRef.current = [];
    setHistoryIdx(-1);
  };

  // ── Send command ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const cmd = input.trim();
    if (!cmd || !selectedAgent || status !== "connected") return;

    addMessage(cmd, "input");
    historyRef.current = [cmd, ...historyRef.current.slice(0, 99)];
    setHistoryIdx(-1);

    const payload: CommandPayload = {
      command: cmd,
      originType: "SOAR-CONSOLE",
      originId: String(selectedAgent.id),
      reason: "Interactive console command",
      shell,
    };
    sendCommand(payload);
    setInput("");
  }, [input, selectedAgent, status, shell, sendCommand, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = historyIdx + 1;
      if (next < historyRef.current.length) {
        setHistoryIdx(next);
        setInput(historyRef.current[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(next);
        setInput(historyRef.current[next]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      clearMessages();
    }
  };

  const canSend = status === "connected" && input.trim().length > 0;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-h1">Interactive Console</h1>
        <p className="text-secondary mt-1">Execute commands on agents interactively via WebSocket</p>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 gap-4 px-6 pb-6 min-h-0">

        {/* ── Left: Agent list ─────────────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col card min-h-0">
          <div className="px-3 py-2.5 border-b border-surface-border shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-tiny font-semibold text-muted uppercase tracking-wide">Agents</span>
              <button
                onClick={loadAgents}
                disabled={agentsLoading}
                className="text-muted hover:text-primary transition-colors disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", agentsLoading && "animate-spin")} />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter…"
                className="input-base pl-6 w-full text-tiny py-1"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {agentsLoading ? (
              <div className="flex items-center justify-center py-8 text-tiny text-muted gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : visibleAgents.length === 0 ? (
              <div className="py-8 text-center text-tiny text-muted">No agents found</div>
            ) : (
              visibleAgents.map(agent => {
                const isSelected = selectedHostname === agent.hostname;
                const isOnline = agent.status === "ONLINE";
                return (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors border-b border-surface-border/50 last:border-b-0",
                      isSelected
                        ? "bg-brand/10 text-primary"
                        : "hover:bg-surface-secondary text-primary",
                    )}
                  >
                    <AgentStatusDot status={agent.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-small font-medium truncate">{agent.hostname}</span>
                        {isSelected && <ChevronRight className="w-3 h-3 text-brand shrink-0" />}
                      </div>
                      <div className="text-tiny text-muted truncate">{agent.ip}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={cn(
                          "text-[10px] font-semibold px-1 py-0 rounded",
                          isOnline ? "text-success bg-success/10" : "text-muted bg-surface-tertiary",
                        )}>
                          {agent.status ?? "UNKNOWN"}
                        </span>
                        <span className="text-[10px] text-muted truncate">{agent.os}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Terminal ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          {!selectedHostname ? (
            <div className="flex-1 card flex items-center justify-center">
              <div className="text-center">
                <Terminal className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-small font-medium text-primary">No agent selected</p>
                <p className="text-tiny text-muted mt-1">Select an agent from the left to open a console</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 card overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border shrink-0 bg-surface-secondary">
                <div className="flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-small font-semibold font-mono text-primary">
                    {selectedAgent?.hostname ?? selectedHostname}
                  </span>
                  {selectedAgent && (
                    <span className="text-tiny text-muted font-mono">{selectedAgent.ip}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <WsStatusBadge status={status} />
                  <ShellSelector value={shell} onChange={setShell} />
                  <button
                    onClick={clearMessages}
                    className="text-muted hover:text-primary transition-colors"
                    title="Clear terminal (Ctrl+L)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Terminal body */}
              <div
                ref={terminalRef}
                className="flex-1 overflow-y-auto p-4 space-y-0.5"
                style={{ background: "hsl(var(--color-surface-primary))", fontFamily: "var(--font-mono, monospace)" }}
                onClick={() => inputRef.current?.focus()}
              >
                {messages.length === 0 && status === "connected" && (
                  <div className="text-xs text-muted italic font-mono">
                    # Type a command and press Enter. Use ↑↓ for history. Ctrl+L to clear.
                  </div>
                )}
                {messages.map(msg => (
                  <TerminalLine key={msg.id} msg={msg} />
                ))}

                {/* Blinking cursor when idle */}
                {status === "connected" && (
                  <div className="h-4" />
                )}
              </div>

              {/* Input row */}
              <div className="shrink-0 border-t border-surface-border bg-surface-secondary px-3 py-2 flex items-center gap-2">
                <span className="text-brand text-xs font-mono shrink-0 select-none">$</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); setHistoryIdx(-1); }}
                  onKeyDown={handleKeyDown}
                  disabled={status !== "connected"}
                  placeholder={
                    status === "connecting" ? "Connecting…" :
                    status === "error" ? "Connection error" :
                    status === "disconnected" ? "Not connected" :
                    "Enter command…"
                  }
                  className={cn(
                    "flex-1 bg-transparent outline-none font-mono text-xs text-primary placeholder:text-muted",
                    "disabled:opacity-50",
                  )}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="text-muted hover:text-brand transition-colors disabled:opacity-30"
                  title="Send (Enter)"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
