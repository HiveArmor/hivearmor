export interface HaMultiSelectProps {
  id: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

export function HaMultiSelect({
  id,
  options,
  selected,
  onChange,
  placeholder = 'Select options…',
  isDisabled,
}: HaMultiSelectProps): JSX.Element {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const selectedOptions = Array.from(event.target.selectedOptions, (option) => option.value);
    onChange(selectedOptions);
  };

  return (
    <select
      id={id}
      multiple
      value={selected}
      onChange={handleChange}
      disabled={isDisabled}
      style={{
        width: '100%',
        padding: '8px 12px',
        minHeight: '100px',
        fontSize: 'var(--ha-text-sm)',
        fontFamily: 'var(--ha-font-ui)',
        color: 'var(--ha-text-primary)',
        backgroundColor: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
      }}
      aria-label={placeholder}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
