import type { Meta, StoryObj } from '@storybook/react';

import { SeverityLabel } from './SeverityLabel';

const meta = {
  title: 'HiveArmor/SeverityLabel',
  component: SeverityLabel,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SeverityLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {
  args: {
    severity: 'critical',
  },
};

export const High: Story = {
  args: {
    severity: 'high',
  },
};

export const Medium: Story = {
  args: {
    severity: 'medium',
  },
};

export const Low: Story = {
  args: {
    severity: 'low',
  },
};

export const Info: Story = {
  args: {
    severity: 'info',
  },
};

export const SmallSize: Story = {
  args: {
    severity: 'critical',
    size: 'sm',
  },
};
