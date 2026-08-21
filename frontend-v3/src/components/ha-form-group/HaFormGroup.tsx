import type React from 'react';

import { FormGroup } from '@patternfly/react-core';
import type { FormGroupProps } from '@patternfly/react-core';

export type HaFormGroupProps = FormGroupProps;

export function HaFormGroup({ ...rest }: HaFormGroupProps): JSX.Element {
  return (
    <FormGroup
      style={{
        '--pf-v5-c-form__label--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-form__helper-text--Color': 'var(--ha-text-secondary)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
