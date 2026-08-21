import type { Meta, StoryObj } from '@storybook/react';

import { StatusLabel } from './StatusLabel';

const meta = {
  title: 'HiveArmor/StatusLabel',
  component: StatusLabel,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof StatusLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    status: 'open',
  },
};

export const InProgress: Story = {
  args: {
    status: 'in_progress',
  },
};

export const Resolved: Story = {
  args: {
    status: 'resolved',
  },
};

export const Closed: Story = {
  args: {
    status: 'closed',
  },
};

export const FalsePositive: Story = {
  args: {
    status: 'false_positive',
  },
};

export const SmallSize: Story = {
  args: {
    status: 'open',
    size: 'sm',
  },
};
