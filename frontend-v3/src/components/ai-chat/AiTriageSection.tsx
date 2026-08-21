/**
 * AiTriageSection — displays the AI triage summary inside AlertContextDrawer.
 *
 * Hidden entirely when AI provider is not configured (AiTriageSectionHiddenInvariant).
 * On HTTP 503: triage panel is hidden, LlmUnavailableCard is shown, surrounding page
 * continues to render (Requirements 8.3, 10.6).
 *
 * Requirements: 13.4, 13.5, 13.6, 8.3, 10.6
 */

import { useState } from 'react';

import { LlmUnavailableCard, LlmUnavailableErrorStrip } from '@/components/llm-unavailable-card';
import { useAiTriage } from '@/hooks/useAiTriage';

export interface AiTriageSectionProps {
  alertId: string;
  statusConfigured: boolean;
}

/** Character count above which the summary is truncated with a Show more toggle. */
const TRUNCATION_LIMIT = 300;

/**
 * Returns true when the error is a 503 (LLM not configured / disabled).
 * Handles both `Error` objects with a status in the message and plain status strings.
 */
function is503(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('503');
  }
  return false;
}

export function AiTriageSection({ alertId, statusConfigured }: AiTriageSectionProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const q = useAiTriage(alertId, statusConfigured);

  // AiTriageSectionHiddenInvariant — render nothing when provider is not configured
  if (!statusConfigured) return null;

  if (q.isLoading) {
    return (
      <section
        aria-label="AI triage"
        style={{
          borderTop: '1px solid var(--ha-border)',
          padding: '12px 16px',
        }}
      >
        <div
          role="status"
          aria-label="Generating triage"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--ha-text-secondary)',
            fontSize: '0.8125rem',
          }}
        >
          <span aria-hidden="true">⋯</span>
          Generating AI triage…
        </div>
      </section>
    );
  }

  // HTTP 503: hide the triage panel, show null-state card + panel-level message.
  // The surrounding page continues to render — we never throw here.
  if (q.isError && is503(q.error)) {
    return (
      <section
        aria-label="AI triage"
        style={{
          borderTop: '1px solid var(--ha-border)',
          padding: '12px 16px',
        }}
      >
        <LlmUnavailableErrorStrip />
        <LlmUnavailableCard />
      </section>
    );
  }

  if (q.isError || !q.data) {
    return (
      <section
        aria-label="AI triage"
        style={{
          borderTop: '1px solid var(--ha-border)',
          padding: '12px 16px',
        }}
      >
        <div
          role="alert"
          style={{
            color: 'var(--ha-text-secondary)',
            fontSize: '0.8125rem',
          }}
        >
          AI unavailable — triage could not be generated.
        </div>
      </section>
    );
  }

  const summary = q.data.summary;
  const isLong = summary.length > TRUNCATION_LIMIT;
  const displayText = isLong && !expanded ? `${summary.slice(0, TRUNCATION_LIMIT)}…` : summary;

  return (
    <section
      aria-label="AI triage"
      style={{
        borderTop: '1px solid var(--ha-border)',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--ha-intelligence)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          AI Triage
        </span>
        <button
          type="button"
          onClick={() => void q.refetch()}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ha-primary)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: '2px 6px',
          }}
          aria-label="Regenerate AI triage"
        >
          Regenerate
        </button>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '0.8125rem',
          color: 'var(--ha-text-primary)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {displayText}
      </p>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ha-primary)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            marginTop: 4,
            padding: 0,
          }}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  );
}
