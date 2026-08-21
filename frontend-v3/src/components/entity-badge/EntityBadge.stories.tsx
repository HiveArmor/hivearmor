import type { Meta, StoryObj } from '@storybook/react';

import { EntityBadge } from './EntityBadge';

const meta = {
  title: 'HiveArmor/EntityBadge',
  component: EntityBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof EntityBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = {
  args: {
    type: 'host',
    label: 'WIN-SERVER-01',
  },
};

export const User: Story = {
  args: {
    type: 'user',
    label: 'john.doe',
  },
};

export const IpAddress: Story = {
  args: {
    type: 'ip',
    label: '192.168.1.100',
  },
};

export const Domain: Story = {
  args: {
    type: 'domain',
    label: 'malicious-site.example',
  },
};

export const Process: Story = {
  args: {
    type: 'process',
    label: 'powershell.exe',
  },
};

export const WithHighRisk: Story = {
  args: {
    type: 'host',
    label: 'COMPROMISED-HOST',
    riskScore: 92,
  },
};

export const Clickable: Story = {
  args: {
    type: 'user',
    label: 'admin',
    riskScore: 75,
    onClick: () => alert('Entity clicked'),
  },
};
