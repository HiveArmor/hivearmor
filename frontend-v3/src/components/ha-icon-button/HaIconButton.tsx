import type { ButtonHTMLAttributes, ReactNode } from 'react';

import './HaIconButton.css';

export interface HaIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon (typically a Lucide component). Sized by the caller. */
  icon: ReactNode;
  /**
   * Accessible name. REQUIRED — an icon-only button has no text, so without this
   * it is unlabelled to assistive tech. Enforced by the type (not optional).
   */
  'aria-label': string;
  /** Square edge length. sm=28, md=30 (default), lg=34 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Pressed/toggled visual state (e.g. an open filter popover trigger). */
  active?: boolean;
}

const SIZE_PX: Record<NonNullable<HaIconButtonProps['size']>, number> = {
  sm: 28,
  md: 30,
  lg: 34,
};

/**
 * A square, token-styled icon-only button — the consolidated form of the many
 * hand-rolled `.*-icon-button` classes (close/refresh/toggle affordances in
 * dialogs and toolbars). Tokens only; visible focus ring; honours disabled.
 * The `aria-label` is mandatory so the button is never unlabelled.
 */
export function HaIconButton({
  icon,
  size = 'md',
  active,
  className,
  type = 'button',
  ...rest
}: HaIconButtonProps) {
  const classes = className ? `ha-icon-button ${className}` : 'ha-icon-button';
  return (
    <button
      // eslint-disable-next-line react/button-has-type
      type={type}
      className={classes}
      data-size={size}
      data-active={active || undefined}
      style={{ '--ha-icon-button-size': `${SIZE_PX[size]}px` } as React.CSSProperties}
      {...rest}
    >
      {icon}
    </button>
  );
}
