export interface HaSelectProps {
  options: Array<{
    value: string;
    label: string;
    isDisabled?: boolean;
  }>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function HaSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  isDisabled,
  className = '',
  id,
  name,
  ariaLabel,
}: HaSelectProps): JSX.Element {
  return (
    <select
      id={id}
      name={name}
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={isDisabled}
      className={className}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: 'var(--ha-text-sm)',
        fontFamily: 'var(--ha-font-ui)',
        color: 'var(--ha-text-primary)',
        backgroundColor: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        cursor: 'pointer',
      }}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.isDisabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}
