import type React from 'react';

import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import type { ToggleGroupProps } from '@patternfly/react-core';

export interface HaToggleGroupProps
  extends Omit<ToggleGroupProps, 'children' | 'onChange'> {
  options: Array<{
    value: string;
    label: string;
    icon?: React.ReactNode;
    isDisabled?: boolean;
  }>;
  value?: string;
  onChange?: (value: string) => void;
}

export function HaToggleGroup({
  options,
  value,
  onChange,
  ...rest
}: HaToggleGroupProps): JSX.Element {
  return (
    <ToggleGroup
      style={{
        '--pf-v5-c-toggle-group__button--BackgroundColor':
          'var(--ha-surface-raised)',
        '--pf-v5-c-toggle-group__button--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-toggle-group__button--BorderColor': 'var(--ha-border)',
        '--pf-v5-c-toggle-group__button--m-selected--BackgroundColor':
          'var(--ha-primary)',
        '--pf-v5-c-toggle-group__button--m-selected--Color':
          'var(--ha-background)',
      } as React.CSSProperties}
      {...rest}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          text={option.label}
          icon={option.icon}
          isSelected={value === option.value}
          isDisabled={option.isDisabled}
          onChange={() => onChange?.(option.value)}
        />
      ))}
    </ToggleGroup>
  );
}
