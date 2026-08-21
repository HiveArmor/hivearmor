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
        '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
