import { ChevronDown } from 'lucide-react';

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
  return (
    <label
      className={`ha-compact-select ${className}`.trim()}
      data-layout={layout}
      data-has-label={label ? true : undefined}
      data-disabled={disabled || undefined}
    >
      {label && <span className="ha-compact-select__label">{label}</span>}
      <select
        className="ha-compact-select__control"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="ha-compact-select__chevron" size={13} strokeWidth={1.8} aria-hidden="true" />
    </label>
  );
}
