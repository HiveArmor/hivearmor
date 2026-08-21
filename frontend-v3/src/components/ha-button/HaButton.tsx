import type React from 'react';

import { Button, Spinner } from '@patternfly/react-core';
import type { ButtonProps } from '@patternfly/react-core';

export interface HaButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'plain' | 'link';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function HaButton({
  variant = 'secondary',
  icon,
  isLoading,
  children,
  ...rest
}: HaButtonProps): JSX.Element {
  const pfVariant =
    variant === 'danger' ? 'danger' : variant === 'primary' ? 'primary' : 'secondary';

  return (
    <Button
      variant={pfVariant}
      icon={isLoading ? <Spinner size="sm" /> : icon}
      isLoading={isLoading}
      style={{
        '--pf-v6-c-button--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v6-c-button--Color': 'var(--ha-text-primary)',
        '--pf-v6-c-button--BorderColor': 'var(--ha-border)',
        '--pf-v6-c-button--m-primary--BackgroundColor': 'var(--ha-primary)',
        '--pf-v6-c-button--m-primary--Color': 'var(--ha-foreground-on-action)',
        '--pf-v6-c-button--m-danger--BackgroundColor': 'var(--ha-critical)',
        '--pf-v6-c-button--m-danger--Color': 'var(--ha-foreground-on-action)',
      } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Button>
  );
}
