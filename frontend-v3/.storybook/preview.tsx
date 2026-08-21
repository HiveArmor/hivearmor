import type { Preview } from '@storybook/react';
import '../src/styles/tokens.css';
import '../src/styles/foundation.css';
import '../src/styles/global.css';
import '../src/styles/patternfly-overrides.css';
import '../src/styles/ag-grid-ha.css';
import '@patternfly/react-core/dist/styles/base.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'hivearmor-dark',
      values: [
        { name: 'hivearmor-dark', value: '#070A0F' },
        { name: 'hivearmor-surface', value: '#0D131C' },
      ],
    },
    layout: 'centered',
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
        ],
      },
    },
  },
};

export default preview;
