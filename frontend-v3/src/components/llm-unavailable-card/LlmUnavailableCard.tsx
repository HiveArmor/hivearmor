/**
 * LlmUnavailableCard — null-state card displayed in place of any LLM-backed
 * widget when the backend returns HTTP 503.
 *
 * Design invariants:
 *  - NoRawHexInvariant: all colors via var(--ha-*) CSS tokens.
 *  - NoAnyTypeInvariant: zero `any` types.
 *  - Page is never crashed — this is a pure render-only component that is
 *    swapped in for the widget when a 503 is detected.
 *
 * The component is paired with `LlmUnavailableErrorStrip` which renders the
 * panel-level error message banner that sits above the card.
 *
 * Requirements: 8.3, 10.6
 */

import { BrainCircuit, AlertTriangle } from 'lucide-react';

import styles from './LlmUnavailableCard.module.css';

import { HaCard } from '@/components/ha-card';


// ---------------------------------------------------------------------------
// LlmUnavailableCard
// ---------------------------------------------------------------------------

export interface LlmUnavailableCardProps {
  /**
   * Optional description shown beneath the title.
   * Defaults to "Ask an administrator to configure an AI provider."
   */
  description?: string;
}

/**
 * Null-state card rendered in place of any LLM widget when a 503 is received.
 *
 * Drop-in replacement: wrap the LLM widget in a conditional that switches to
 * this card whenever `llmUnavailable` state is true.
 *
 * @example
 * {llmUnavailable
 *   ? <LlmUnavailableCard />
 *   : <MyLlmWidget />}
 */
export function LlmUnavailableCard({
  description = 'Ask an administrator to configure an AI provider.',
}: LlmUnavailableCardProps): JSX.Element {
  return (
    <HaCard role="status" aria-label="AI unavailable">
      <HaCard.Body className={styles.body}>
        <BrainCircuit
          size={32}
          className={styles.icon}
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <p className={styles.title}>AI provider unavailable</p>
        <p className={styles.description}>{description}</p>
      </HaCard.Body>
    </HaCard>
  );
}

// ---------------------------------------------------------------------------
// LlmUnavailableErrorStrip — panel-level error message (shown above the card)
// ---------------------------------------------------------------------------

export interface LlmUnavailableErrorStripProps {
  /** Override the default error text. */
  message?: string;
}

/**
 * Panel-level amber banner that sits above the `LlmUnavailableCard`.
 * Rendered at the container/panel level so it is always visible even when
 * the card itself is scrolled out of view.
 *
 * @example
 * {llmUnavailable && (
 *   <>
 *     <LlmUnavailableErrorStrip />
 *     <LlmUnavailableCard />
 *   </>
 * )}
 */
export function LlmUnavailableErrorStrip({
  message = 'AI service is not available (HTTP 503). AI features are disabled.',
}: LlmUnavailableErrorStripProps): JSX.Element {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={styles.errorStrip}
    >
      <AlertTriangle
        size={14}
        className={styles.errorStripIcon}
        aria-hidden="true"
      />
      {message}
    </div>
  );
}
