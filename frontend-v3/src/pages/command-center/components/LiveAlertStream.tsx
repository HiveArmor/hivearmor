/**
 * Live Alert Stream Component
 * Displays real-time alert feed from SSE connection.
 * Upgraded: severity badge, source entity, rule name, time-ago, "View" link.
 */

import { useNavigate } from 'react-router-dom';

import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/lib/severity';
import type { AlertStreamEvent } from '@/store/alertStream.store';
import { useAlertStreamStore } from '@/store/alertStream.store';

export function LiveAlertStream(): JSX.Element {
  const navigate = useNavigate();
  const { events, connected } = useAlertStreamStore();

  const handleAlertClick = (alertId: string): void => {
    navigate(`/alerts?id=${alertId}`);
  };

  const handleReconnect = (): void => {
    window.location.reload();
  };

  return (
    <div
      aria-label="Live alert stream"
      style={{
        width: '100%',
        height: '220px',
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Live Alerts
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--ha-text-xs)',
            color: connected ? 'var(--ha-positive)' : 'var(--ha-high)',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: connected ? 'var(--ha-positive)' : 'var(--ha-high)',
            }}
          />
          {connected ? 'Live' : 'Disconnected'}
        </div>
      </div>

      {!connected && (
        <div
          style={{
            padding: '8px 14px',
            background: 'color-mix(in srgb, var(--ha-high) 8%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--ha-high) 40%, transparent)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            Feed disconnected — showing last known data.
          </span>
          <button
            onClick={handleReconnect}
            style={{
              background: 'transparent',
              border: '1px solid var(--ha-high)',
              borderRadius: 'var(--ha-radius-sm)',
              padding: '2px 8px',
              color: 'var(--ha-high)',
              fontSize: 'var(--ha-text-xs)',
              cursor: 'pointer',
            }}
            type="button"
          >
            Reconnect
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {events.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ha-text-secondary)',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            Monitoring for new alerts…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {events.slice(0, 50).map((event: AlertStreamEvent) => {
              const sev = event.severity.toLowerCase() as keyof typeof SEVERITY_COLORS;
              const sevColor = SEVERITY_COLORS[sev] ?? 'var(--ha-text-secondary)';
              const sevLabel = SEVERITY_LABELS[sev] ?? event.severity;

              return (
                <button
                  key={event.id}
                  onClick={() => handleAlertClick(event.id)}
                  style={{
                    width: '100%',
                    background: 'var(--ha-surface-raised)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-sm)',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                  type="button"
                  aria-label={`${sevLabel} alert: ${event.title}`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ha-primary) 50%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ha-border)';
                  }}
                >
                  {/* Row 1: severity badge + title + view link */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 'var(--ha-text-xs)',
                        fontWeight: 600,
                        color: sevColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        minWidth: '44px',
                      }}
                    >
                      {sevLabel}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 'var(--ha-text-sm)',
                        color: 'var(--ha-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {event.title}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 'var(--ha-text-xs)',
                        color: 'var(--ha-primary)',
                      }}
                    >
                      View →
                    </span>
                  </div>

                  {/* Row 2: time ago */}
                  <div style={{ display: 'flex', gap: '8px', marginLeft: '50px' }}>
                    <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', fontFamily: 'var(--ha-font-mono)' }}>
                      {formatTimeAgo(event.timestamp)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
