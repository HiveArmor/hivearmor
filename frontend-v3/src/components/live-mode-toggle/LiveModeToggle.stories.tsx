import type { Meta, StoryObj } from '@storybook/react';

import { LiveModeToggle } from './LiveModeToggle';

const meta = {
  title: 'HiveArmor/LiveModeToggle',
  component: LiveModeToggle,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LiveModeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveConnected: Story = {
  args: {
    mode: 'live',
    sseConnected: true,
    onChange: () => {},
  },
};

export const LiveDisconnected: Story = {
  args: {
    mode: 'live',
    sseConnected: false,
    onChange: () => {},
  },
};

export const Historical: Story = {
  args: {
    mode: 'historical',
    sseConnected: true,
    onChange: () => {},
  },
};
