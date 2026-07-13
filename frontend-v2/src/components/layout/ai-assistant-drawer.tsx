"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Brain, X, Send, RotateCcw, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { socAiService } from "@/services/soc-ai.service";
import { UtmAlert } from "@/types/alert";

// ── Types ─────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  loading?: boolean;
}

type DrawerStatus = "idle" | "unavailable";

// ── Helpers ───────────────────────────────────────────────────────────────────

let msgCounter = 0;
function makeId() { return `msg-${++msgCounter}`; }

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildContextHint(pathname: string): string {
  if (pathname.startsWith("/alerts"))    return "You are currently viewing the Alerts page.";
  if (pathname.startsWith("/incidents")) return "You are currently viewing the Incidents page.";
  if (pathname.startsWith("/dashboard")) return "You are currently viewing the Dashboard.";
  return "";
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="text-center py-1">
        <span className="text-tiny text-muted italic">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-3.5 h-3.5 text-brand" />
        </div>
      )}
      <div className={cn(
        "max-w-[80%] rounded-xl px-3 py-2 text-small",
        isUser
          ? "bg-brand text-white rounded-tr-sm"
          : "bg-surface-tertiary text-secondary rounded-tl-sm"
      )}>
        {msg.loading ? (
          <span className="flex gap-1 items-center text-muted">
            <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
        <div className={cn("text-tiny mt-1 opacity-60", isUser ? "text-right" : "")}>
          {formatTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface AiAssistantDrawerProps {
  /** Optional: pre-inject an alert context (e.g. from alert detail panel) */
  contextAlert?: UtmAlert | null;
}

export function AiAssistantDrawer({ contextAlert }: AiAssistantDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<DrawerStatus>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      const contextHint = buildContextHint(pathname ?? "");
      const greeting = contextAlert
        ? `Hello! I'm your AI SOC Assistant. I can analyze alert **"${contextAlert.name}"** for you — just ask, or click **Analyze Alert** below.`
        : `Hello! I'm your AI SOC Assistant. I can help you triage alerts, explain findings, and suggest next steps. ${contextHint}`;
      setMessages([{
        id: makeId(),
        role: "assistant",
        content: greeting,
        timestamp: new Date(),
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const addMessage = useCallback((msg: Omit<Message, "id">) => {
    const full: Message = { ...msg, id: makeId() };
    setMessages((prev) => [...prev, full]);
    return full.id;
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    addMessage({ role: "user", content: text, timestamp: new Date() });

    const loadingId = addMessage({
      role: "assistant",
      content: "",
      timestamp: new Date(),
      loading: true,
    });

    try {
      // If the user message references an alert and we have contextAlert, try triage
      const isAnalyzeRequest =
        contextAlert &&
        /analyz|triage|classify|check|review/i.test(text);

      if (isAnalyzeRequest && contextAlert) {
        const queued = await socAiService.analyze(contextAlert);
        if (!queued || queued.status === "error") {
          updateMessage(loadingId, {
            loading: false,
            content: "The SOC-AI service is currently unavailable. Please try again later.",
          });
          setStatus("unavailable");
          return;
        }

        updateMessage(loadingId, {
          loading: false,
          content: `Analysis queued for **"${contextAlert.name}"**. Polling for results...`,
        });

        // Poll for result
        const pollId = addMessage({
          role: "assistant",
          content: "",
          timestamp: new Date(),
          loading: true,
        });

        const result = await socAiService.analyzeAndPoll(contextAlert, {
          maxAttempts: 15,
          intervalMs: 3000,
          onPoll: (attempt) => {
            updateMessage(pollId, {
              content: `Checking result... (attempt ${attempt})`,
              loading: true,
            });
          },
        });

        if (!result || result.status === "FAILED") {
          updateMessage(pollId, {
            loading: false,
            content: "Analysis failed or timed out. You can retry from the alert's SOC AI tab.",
          });
        } else {
          let reasoning: string[] = [];
          let nextSteps: { action: string; details: string }[] = [];
          try { reasoning = JSON.parse(result.reasoning ?? "[]"); } catch { /* */ }
          try { nextSteps = JSON.parse(result.nextSteps ?? "[]"); } catch { /* */ }

          const lines: string[] = [
            `**Classification:** ${result.classification ?? "Unknown"}`,
            result.confidenceScore !== undefined
              ? `**Confidence:** ${result.confidenceScore.toFixed(1)}%`
              : "",
            "",
            reasoning.length ? "**Reasoning:**\n" + reasoning.map((r) => `• ${r}`).join("\n") : "",
            nextSteps.length
              ? "\n**Next Steps:**\n" + nextSteps.map((s, i) => `${i + 1}. ${s.action} — ${s.details}`).join("\n")
              : "",
          ].filter(Boolean);

          updateMessage(pollId, {
            loading: false,
            content: lines.join("\n"),
          });
        }
      } else {
        // General question — return a context-aware hint (no LLM chat endpoint exists yet)
        const contextHint = buildContextHint(pathname ?? "");
        const reply = [
          "I can help with the following:",
          "• **Analyze an alert** — open an alert's detail panel, click \"AI Analysis\", or ask me to analyze it here.",
          "• **Explain findings** — paste or describe an alert and ask what it means.",
          "• **Suggest next steps** — once analysis is complete, I'll list recommended actions.",
          contextHint ? `\n*Context: ${contextHint}*` : "",
        ].filter(Boolean).join("\n");

        // Small delay to feel natural
        await new Promise((r) => setTimeout(r, 600));
        updateMessage(loadingId, { loading: false, content: reply });
      }
    } catch {
      updateMessage(loadingId, {
        loading: false,
        content: "Something went wrong. Please try again.",
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, contextAlert, pathname, addMessage, updateMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAnalyze = useCallback(async () => {
    if (!contextAlert) return;
    setInput(`Analyze alert: ${contextAlert.name}`);
    // Trigger via setTimeout so state settles
    setTimeout(handleSend, 0);
  }, [contextAlert, handleSend]);

  const handleClear = () => {
    setMessages([]);
    setStatus("idle");
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-[60] w-12 h-12 rounded-full shadow-lg",
          "flex items-center justify-center transition-all duration-200",
          open
            ? "bg-surface-tertiary border border-surface-border text-muted hover:text-primary"
            : "bg-brand text-white hover:opacity-90 hover:scale-105"
        )}
        title="AI SOC Assistant"
      >
        {open ? <X className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
      </button>

      {/* Drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[58]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={cn(
          "fixed bottom-[88px] right-6 z-[59] w-[380px] max-h-[600px]",
          "bg-surface-primary border border-surface-border rounded-2xl shadow-drawer",
          "flex flex-col overflow-hidden transition-all duration-200 origin-bottom-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-surface-border shrink-0">
          <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-small font-semibold text-primary">AI SOC Assistant</p>
            {status === "unavailable" ? (
              <p className="text-tiny text-severity-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> AI unavailable
              </p>
            ) : (
              <p className="text-tiny text-muted">Powered by SOC-AI engine</p>
            )}
          </div>
          <button
            onClick={handleClear}
            title="Clear conversation"
            className="toolbar-btn text-muted hover:text-secondary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="toolbar-btn text-muted hover:text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Context alert chip */}
        {contextAlert && (
          <div className="px-3 pt-2 shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-surface-border text-tiny">
              <ChevronRight className="w-3 h-3 text-brand shrink-0" />
              <span className="text-secondary truncate flex-1">{contextAlert.name}</span>
              <button
                onClick={handleQuickAnalyze}
                disabled={sending}
                className="text-brand hover:underline shrink-0 disabled:opacity-50"
              >
                Analyze
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-surface-border shrink-0">
          <div className="flex items-end gap-2 bg-surface-secondary rounded-xl border border-surface-border px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this alert…"
              rows={1}
              className="flex-1 bg-transparent text-small text-secondary placeholder:text-muted resize-none outline-none max-h-28 overflow-y-auto"
              style={{ lineHeight: "1.5" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                input.trim() && !sending
                  ? "bg-brand text-white hover:opacity-90"
                  : "bg-surface-tertiary text-muted cursor-not-allowed"
              )}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-tiny text-muted mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </>
  );
}
