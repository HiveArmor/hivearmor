/**
 * SseBanner — S16 per CMD-02 spec §8, §9 (state 11)
 * Banner shown when SSE stream is disconnected
 */

export interface SseBannerProps {
  isConnected: boolean;
  onReconnect: () => void;
}

export function SseBanner({ isConnected, onReconnect }: SseBannerProps): JSX.Element | null {
  if (isConnected) return null;

  return (
    <div
      style={{
        padding: '12px 24px',
        background: 'var(--ha-fill-high-subtle)',
        borderBottom: '1px solid var(--ha-high)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--ha-high)',
          }}
        />
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
          }}
        >
          Live alert feed disconnected. New alerts will not appear automatically. Refresh to load
          latest.
        </span>
      </div>

      <button
        onClick={onReconnect}
        style={{
          padding: '6px 12px',
          background: 'var(--ha-high)',
          border: 'none',
          borderRadius: 'var(--ha-radius-base)',
          color: 'var(--ha-foreground-on-action)',
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        type="button"
      >
        Reconnect
      </button>
    </div>
  );
}
