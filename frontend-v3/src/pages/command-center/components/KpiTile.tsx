/**
 * KPI Tile Component
 * Displays a single KPI metric with optional severity indicator and pulse animation.
 */

import type { ReactNode } from 'react';

export interface KpiTileProps {
  title: string;
  value: number | string;
  loading?: boolean;
  indicator?: 'critical' | 'high' | 'medium' | 'pulse';
  className?: string;
}

export function KpiTile({ title, value, loading, indicator, className }: KpiTileProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        padding: '16px 20px',
        minWidth: '160px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 'var(--ha-weight-medium)',
        }}
      >
        {loading ? (
          <div
            style={{
              height: '12px',
              width: '60px',
              background: 'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              borderRadius: '2px',
            }}
          />
        ) : (
          title
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {indicator && !loading && (
          <IndicatorDot type={indicator} />
        )}

        <div
          style={{
            fontFamily: 'var(--ha-font-mono)',
            fontSize: 'var(--ha-text-2xl)',
            fontWeight: 'var(--ha-weight-semibold)',
            color: 'var(--ha-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {loading ? (
            <div
              style={{
                height: '20px',
                width: '48px',
                background: 'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
                borderRadius: '2px',
              }}
            />
          ) : (
            value
          )}
        </div>
      </div>
    </div>
  );
}

interface IndicatorDotProps {
  type: 'critical' | 'high' | 'medium' | 'pulse';
}

function IndicatorDot({ type }: IndicatorDotProps): ReactNode {
  const colors: Record<string, string> = {
    critical: 'var(--ha-critical)',
    high: 'var(--ha-high)',
    medium: 'var(--ha-medium)',
    pulse: 'var(--ha-primary)',
  };

  const color = colors[type];
  const isPulse = type === 'pulse';

  return (
    <div style={{ position: 'relative', width: '8px', height: '8px' }}>
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
        }}
      />
      {isPulse && (
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'pulse 2s infinite',
          }}
        />
      )}
    </div>
  );
}
