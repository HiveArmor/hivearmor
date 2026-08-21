/**
 * AiIncidentSummaryCard — displays AI-generated incident summary (Sprint 25).
 *
 * Hidden when AI provider is not configured (AiIncidentSummaryCardHiddenInvariant).
 * On HTTP 503: replaces the widget with LlmUnavailableCard and shows a panel-level
 * error message; the surrounding page continues to render (Requirements 8.3, 10.6).
 *
 * Risk badge colors are driven by data-level CSS attribute selectors — no inline hex.
 *
 * Requirements: 17.3, 17.6, 17.7, 17.8, 18.1, 18.2, 18.5, 8.3, 10.6
 */

import styles from './AiIncidentSummaryCard.module.css';

import { LlmUnavailableCard, LlmUnavailableErrorStrip } from '@/components/llm-unavailable-card';
import { useAiStatus } from '@/hooks/useAiTriage';
import { useIncidentAiSummary } from '@/hooks/useIncidentAiSummary';

export interface AiIncidentSummaryCardProps {
  incidentId: string;
}

/**
 * Returns true when the error is a 503 (LLM not configured / disabled).
 */
function is503(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('503');
  }
  return false;
}

export function AiIncidentSummaryCard({ incidentId }: AiIncidentSummaryCardProps): JSX.Element | null {
  const status = useAiStatus();
  const configured = status.data?.configured === true;
  const q = useIncidentAiSummary(incidentId, configured);

  // AiIncidentSummaryCardHiddenInvariant — render nothing when provider not configured
  if (!configured) return null;

  if (q.isLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>AI Incident Summary</span>
        </div>
        <div
          role="status"
          aria-label="Generating AI analysis"
          className={styles.statusText}
        >
          Generating AI analysis…
        </div>
      </div>
    );
  }

  // HTTP 503: replace the widget with null-state card, show panel-level error message.
  // The surrounding page continues to render — we never throw here.
  if (q.isError && is503(q.error)) {
    return (
      <div className={styles.card}>
        <LlmUnavailableErrorStrip />
        <LlmUnavailableCard />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div
        className={styles.card}
        style={{ borderColor: 'var(--ha-critical)' }}
      >
        <div className={styles.header}>
          <span className={styles.title}>AI Incident Summary</span>
        </div>
        <div role="alert" className={styles.statusText}>
          AI analysis unavailable.
        </div>
      </div>
    );
  }

  const summary = q.data;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>AI Incident Summary</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Risk badge — color driven by data-level CSS attribute selector */}
          <span
            className={styles.riskBadge}
            data-level={summary.riskLevel}
            aria-label={`Risk level: ${summary.riskLevel}`}
          >
            {summary.riskLevel.toUpperCase()}
          </span>
          <button
            type="button"
            className={styles.regenerateBtn}
            onClick={() => void q.refetch()}
            aria-label="Regenerate AI incident summary"
          >
            Regenerate
          </button>
        </div>
      </div>

      <p className={styles.narrative}>{summary.narrative}</p>

      {summary.threatActorType && (
        <p className={styles.threatActor}>
          <strong>Threat Actor:</strong> {summary.threatActorType}
        </p>
      )}

      {summary.recommendedSteps.length > 0 && (
        <>
          <p className={styles.stepsLabel}>Recommended Steps</p>
          <ol className={styles.stepsList}>
            {summary.recommendedSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
