import { Switch } from '@patternfly/react-core';

export interface HaSwitchProps {
  id?: string;
  label?: string;
  isChecked?: boolean;
  onChange?: (checked: boolean) => void;
  isDisabled?: boolean;
  className?: string;
}

export function HaSwitch({
  id,
  label,
  isChecked,
  onChange,
  isDisabled,
  className,
}: HaSwitchProps): JSX.Element {
  return (
    <Switch
      id={id}
      label={label}
      isChecked={isChecked}
      onChange={(_event, checked) => onChange?.(checked)}
      isDisabled={isDisabled}
      className={className}
      style={{
        '--pf-v5-c-switch__toggle--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v5-c-switch__toggle--BorderColor': 'var(--ha-border)',
        '--pf-v5-c-switch__toggle--checked--BackgroundColor': 'var(--ha-primary)',
        '--pf-v5-c-switch__label--Color': 'var(--ha-text-primary)',
      } as React.CSSProperties}
    />
  );
}
