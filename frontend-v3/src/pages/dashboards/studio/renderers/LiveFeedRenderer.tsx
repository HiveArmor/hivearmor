/**
 * LiveFeedRenderer — SSE-based live feed renderer (EPS counter / alert count)
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import React, { useEffect, useState } from 'react';

import { useEpsStream } from '@/hooks/useEpsStream';
import { useAlertStreamStore } from '@/store/alertStream.store';

export interface LiveFeedRendererProps {
  config: LiveFeedWidgetConfig;
}

export interface LiveFeedWidgetConfig {
  feedType: 'eps' | 'alert_count';
  displayStyle: 'metric' | 'sparkline';
}

export function LiveFeedRenderer({ config }: LiveFeedRendererProps): React.JSX.Element {
  const { eps } = useEpsStream();
  const newAlertCount = useAlertStreamStore((s) => s.newAlertCount);

  const currentValue = config.feedType === 'eps' ? eps : newAlertCount;

  // History tracked from real SSE values only — sparkline builds as data arrives
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (config.displayStyle === 'sparkline') {
      setHistory((prev) => {
        const updated = [...prev, currentValue];
        return updated.slice(-60);
      });
    }
  }, [currentValue, config.displayStyle]);

  const label = config.feedType === 'eps' ? 'Events/sec' : 'Live Alerts';

  if (config.displayStyle === 'metric') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginBottom: '8px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 'var(--ha-text-2xl)',
            fontWeight: 'var(--ha-weight-semibold)',
            color: 'var(--ha-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {currentValue.toLocaleString()}
        </div>
      </div>
    );
  }

  // Sparkline display
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '12px',
      }}
    >
      <div
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--ha-text-xl)',
          fontWeight: 'var(--ha-weight-semibold)',
          color: 'var(--ha-primary)',
          fontVariantNumeric: 'tabular-nums',
          marginBottom: '12px',
        }}
      >
        {currentValue.toLocaleString()}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          {history.length > 1 && renderSparkline(history)}
        </svg>
      </div>
    </div>
  );
}

function renderSparkline(data: number[]): React.JSX.Element {
  if (data.length < 2) return <></>;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <polyline
      points={points}
      fill="none"
      stroke="var(--ha-primary)"
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
      style={{
        transform: 'scale(1, 0.8)',
        transformOrigin: 'center',
      }}
    />
  );
}
