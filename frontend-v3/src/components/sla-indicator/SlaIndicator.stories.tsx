import type { Meta, StoryObj } from '@storybook/react';

import { SlaIndicator } from './SlaIndicator';

const meta = {
  title: 'HaUI/SlaIndicator',
  component: SlaIndicator,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SlaIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTrack: Story = {
  args: {
    dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  },
};

export const AtRisk: Story = {
  args: {
    dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },
};

export const Breached: Story = {
  args: {
    dueAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
};

export const NoSla: Story = {
  args: {
    dueAt: null,
  },
};

export const SmallSize: Story = {
  args: {
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    size: 'sm',
  },
};
