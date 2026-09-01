import type React from 'react';

import './HaLabel.css';

export interface HaLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Optional leading icon. Inherits the label color via currentColor. */
  icon?: React.ReactNode;
  /**
   * Semantic color for the whole label (icon + text). Pass a token
   * (e.g. `var(--ha-state-healthy)`) — color here communicates MEANING (status/verdict).
   * Omit for the default foreground.
   */
  color?: string;
  /** Small or medium (default) density. */
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

/**
 * HaLabel — the inline "icon + colored text" label extracted from StatusLabel (and the shape
 * TlpBadge approximates). Unlike HaBadge it has no pill/border by default: it is a lightweight
 * status/verdict label where COLOR carries the meaning and is paired with an icon + text so
 * color is never the sole differentiator (WCAG). Consumers pass the icon, the color token, and
 * the text; the domain color/label maps stay in the consumer.
 */
export function HaLabel({
  icon,
  color,
  size = 'md',
  className,
  children,
  style,
  ...rest
}: HaLabelProps): JSX.Element {
  return (
    <span
      className={['ha-label', `ha-label--${size}`, className].filter(Boolean).join(' ')}
      style={color ? { color, ...style } : style}
      {...rest}
    >
      {icon}
      <span className="ha-label__text">{children}</span>
    </span>
  );
}
