/**
 * NetworkIdRenderer — AG Grid cell renderer for IP/hostname
 * Mono font per CMD-02 spec §6.1
 */

interface NetworkIdRendererProps {
  value?: string; // IP or hostname
}

export function NetworkIdRenderer({ value }: NetworkIdRendererProps): JSX.Element {
  if (!value) {
    return (
      <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>—</span>
    );
  }

  return (
    <span
      style={{
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-sm)',
        color: 'var(--ha-text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  );
}
