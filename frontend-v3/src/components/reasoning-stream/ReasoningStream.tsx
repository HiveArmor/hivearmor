import type React from 'react';

import './ReasoningStream.css';

export interface ReasoningStreamCitation {
  /** Short label, e.g. "GTI: 10.0.14.203". */
  label: string;
  /** Optional click handler to pivot to the source (log line, IoC record). */
  onClick?: () => void;
}

export interface ReasoningStreamLine {
  id: string;
  text: React.ReactNode;
  /** Optional evidence citations attached to this reasoning line. */
  citations?: ReasoningStreamCitation[];
}

export interface ReasoningStreamProps {
  /** Reasoning lines produced so far (append-only; newest last). */
  lines: ReasoningStreamLine[];
  /** True while the agent is still thinking — drives the live caret + Stop button. */
  streaming?: boolean;
  /** Fired when the analyst stops the agent mid-stream. */
  onStop?: () => void;
  /** Accessible label for the live region. */
  ariaLabel?: string;
  className?: string;
}

/**
 * ReasoningStream — the live "watch the agent think" surface (design §5a). Streams the agent's
 * reasoning lines into an `aria-live="polite"` region so screen readers announce new thoughts,
 * shows a blinking caret while streaming, and offers a Stop control to halt the agent mid-run.
 * Reasoning lines can carry inline evidence citations that pivot to the source.
 *
 * Wears `--ha-intelligence-primary` provenance. Tokens only; caret animation honors
 * `prefers-reduced-motion`. This is the "AI shows its work" principle made concrete.
 */
export function ReasoningStream({
  lines,
  streaming = false,
  onStop,
  ariaLabel = 'AI reasoning',
  className,
}: ReasoningStreamProps): JSX.Element {
  return (
    <div className={['ha-reasoning', className].filter(Boolean).join(' ')}>
      <div className="ha-reasoning__head">
        <span className="ha-reasoning__title">
          <span className="ha-reasoning__glyph" aria-hidden="true">✦</span>
          {streaming ? 'Reasoning…' : 'Reasoning'}
        </span>
        {streaming && onStop && (
          <button type="button" className="ha-reasoning__stop" onClick={onStop} aria-label="Stop the agent">
            ■ Stop
          </button>
        )}
      </div>

      <ol className="ha-reasoning__lines" aria-live="polite" aria-label={ariaLabel} aria-busy={streaming}>
        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          return (
            <li className="ha-reasoning__line" key={line.id}>
              <span className="ha-reasoning__text">
                {line.text}
                {streaming && isLast && <span className="ha-reasoning__caret" aria-hidden="true" />}
              </span>
              {line.citations && line.citations.length > 0 && (
                <span className="ha-reasoning__cites">
                  {line.citations.map((c, ci) => (
                    <button
                      key={`${c.label}-${ci}`}
                      type="button"
                      className="ha-reasoning__cite"
                      onClick={c.onClick}
                      disabled={!c.onClick}
                    >
                      {c.label}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
