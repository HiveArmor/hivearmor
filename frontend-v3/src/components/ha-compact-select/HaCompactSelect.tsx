import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import { HaPopover } from '@/components/ha-popover';

import './HaCompactSelect.css';

export interface HaCompactSelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface HaCompactSelectProps<T extends string = string> {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  layout?: 'inline' | 'stacked';
  onChange: (value: T) => void;
  options: Array<HaCompactSelectOption<T>>;
  value: T;
}

/**
 * HaCompactSelect — a fully token-styled dropdown (NOT a native <select>). The trigger is a button;
 * the open list is a `role="listbox"` panel rendered by HaPopover (owning outside-click / Escape /
 * focus-return), so the menu chrome is themed to Hive Carbon Hybrid instead of the OS control.
 *
 * Public API is unchanged from the previous native-select version (ariaLabel/value/options/onChange/
 * label/layout/disabled/className) so every consumer upgrades with no code change.
 *
 * Keyboard: ↑/↓ move the active option, Home/End jump, Enter/Space select, Escape closes (HaPopover).
 * WCAG 2.2 AA; tokens only.
 */
export function HaCompactSelect<T extends string = string>({
  ariaLabel,
  className = '',
  disabled = false,
  label,
  layout = 'inline',
  onChange,
  options,
  value,
}: HaCompactSelectProps<T>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // When the panel opens, point the active option at the current value.
  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const commit = useCallback(
    (index: number): void => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
    },
    [options, onChange],
  );

  const moveActive = useCallback(
    (dir: 1 | -1): void => {
      setActiveIndex((current) => {
        const n = options.length;
        let next = current;
        for (let i = 0; i < n; i += 1) {
          next = (next + dir + n) % n;
          if (!options[next]?.disabled) return next;
        }
        return current;
      });
    },
    [options],
  );

  const handleListKeyDown = (event: React.KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(options.findIndex((o) => !o.disabled));
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      default:
        break;
    }
  };

  // Focus the listbox when it opens so keyboard nav works immediately.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  return (
    <div
      className={`ha-compact-select ${className}`.trim()}
      data-layout={layout}
      data-has-label={label ? true : undefined}
      data-disabled={disabled || undefined}
      data-open={open || undefined}
    >
      {label && <span className="ha-compact-select__label">{label}</span>}
      <HaPopover
        ariaLabel={ariaLabel}
        placement="bottom-start"
        width="var(--ha-compact-select-panel-width, 220px)"
        isOpen={open}
        onOpenChange={(next) => { if (!disabled) setOpen(next); }}
        className="ha-compact-select__panel"
        trigger={
          <button
            type="button"
            className="ha-compact-select__control"
            aria-label={ariaLabel}
            disabled={disabled}
          >
            <span className="ha-compact-select__value">{selected?.label ?? ''}</span>
            <ChevronDown className="ha-compact-select__chevron" size={13} strokeWidth={1.8} aria-hidden="true" />
          </button>
        }
      >
        {({ close }) => (
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={options[activeIndex] ? `hcs-${options[activeIndex].value}` : undefined}
            tabIndex={-1}
            className="ha-compact-select__list"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { close(); return; }
              handleListKeyDown(e);
            }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`hcs-${option.value}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === activeIndex || undefined}
                className="ha-compact-select__option"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={13} aria-hidden="true" />}
              </div>
            ))}
          </div>
        )}
      </HaPopover>
    </div>
  );
}
