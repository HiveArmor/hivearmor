/**
 * TagsRenderer — AG Grid cell renderer for alert tags
 * Shows max 2 tags, then "+N more" per CMD-02 spec §18
 */

interface TagsRendererProps {
  value?: string[];
}

export function TagsRenderer({ value }: TagsRendererProps): JSX.Element {
  if (!value || value.length === 0) {
    return (
      <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>—</span>
    );
  }

  const visible = value.slice(0, 2);
  const overflow = value.length - 2;

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      {visible.map((tag, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: 'var(--ha-radius-sm)',
            background: 'var(--ha-fill-primary-muted)',
            color: 'var(--ha-primary)',
            fontSize: 'var(--ha-text-xs)',
            fontWeight: 500,
          }}
        >
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
            fontWeight: 500,
          }}
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}
