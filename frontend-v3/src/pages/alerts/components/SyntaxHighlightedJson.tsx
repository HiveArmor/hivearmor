/**
 * SyntaxHighlightedJson — Colorful JSON viewer with line numbers,
 * collapsible nodes, and copy-to-clipboard.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';

/* ─── Props ─── */

interface SyntaxHighlightedJsonProps {
  data: Record<string, unknown>;
}

/* ─── Token types ─── */

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

interface Token {
  type: TokenType;
  value: string;
}

/* ─── Collapsed state tracking ─── */

type CollapsedPaths = Set<string>;

/* ─── Component ─── */

export function SyntaxHighlightedJson({ data }: SyntaxHighlightedJsonProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<CollapsedPaths>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure context
      const textarea = document.createElement('textarea');
      textarea.value = jsonString;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [jsonString]);

  const togglePath = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const lines = useMemo(() => renderJson(data, collapsed), [data, collapsed]);

  return (
    <div className="syntax-json" ref={containerRef}>
      <button
        type="button"
        className="syntax-json__copy-btn"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy JSON to clipboard'}
        title={copied ? 'Copied!' : 'Copy JSON'}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      <div className="syntax-json__scroll">
        <table className="syntax-json__table" role="presentation">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="syntax-json__row">
                <td className="syntax-json__line-number" aria-hidden="true">
                  {idx + 1}
                </td>
                <td className="syntax-json__content">
                  {line.indent > 0 && (
                    <span style={{ paddingLeft: `${line.indent * 16}px` }} />
                  )}
                  {line.collapsible && (
                    <button
                      type="button"
                      className="syntax-json__toggle"
                      onClick={() => togglePath(line.path ?? '')}
                      aria-label={line.isCollapsed ? 'Expand' : 'Collapse'}
                      aria-expanded={!line.isCollapsed}
                    >
                      {line.isCollapsed
                        ? <ChevronRight size={12} aria-hidden="true" />
                        : <ChevronDown size={12} aria-hidden="true" />}
                    </button>
                  )}
                  {line.tokens.map((token, ti) => (
                    <span key={ti} className={`syntax-json__token--${token.type}`}>
                      {token.value}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{syntaxJsonStyles}</style>
    </div>
  );
}

/* ─── JSON rendering logic ─── */

interface RenderedLine {
  tokens: Token[];
  indent: number;
  collapsible: boolean;
  isCollapsed: boolean;
  path?: string;
}

function renderJson(
  data: unknown,
  collapsed: CollapsedPaths,
): RenderedLine[] {
  const lines: RenderedLine[] = [];

  function renderValue(
    value: unknown,
    indent: number,
    path: string,
    keyPrefix: Token[] | null,
    trailingComma: boolean,
  ): void {
    if (value === null) {
      const tokens: Token[] = [...(keyPrefix ?? []), { type: 'null', value: 'null' }];
      if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
      lines.push({ tokens, indent, collapsible: false, isCollapsed: false });
      return;
    }

    if (typeof value === 'string') {
      const tokens: Token[] = [...(keyPrefix ?? []), { type: 'string', value: `"${escapeJson(value)}"` }];
      if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
      lines.push({ tokens, indent, collapsible: false, isCollapsed: false });
      return;
    }

    if (typeof value === 'number') {
      const tokens: Token[] = [...(keyPrefix ?? []), { type: 'number', value: String(value) }];
      if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
      lines.push({ tokens, indent, collapsible: false, isCollapsed: false });
      return;
    }

    if (typeof value === 'boolean') {
      const tokens: Token[] = [...(keyPrefix ?? []), { type: 'boolean', value: String(value) }];
      if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
      lines.push({ tokens, indent, collapsible: false, isCollapsed: false });
      return;
    }

    if (Array.isArray(value)) {
      const isCollapsed = collapsed.has(path);
      if (isCollapsed) {
        const tokens: Token[] = [
          ...(keyPrefix ?? []),
          { type: 'punctuation', value: '[' },
          { type: 'punctuation', value: `…${value.length} items` },
          { type: 'punctuation', value: ']' },
        ];
        if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
        lines.push({ tokens, indent, collapsible: true, isCollapsed: true, path });
      } else {
        const openTokens: Token[] = [...(keyPrefix ?? []), { type: 'punctuation', value: '[' }];
        lines.push({ tokens: openTokens, indent, collapsible: true, isCollapsed: false, path });

        value.forEach((item, i) => {
          const itemPath = `${path}[${i}]`;
          const hasComma = i < value.length - 1;
          renderValue(item, indent + 1, itemPath, null, hasComma);
        });

        const closeTokens: Token[] = [{ type: 'punctuation', value: ']' }];
        if (trailingComma) closeTokens.push({ type: 'punctuation', value: ',' });
        lines.push({ tokens: closeTokens, indent, collapsible: false, isCollapsed: false });
      }
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const isCollapsed = collapsed.has(path);

      if (isCollapsed) {
        const tokens: Token[] = [
          ...(keyPrefix ?? []),
          { type: 'punctuation', value: '{' },
          { type: 'punctuation', value: `…${entries.length} keys` },
          { type: 'punctuation', value: '}' },
        ];
        if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
        lines.push({ tokens, indent, collapsible: true, isCollapsed: true, path });
      } else {
        const openTokens: Token[] = [...(keyPrefix ?? []), { type: 'punctuation', value: '{' }];
        lines.push({ tokens: openTokens, indent, collapsible: true, isCollapsed: false, path });

        entries.forEach(([key, val], i) => {
          const entryPath = `${path}.${key}`;
          const hasComma = i < entries.length - 1;
          const prefix: Token[] = [
            { type: 'key', value: `"${escapeJson(key)}"` },
            { type: 'punctuation', value: ': ' },
          ];
          renderValue(val, indent + 1, entryPath, prefix, hasComma);
        });

        const closeTokens: Token[] = [{ type: 'punctuation', value: '}' }];
        if (trailingComma) closeTokens.push({ type: 'punctuation', value: ',' });
        lines.push({ tokens: closeTokens, indent, collapsible: false, isCollapsed: false });
      }
      return;
    }

    // Fallback for unexpected types
    const tokens: Token[] = [...(keyPrefix ?? []), { type: 'string', value: String(value) }];
    if (trailingComma) tokens.push({ type: 'punctuation', value: ',' });
    lines.push({ tokens, indent, collapsible: false, isCollapsed: false });
  }

  renderValue(data, 0, '$', null, false);
  return lines;
}

function escapeJson(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/* ─── Styles ─── */

const syntaxJsonStyles = `
  .syntax-json {
    position: relative;
    background: var(--ha-surface-input);
    border: 1px solid var(--ha-border-default);
    border-radius: 6px;
    overflow: hidden;
  }
  .syntax-json__scroll {
    overflow: auto;
    max-height: 400px;
    padding: 12px 0;
  }
  .syntax-json__copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--ha-border-default);
    border-radius: 4px;
    background: var(--ha-surface-elevated);
    color: var(--ha-foreground-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .syntax-json__copy-btn:hover {
    border-color: var(--ha-border-strong);
    color: var(--ha-foreground-primary);
  }
  .syntax-json__table {
    border-collapse: collapse;
    width: 100%;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
  }
  .syntax-json__row:hover {
    background: color-mix(in srgb, var(--ha-foreground-primary) 3%, transparent);
  }
  .syntax-json__line-number {
    width: 40px;
    min-width: 40px;
    padding: 0 10px 0 12px;
    text-align: right;
    color: var(--ha-foreground-tertiary);
    user-select: none;
    font-size: 11px;
    opacity: 0.6;
    vertical-align: top;
  }
  .syntax-json__content {
    padding: 0 16px 0 4px;
    white-space: pre;
  }
  .syntax-json__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    margin-right: 2px;
    border: none;
    background: transparent;
    color: var(--ha-foreground-tertiary);
    cursor: pointer;
    border-radius: 3px;
    vertical-align: middle;
    transition: all 0.15s ease;
  }
  .syntax-json__toggle:hover {
    background: color-mix(in srgb, var(--ha-foreground-primary) 8%, transparent);
    color: var(--ha-foreground-primary);
  }
  /* Token colors */
  .syntax-json__token--key {
    color: var(--ha-action-primary);
  }
  .syntax-json__token--string {
    color: var(--ha-severity-low);
  }
  .syntax-json__token--number {
    color: var(--ha-severity-high);
  }
  .syntax-json__token--boolean {
    color: var(--ha-intelligence-primary);
  }
  .syntax-json__token--null {
    color: var(--ha-severity-critical);
    font-style: italic;
  }
  .syntax-json__token--punctuation {
    color: var(--ha-foreground-tertiary);
  }
`;
