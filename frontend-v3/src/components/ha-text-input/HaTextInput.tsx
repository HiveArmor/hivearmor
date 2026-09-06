import type React from 'react';

import { TextInput } from '@patternfly/react-core';
import type { TextInputProps } from '@patternfly/react-core';

export interface HaTextInputProps extends Omit<TextInputProps, 'onChange'> {
  onChange?: (value: string) => void;
}

export function HaTextInput({
  onChange,
  ...rest
}: HaTextInputProps): JSX.Element {
  const handleChange = (_event: React.FormEvent<HTMLInputElement>, value: string): void => {
    onChange?.(value);
  };

  return (
    <TextInput
      onChange={handleChange}
      style={{
        '--pf-v6-c-form-control--Color': 'var(--ha-foreground-primary, var(--ha-text-primary))',
        '--pf-v6-c-form-control--BackgroundColor': 'var(--ha-surface-input, var(--ha-surface-raised))',
        '--pf-v6-c-form-control--BorderColor': 'var(--ha-border-default, var(--ha-border))',
        '--pf-v6-c-form-control--hover--BorderColor': 'var(--ha-border-strong)',
        '--pf-v6-c-form-control--focus--BorderColor': 'var(--ha-border-focus)',
        '--pf-v6-c-form-control--PlaceholderColor': 'var(--ha-foreground-tertiary)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
