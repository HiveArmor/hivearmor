import type React from 'react';

import { TextArea } from '@patternfly/react-core';
import type { TextAreaProps } from '@patternfly/react-core';

export interface HaTextAreaProps extends Omit<TextAreaProps, 'onChange'> {
  onChange?: (value: string) => void;
}

export function HaTextArea({
  onChange,
  ...rest
}: HaTextAreaProps): JSX.Element {
  const handleChange = (_event: React.FormEvent<HTMLTextAreaElement>, value: string): void => {
    onChange?.(value);
  };

  return (
    <TextArea
      onChange={handleChange}
      style={{
        '--pf-v5-c-form-control--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-form-control--BackgroundColor': 'var(--ha-surface-primary)',
        '--pf-v5-c-form-control--BorderColor': 'var(--ha-border)',
        fontFamily: 'var(--ha-font-mono)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
