import type React from 'react';

import { Switch } from '@patternfly/react-core';
import type { SwitchProps } from '@patternfly/react-core';

export interface HaToggleProps extends Omit<SwitchProps, 'onChange' | 'ref'> {
  onChange?: (checked: boolean) => void;
}

export function HaToggle({
  onChange,
  ...rest
}: HaToggleProps): JSX.Element {
  const handleChange = (_event: React.FormEvent<HTMLInputElement>, checked: boolean): void => {
    onChange?.(checked);
  };

  return (
    <Switch
      onChange={handleChange}
      style={{
        '--pf-v5-c-switch__toggle--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v5-c-switch__toggle--BorderColor': 'var(--ha-border)',
        '--pf-v5-c-switch--m-on__toggle--BackgroundColor': 'var(--ha-primary)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
