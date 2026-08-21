/**
 * AiChatPanel — fixed 400px right-side sliding chat panel (Sprint 25).
 *
 * Invariants enforced here:
 * - NoDangerouslySetInnerHtmlInvariant: renderMarkdown uses only JSX children
 * - NoExternalMarkdownLibraryInvariant: no react-markdown / marked / etc.
 * - NoAnyTypeInvariant: zero `any` types
 * - NoRawHexInvariant: CSS module uses --ha-* tokens (rgba overlay is the exception)
 *
 * On HTTP 503 (LLM not configured):
 * - The chat widget is replaced with LlmUnavailableCard.
 * - The AI triage panel area shows an LlmUnavailableErrorStrip.
 * - The surrounding page continues to render (Requirements 8.3, 10.6).
 */

import React, { useState, useEffect, useRef } from 'react';

import styles from './AiChatPanel.module.css';

import { LlmUnavailableCard, LlmUnavailableErrorStrip } from '@/components/llm-unavailable-card';
import { aiChatService } from '@/services/aiChatService';
import type { AiChatMessage, AiContextType, AiChatHistoryEntry } from '@/types/ai.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  contextType: AiContextType;
  contextId?: string;
  contextSummary?: string;
}

// ---------------------------------------------------------------------------
// Suggested prompts map — exact strings from design.md
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export const SUGGESTED_PROMPTS: Record<AiContextType, string[]> = {
  alert: [
    'Summarize this alert',
    'Suggest investigation steps',
    'Check for related MITRE techniques',
  ],
  incident: [
    'Summarize this incident',
    'What is the likely attack vector?',
    'Suggest containment steps',
  ],
  general: [
    'What are the top alerts today?',
    'Show me unusual login activity',
    'Explain the current threat landscape',
  ],
};

// ---------------------------------------------------------------------------
// Inline markdown renderer — NO dangerouslySetInnerHTML, NO external libraries
// ---------------------------------------------------------------------------

/**
 * Converts a subset of markdown to React nodes.
 * Supports: `**bold**`, `` `code` ``, and `- ` / `* ` bullet lines.
 * Never uses dangerouslySetInnerHTML (NoDangerouslySetInnerHtmlInvariant).
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let lineKey = 0;

  function flushBullets() {
    if (bulletBuffer.length > 0) {
      result.push(
        <ul key={`ul-${lineKey++}`} className={styles.bulletList}>
          {bulletBuffer.map((item, i) => (
            <li key={i} className={styles.bulletItem}>
              {inlineTokens(item)}
            </li>
          ))}
        </ul>,
      );
      bulletBuffer = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      bulletBuffer.push(trimmed.slice(2));
    } else {
      flushBullets();
      if (line.trim() === '') {
        result.push(<br key={`br-${lineKey++}`} />);
      } else {
        result.push(<span key={`line-${lineKey++}`}>{inlineTokens(line)}</span>);
      }
    }
  }
  flushBullets();
  return result;
}

/**
 * Processes inline tokens (**bold** and `code`) within a single line.
 */
function inlineTokens(text: string): React.ReactNode[] {
  // Split on backtick code spans first, then bold
  const parts: React.ReactNode[] = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segKey = 0;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...boldTokens(text.slice(lastIndex, match.index), segKey++));
    }
    parts.push(
      <code key={`code-${segKey++}`} className={styles.codeToken}>
        {match[1]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(...boldTokens(text.slice(lastIndex), segKey++));
  }
  return parts;
}

function boldTokens(text: string, baseKey: number): React.ReactNode[] {
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<React.Fragment key={`t-${baseKey}-${i++}`}>{text.slice(lastIndex, match.index)}</React.Fragment>);
    }
    parts.push(<strong key={`b-${baseKey}-${i++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<React.Fragment key={`t-${baseKey}-${i++}`}>{text.slice(lastIndex)}</React.Fragment>);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiChatPanel(props: AiChatPanelProps): JSX.Element | null {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmUnavailable, setLlmUnavailable] = useState(false);
  const [history, setHistory] = useState<AiChatHistoryEntry[]>([]);
  const [hasFirstDelta, setHasFirstDelta] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // Load chat history on open
  useEffect(() => {
    if (!props.open) return;
    aiChatService
      .getHistory(props.contextType, props.contextId)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [props.open, props.contextType, props.contextId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // Early return after hooks — never before (rules-of-hooks)
  if (!props.open) return null;

  async function send(): Promise<void> {
    if (streaming || !input.trim()) return;
    const userMsg: AiChatMessage = { role: 'user', content: input.trim() };
    const initialAssistant: AiChatMessage = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, initialAssistant]);
    setInput('');
    setStreaming(true);
    setHasFirstDelta(false);
    setError(null);

    try {
      for await (const evt of aiChatService.streamChat(
        [...messages, userMsg],
        props.contextType,
        props.contextId,
      )) {
        if (evt.done) break;
        setHasFirstDelta(true);
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = {
            role: 'assistant',
            content: last.content + evt.delta,
          };
          return next;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI chat failed';
      // HTTP 503 — LLM provider disabled/unconfigured.
      // Replace the chat widget with a null-state card; keep the panel mounted.
      if (msg.includes('503')) {
        setLlmUnavailable(true);
        setError(null);
      } else {
        setError(msg);
      }
      // Remove the empty assistant placeholder on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      setHasFirstDelta(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const showSuggestions = messages.length === 0 && !streaming;
  const showLoadHistory = messages.length === 0 && history.length > 0;

  return (
    <div className={styles.overlay} onClick={props.onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-label="AI assistant"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — always shown so the panel can be closed */}
        <header className={styles.header}>
          <span className={styles.headerTitle}>
            AI Assistant
            {props.contextSummary && (
              <span style={{ color: 'var(--ha-text-secondary)', fontWeight: 400 }}>
                {' — '}{props.contextSummary}
              </span>
            )}
          </span>
          <button
            className={styles.closeButton}
            onClick={props.onClose}
            aria-label="Close AI assistant"
            type="button"
          >
            ✕
          </button>
        </header>

        {/*
          HTTP 503 — LLM provider unavailable.
          Replace the chat widget with a null-state card + panel-level error message.
          The surrounding page (and this panel's header/close button) continue to render.
          Requirements: 8.3, 10.6
        */}
        {llmUnavailable ? (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
            <LlmUnavailableErrorStrip />
            <LlmUnavailableCard />
          </div>
        ) : (
          <>
            {/* Load-history banner */}
            {showLoadHistory && (
              <div className={styles.loadHistoryBanner}>
                <button
                  type="button"
                  className={styles.loadHistoryButton}
                  onClick={() => setMessages(history[0].messages)}
                >
                  Load previous conversation
                </button>
              </div>
            )}

            {/* Message list */}
            <div className={styles.messageList} ref={messageListRef}>
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const isStreamingAssistant = streaming && isLast && m.role === 'assistant';

                return (
                  <div
                    key={i}
                    className={`${styles.message} ${
                      m.role === 'user' ? styles.userMessage : styles.assistantMessage
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <>
                        {isStreamingAssistant && !hasFirstDelta ? (
                          <span className={styles.thinkingDots} aria-label="Thinking">
                            <span className={styles.dot} />
                            <span className={styles.dot} />
                            <span className={styles.dot} />
                          </span>
                        ) : (
                          renderMarkdown(m.content)
                        )}
                        {isStreamingAssistant && hasFirstDelta && (
                          <span className={styles.streamingCursor} aria-hidden="true" />
                        )}
                      </>
                    ) : (
                      m.content
                    )}
                  </div>
                );
              })}
            </div>

            {/* Suggested prompts */}
            {showSuggestions && (
              <div className={styles.suggestions}>
                {SUGGESTED_PROMPTS[props.contextType].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    className={styles.suggestionChip}
                    onClick={() => setInput(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className={styles.error}>
                {error}
              </div>
            )}

            {/* Footer */}
            <footer className={styles.footer}>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                aria-label="Chat input"
              />
              <button
                type="button"
                className={styles.sendButton}
                onClick={() => void send()}
                disabled={streaming || !input.trim()}
                aria-label="Send message"
              >
                Send
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
