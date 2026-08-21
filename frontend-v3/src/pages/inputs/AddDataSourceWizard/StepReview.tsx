/**
 * StepReview — Step 3 of the AddDataSourceWizard.
 *
 * Displays a read-only summary of the data source the user is about to create:
 *  - Display name
 *  - Type
 *  - Every collected config field
 *
 * If the previous POST attempt failed, the parent passes `submitError` and
 * this step renders a HaInlineBanner with the error message (Req 11.6).
 *
 * Security invariants:
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *
 * Requirements: 11.2, 11.6, 13.5, 13.8, 13.9
 */

import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';
import type { HaDataSourceType } from '@/types/dataSource.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepReviewProps {
  name: string;
  type: HaDataSourceType;
  config: Record<string, string>;
  /**
   * Non-null when the previous POST attempt returned a 4xx/5xx error.
   * The banner is displayed above the review summary so the user can see
   * what went wrong without losing their entered values (Req 11.6).
   */
  submitError: string | null;
  /** Clears the error banner when dismissed. */
  onDismissError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render label in Title Case from camelCase or lowercase keys. */
function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepReview({
  name,
  type,
  config,
  submitError,
  onDismissError,
}: StepReviewProps): JSX.Element {
  const configEntries = Object.entries(config).filter(([, v]) => v.trim().length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
      {/* Error banner — rendered when POST fails (Req 11.6) */}
      {submitError !== null && (
        <HaInlineBanner
          variant="danger"
          title="Failed to create data source"
          description={submitError}
          isDismissible
          onDismiss={onDismissError}
        />
      )}

      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          margin: 0,
        }}
      >
        Review your data source settings before clicking <strong style={{ color: 'var(--ha-text-primary)' }}>Finish</strong>.
      </p>

      {/* Summary table */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          rowGap: '12px',
          columnGap: '24px',
          margin: 0,
          padding: '16px',
          backgroundColor: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base, 4px)',
        }}
      >
        {/* Name */}
        <dt
          style={{
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 600,
            color: 'var(--ha-text-secondary)',
            alignSelf: 'start',
          }}
        >
          Display Name
        </dt>
        <dd
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {name}
        </dd>

        {/* Type */}
        <dt
          style={{
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 600,
            color: 'var(--ha-text-secondary)',
            alignSelf: 'start',
          }}
        >
          Type
        </dt>
        <dd
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            margin: 0,
            fontFamily: 'var(--ha-font-mono, JetBrains Mono, monospace)',
          }}
        >
          {type}
        </dd>

        {/* Config fields */}
        {configEntries.map(([key, value]) => (
          <>
            <dt
              key={`dt-${key}`}
              style={{
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
                color: 'var(--ha-text-secondary)',
                alignSelf: 'start',
              }}
            >
              {humanizeKey(key)}
            </dt>
            <dd
              key={`dd-${key}`}
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-primary)',
                margin: 0,
                fontFamily: 'var(--ha-font-mono, JetBrains Mono, monospace)',
                wordBreak: 'break-word',
              }}
            >
              {value}
            </dd>
          </>
        ))}
      </dl>
    </div>
  );
}
