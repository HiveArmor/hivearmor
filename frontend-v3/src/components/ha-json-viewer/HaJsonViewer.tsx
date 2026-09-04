/**
 * HaJsonViewer — safe, tokenized JSON viewer with line numbers, collapsible nodes, and
 * copy-to-clipboard. Renders every token as a `<span>` (NO dangerouslySetInnerHTML).
 *
 * Promoted to HaUI from pages/alerts/components/SyntaxHighlightedJson (rule-of-three: alerts
 * investigation + hunt event flyout). Colours come from the dedicated --ha-json-* token family
 * (full type-colouring is sanctioned in raw-JSON view only) instead of borrowing severity/intel.
 *
 * lifecycle: beta
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';

import './HaJsonViewer.css';

export interface HaJsonViewerProps {
  data: Record<string, unknown>;
  /** Accessible label for the copy button region; defaults to a generic label. */
  ariaLabel?: string;
}

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

interface Token {
  type: TokenType;
  value: string;
}

type CollapsedPaths = Set<string>;

export function HaJsonViewer({ data, ariaLabel = 'Raw JSON' }: HaJsonViewerProps): JSX.Element {
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
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const lines = useMemo(() => renderJson(data, collapsed), [data, collapsed]);

  return (
    <div className="ha-json-viewer" ref={containerRef} aria-label={ariaLabel}>
      <button
        type="button"
        className="ha-json-viewer__copy-btn"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy JSON to clipboard'}
        title={copied ? 'Copied!' : 'Copy JSON'}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      <div className="ha-json-viewer__scroll">
        <table className="ha-json-viewer__table" role="presentation">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="ha-json-viewer__row">
                <td className="ha-json-viewer__line-number" aria-hidden="true">
                  {idx + 1}
                </td>
                <td className="ha-json-viewer__content">
                  {line.indent > 0 && (
                    <span style={{ paddingLeft: `${line.indent * 16}px` }} />
                  )}
                  {line.collapsible && (
                    <button
                      type="button"
                      className="ha-json-viewer__toggle"
                      onClick={() => togglePath(line.path ?? '')}
                      aria-label={line.isCollapsed ? 'Expand' : 'Collapse'}
                      aria-expanded={!line.isCollapsed}
                    >
                      {line.isCollapsed
                        ? <ChevronRight size={12} aria-hidden="true" />
                        : <ChevronDown size={12} aria-hidden="true" />}
                    </button>
                  )}
                  {line.tokens.map((tok, ti) => (
                    <span key={ti} className={`ha-json-viewer__token--${tok.type}`}>
                      {tok.value}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── JSON rendering logic (unchanged from the source component) ─── */

interface RenderedLine {
  tokens: Token[];
  indent: number;
  collapsible: boolean;
  isCollapsed: boolean;
  path?: string;
}

function renderJson(data: unknown, collapsed: CollapsedPaths): RenderedLine[] {
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
          renderValue(item, indent + 1, itemPath, null, i < value.length - 1);
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
          const prefix: Token[] = [
            { type: 'key', value: `"${escapeJson(key)}"` },
            { type: 'punctuation', value: ': ' },
          ];
          renderValue(val, indent + 1, entryPath, prefix, i < entries.length - 1);
        });
        const closeTokens: Token[] = [{ type: 'punctuation', value: '}' }];
        if (trailingComma) closeTokens.push({ type: 'punctuation', value: ',' });
        lines.push({ tokens: closeTokens, indent, collapsible: false, isCollapsed: false });
      }
      return;
    }
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
