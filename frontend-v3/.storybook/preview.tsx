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
        { name: 'hivearmor-dark', value: '#0b0919' },
        { name: 'hivearmor-panel', value: '#1a1b22' },
        { name: 'hivearmor-light', value: '#f3f4f6' },
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
  // The Storybook iframe defaults its <html> to the LIGHT theme (data-ha-theme="light"), but HaUI
  // components are dark-first — their foreground tokens are calibrated for the dark carbon surfaces,
  // so under light they render light-on-light (fails contrast, and misrepresents the product). Pin
  // the iframe to the primary dark theme, then paint the real app surface behind every story.
  decorators: [
    (Story) => {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-ha-theme', 'dark');
      }
      return (
        <div style={{ background: 'var(--ha-surface-app)', minHeight: '100vh', padding: 16 }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
