import type { Meta, StoryObj } from '@storybook/react';

import { StatusDock } from './StatusDock';

const meta = {
  title: 'HaUI/StatusDock',
  component: StatusDock,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof StatusDock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectedLive: Story = {
  args: {
    sseConnected: true,
    eps: 1243,
    mode: 'live',
  },
};

export const ConnectedHistorical: Story = {
  args: {
    sseConnected: true,
    eps: 0,
    mode: 'historical',
  },
};

export const Disconnected: Story = {
  args: {
    sseConnected: false,
    eps: 0,
    mode: 'live',
  },
};

export const StaleData: Story = {
  args: {
    sseConnected: true,
    eps: 42,
    lastUpdated: new Date(Date.now() - 20 * 60 * 1000),
  },
};
