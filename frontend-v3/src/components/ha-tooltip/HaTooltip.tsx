import type React from 'react';

import { Tooltip } from '@patternfly/react-core';
import type { TooltipProps } from '@patternfly/react-core';

export type HaTooltipPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface HaTooltipProps
  extends Omit<TooltipProps, 'position' | 'content' | 'children'> {
  /** Tooltip body. Keep short — a dense SOC UI uses tooltips for labels/definitions, not prose. */
  content: React.ReactNode;
  /** The trigger element the tooltip describes. */
  children: React.ReactElement;
  /** Placement relative to the trigger. Defaults to `top`. */
  position?: HaTooltipPosition;
}

/**
 * HaTooltip — thin wrapper over PatternFly 6 `Tooltip` that:
 *  - paints the tooltip in Hive Carbon Hybrid tokens (elevated surface, strong border, body text),
 *  - layers it on the `--ha-z-tooltip` scale (top of the overlay order),
 *  - defaults to `aria="describedby"` so the trigger is announced with its description,
 *  - applies calm entry/exit delays so it doesn't flicker on a dense scan.
 *
 * Motion is handled in HaTooltip.css (honors `prefers-reduced-motion`).
 * Value over using PF `Tooltip` directly: tokens + z-scale + a11y defaults + a constrained position API.
 */
export function HaTooltip({
  content,
  children,
  position = 'top',
  aria = 'describedby',
  entryDelay = 300,
  exitDelay = 100,
  distance = 12,
  className,
  ...rest
}: HaTooltipProps): JSX.Element {
  return (
    <Tooltip
      content={content}
      position={position}
      aria={aria}
      entryDelay={entryDelay}
      exitDelay={exitDelay}
      distance={distance}
      className={['ha-tooltip', className].filter(Boolean).join(' ')}
      style={
        {
          '--pf-v6-c-tooltip__content--BackgroundColor': 'var(--ha-surface-elevated)',
          '--pf-v6-c-tooltip__content--Color': 'var(--ha-foreground-primary)',
          '--pf-v6-c-tooltip__content--BorderRadius': 'var(--ha-radius-control)',
          '--pf-v6-c-tooltip__content--FontSize': '13px',
          '--pf-v6-c-tooltip__content--PaddingBlockStart': '6px',
          '--pf-v6-c-tooltip__content--PaddingBlockEnd': '6px',
          '--pf-v6-c-tooltip__content--PaddingInlineStart': '10px',
          '--pf-v6-c-tooltip__content--PaddingInlineEnd': '10px',
          '--pf-v6-c-tooltip--BoxShadow': 'var(--ha-shadow-control)',
          '--pf-v6-c-tooltip--MaxWidth': '260px',
          '--pf-v6-c-tooltip__arrow--BackgroundColor': 'var(--ha-surface-elevated)',
          zIndex: 'var(--ha-z-tooltip)',
        } as React.CSSProperties
      }
      {...rest}
    >
      {children}
    </Tooltip>
  );
}
