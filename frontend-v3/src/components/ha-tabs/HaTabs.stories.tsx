import type { Meta, StoryObj } from '@storybook/react';

import { HaTabs } from './HaTabs';

const meta = {
  title: 'HaUI/HaTabs',
  component: HaTabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof HaTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activeKey: 'overview',
    onSelect: () => {},
    tabs: [
      {
        key: 'overview',
        title: 'Overview',
        content: (
          <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>
            Overview tab content
          </div>
        ),
      },
      {
        key: 'timeline',
        title: 'Timeline',
        content: (
          <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>
            Timeline tab content
          </div>
        ),
      },
      {
        key: 'entities',
        title: 'Entities',
        content: (
          <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>
            Entities tab content
          </div>
        ),
      },
    ],
  },
};

export const WithDisabledTab: Story = {
  args: {
    activeKey: 'overview',
    onSelect: () => {},
    tabs: [
      {
        key: 'overview',
        title: 'Overview',
        content: (
          <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>Overview content</div>
        ),
      },
      {
        key: 'reports',
        title: 'Reports',
        isDisabled: true,
        content: <div />,
      },
    ],
  },
};
