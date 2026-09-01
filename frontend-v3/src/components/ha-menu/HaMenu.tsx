import type React from 'react';

import { HaPopover, type HaPopoverPlacement } from '@/components/ha-popover';

import './HaMenu.css';

export interface HaMenuProps {
  /** Trigger element (a button). Cloned by HaPopover to wire toggle + a11y. */
  trigger: React.ReactElement;
  /** Accessible label for the menu. */
  ariaLabel: string;
  /** Menu items — use HaMenu.Item / HaMenu.CheckboxItem / HaMenu.Label. */
  children: React.ReactNode;
  /** Placement relative to the trigger. Defaults to `bottom-end`. */
  placement?: HaPopoverPlacement;
  /** Fixed menu width. */
  width?: number | string;
}

/**
 * HaMenu — a dropdown menu built ON HaPopover (reusing its open/dismiss/positioning/focus/a11y
 * shell), extracted from three hand-rolled menus: the Detection + Entity column-pickers (checkbox
 * menus) and the Search & Hunt IndexScopePicker (single-select). Consumers stop re-implementing
 * the absolute-positioned menu surface + outside-click + Escape each time.
 *
 * Subcomponents: `HaMenu.Item` (action row), `HaMenu.CheckboxItem` (toggle row for column-pickers),
 * `HaMenu.Label` (section eyebrow). Tokens only; the surface + `--ha-z-dropdown` come from HaPopover.
 */
export function HaMenu({
  trigger,
  ariaLabel,
  children,
  placement = 'bottom-end',
  width,
}: HaMenuProps): JSX.Element {
  return (
    <HaPopover trigger={trigger} ariaLabel={ariaLabel} placement={placement} width={width} className="ha-menu">
      <div role="menu" aria-label={ariaLabel} className="ha-menu__list">
        {children}
      </div>
    </HaPopover>
  );
}

export interface HaMenuItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  children: React.ReactNode;
}

function HaMenuItem({ disabled, className, children, ...rest }: HaMenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={['ha-menu__item', className].filter(Boolean).join(' ')}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface HaMenuCheckboxItemProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function HaMenuCheckboxItem({
  checked,
  onToggle,
  disabled,
  children,
}: HaMenuCheckboxItemProps): JSX.Element {
  return (
    <label className="ha-menu__checkbox" role="menuitemcheckbox" aria-checked={checked}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <span>{children}</span>
    </label>
  );
}

function HaMenuLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <strong className="ha-menu__label">{children}</strong>;
}

HaMenu.Item = HaMenuItem;
HaMenu.CheckboxItem = HaMenuCheckboxItem;
HaMenu.Label = HaMenuLabel;
