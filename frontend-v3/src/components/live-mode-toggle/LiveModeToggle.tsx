/**
 * LiveModeToggle — Two-state toggle for Live vs. Historical mode
 * Used on AlertsListPage
 */

import './LiveModeToggle.css';

export interface LiveModeToggleProps {
  mode: 'live' | 'historical';
  onChange: (mode: 'live' | 'historical') => void;
  sseConnected: boolean;
}

export function LiveModeToggle({ mode, onChange, sseConnected }: LiveModeToggleProps): JSX.Element {
  return (
    <div className="live-mode-toggle">
      <button
        type="button"
        className={`live-mode-toggle__segment ${mode === 'live' ? 'live-mode-toggle__segment--active' : ''}`}
        onClick={() => onChange('live')}
      >
        <div
          className={`live-mode-toggle__dot ${mode === 'live' && sseConnected ? 'live-mode-toggle__dot--pulse' : ''}`}
          style={{
            backgroundColor:
              mode === 'live'
                ? sseConnected
                  ? 'var(--ha-primary)'
                  : 'var(--ha-high)'
                : 'transparent',
          }}
        />
        <span>Live</span>
      </button>
      <button
        type="button"
        className={`live-mode-toggle__segment ${mode === 'historical' ? 'live-mode-toggle__segment--active' : ''}`}
        onClick={() => onChange('historical')}
      >
        <span>Historical</span>
      </button>
    </div>
  );
}
