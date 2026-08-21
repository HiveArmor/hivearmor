/**
 * TitleCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.3
 * Shows truncated title + optional MITRE badge.
 */

import type { QueueItem } from '@/types/alert.types';

export interface TitleCellProps {
  value: string;
  data?: QueueItem;
}

export function TitleCell({ value, data }: TitleCellProps): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <span
        title={value}
        style={{
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 'var(--ha-weight-medium)',
          color: 'var(--ha-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        {value}
      </span>

      {data?.mitreTactic && (
        <span
          title={data.mitreTechnique ? `${data.mitreTactic} · ${data.mitreTechnique}` : data.mitreTactic}
          style={{
            flexShrink: 0,
            fontSize: 'var(--ha-text-xs)',
            padding: '1px 6px',
            borderRadius: '9999px',
            background: 'var(--ha-fill-intelligence-muted)',
            border: '1px solid color-mix(in srgb, var(--ha-intelligence-primary) 30%, transparent)',
            color: 'var(--ha-intelligence)',
            fontFamily: 'var(--ha-font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          {data.mitreTechnique ?? data.mitreTactic}
        </span>
      )}
    </span>
  );
}
