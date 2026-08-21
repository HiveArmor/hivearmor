import { Label } from '@patternfly/react-core';

import type { TlpLevel } from '../../types/threatIntel.types';

// TLP colour values are normative per the CISA Traffic Light Protocol standard.
// PatternFly semantic colours (grey/green/orange/red) are used to approximate
// the normative palette. These are the only permitted colour assignments in this component.

interface TlpBadgeProps {
  tlp: TlpLevel;
  size?: 'sm' | 'md';
}

type PfLabelColor = 'grey' | 'green' | 'orange' | 'red';

const TLP_COLOR_MAP: Record<TlpLevel, PfLabelColor> = {
  WHITE: 'grey',
  GREEN: 'green',
  AMBER: 'orange',
  RED: 'red',
};

export function TlpBadge({ tlp, size = 'md' }: TlpBadgeProps): JSX.Element {
  const color = TLP_COLOR_MAP[tlp];
  const isCompact = size === 'sm';

  return (
    <Label
      color={color}
      isCompact={isCompact}
    >
      {`TLP:${tlp}`}
    </Label>
  );
}

export default TlpBadge;
