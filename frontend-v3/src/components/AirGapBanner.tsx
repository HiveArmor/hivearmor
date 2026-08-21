import { useState } from 'react';

import { useSystemInfoStore } from '../store/systemInfoStore';

/**
 * AirGapBanner — persistent session-scoped notification rendered when HiveArmor
 * is running in air-gap mode. Dismissal is in-memory only (useState); no
 * localStorage, sessionStorage, or cookie writes occur on dismiss.
 *
 * Validates: Requirements 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13
 */
export function AirGapBanner(): JSX.Element | null {
  const airGapMode = useSystemInfoStore((s) => s.airGapMode);
  const [dismissed, setDismissed] = useState<boolean>(false);

  if (!airGapMode || dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        backgroundColor: 'var(--ha-high)',
        color: 'var(--ha-background)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <span>
        Air-gap mode active. External integrations (threat intel, email) are
        disabled.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss air-gap notice"
        style={{
          backgroundColor: 'transparent',
          color: 'var(--ha-background)',
          border: '1px solid var(--ha-background)',
          padding: '4px 12px',
          cursor: 'pointer',
          flexShrink: 0,
          borderRadius: '4px',
          fontSize: 'inherit',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
