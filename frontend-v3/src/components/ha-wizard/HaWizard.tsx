import type React from 'react';

import { Wizard } from '@patternfly/react-core';
import type { WizardProps } from '@patternfly/react-core';

export type HaWizardProps = WizardProps;

export function HaWizard({ ...rest }: HaWizardProps): JSX.Element {
  return (
    <Wizard
      style={{
        '--pf-v5-c-wizard--BackgroundColor': 'var(--ha-surface-primary)',
        '--pf-v5-c-wizard__nav--BackgroundColor': 'var(--ha-surface-raised)',
        '--pf-v5-c-wizard__nav-link--Color': 'var(--ha-text-primary)',
        '--pf-v5-c-wizard__nav-link--active--Color': 'var(--ha-primary)',
        '--pf-v5-c-wizard__main--BackgroundColor': 'var(--ha-surface-primary)',
        '--pf-v5-c-wizard__main-body--Color': 'var(--ha-text-primary)',
      } as React.CSSProperties}
      {...rest}
    />
  );
}
