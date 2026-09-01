import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import './HaPopover.css';

export type HaPopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface HaPopoverRenderProps {
  /** Close the popover (e.g. from a Cancel button or after a successful submit). */
  close: () => void;
}

export interface HaPopoverProps {
  /**
   * The trigger element. It is cloned to receive `onClick`, `aria-expanded`,
   * `aria-haspopup="dialog"`, and a ref — so pass a single focusable element (a button).
   */
  trigger: ReactElement;
  /** Panel body. A render function receives `{ close }` so content can dismiss the popover. */
  children: ReactNode | ((props: HaPopoverRenderProps) => ReactNode);
  /** Accessible label for the panel dialog. */
  ariaLabel: string;
  /** Panel placement relative to the trigger. Defaults to `bottom-end`. */
  placement?: HaPopoverPlacement;
  /** Fixed panel width in px, or a CSS width string. Defaults to auto (content width). */
  width?: number | string;
  /** Controlled open state. Omit for uncontrolled (the popover manages its own state). */
  isOpen?: boolean;
  /** Called whenever the popover requests an open-state change (both controlled + uncontrolled). */
  onOpenChange?: (open: boolean) => void;
  /** Extra class on the panel. */
  className?: string;
}

/**
 * HaPopover — the anchored-panel shell extracted from AddFilterPopover + FieldSelectorPopover
 * (rule of three: the open/close/click-outside/Escape/positioning/a11y logic was duplicated).
 *
 * It owns: toggle-on-trigger, dismiss on outside-pointerdown, dismiss on Escape, focus return to
 * the trigger on close, `role="dialog"` panel + `aria-expanded`/`aria-haspopup` on the trigger,
 * token-based panel chrome, and the `--ha-z-dropdown` layer. Content (form, list, header/footer)
 * stays in the consumer.
 *
 * Value over hand-rolling: consumers no longer re-implement the dismiss/focus/a11y contract —
 * FieldSelectorPopover was missing Escape + focus-return entirely; both get it for free here.
 */
export function HaPopover({
  trigger,
  children,
  ariaLabel,
  placement = 'bottom-end',
  width,
  isOpen: controlledOpen,
  onOpenChange,
  className,
}: HaPopoverProps): JSX.Element {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const setOpen = useCallback(
    (next: boolean): void => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const close = useCallback((): void => {
    setOpen(false);
    // Return focus to the trigger for keyboard users.
    triggerRef.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen, close]);

  // Clone the trigger to wire toggle + a11y + ref without dictating its markup.
  const triggerEl = trigger as ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    ref?: React.Ref<HTMLButtonElement>;
  }>;
  const existingRef = (triggerEl as { ref?: React.Ref<HTMLButtonElement> }).ref;
  const clonedTrigger = cloneElement(triggerEl, {
    ref: (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof existingRef === 'function') existingRef(node);
      else if (existingRef && typeof existingRef === 'object') {
        (existingRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      }
    },
    onClick: (event: React.MouseEvent) => {
      triggerEl.props.onClick?.(event);
      setOpen(!open);
    },
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? panelId : undefined,
  } as Partial<typeof triggerEl.props> & Record<string, unknown>);

  return (
    <div className="ha-popover" ref={rootRef}>
      {clonedTrigger}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={ariaLabel}
          className={['ha-popover__panel', `ha-popover__panel--${placement}`, className]
            .filter(Boolean)
            .join(' ')}
          style={width !== undefined ? { width } : undefined}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
