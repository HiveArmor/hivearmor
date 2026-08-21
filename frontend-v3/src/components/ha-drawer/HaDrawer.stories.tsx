import type { Meta, StoryObj } from '@storybook/react';

import { HaDrawer } from './HaDrawer';

import { HaButton } from '@/components/ha-button/HaButton';

const meta = {
  title: 'HiveArmor/HaDrawer',
  component: HaDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HaDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Alert Detail',
    subtitle: 'HA-2024-00142',
    children: (
      <div style={{ color: 'var(--ha-text-primary)' }}>
        <p>Alert details content goes here.</p>
        <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
          Source: Windows Security Event Log
        </p>
      </div>
    ),
  },
};

export const WithFooter: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Incident #INC-001',
    subtitle: 'Lateral Movement Detected',
    footer: (
      <>
        <HaButton variant="primary">Escalate</HaButton>
        <HaButton>Close</HaButton>
      </>
    ),
    children: (
      <div style={{ color: 'var(--ha-text-primary)' }}>
        <p>Incident summary and investigation details.</p>
      </div>
    ),
  },
};

export const WideDrawer: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Investigation Session',
    width: 720,
    children: (
      <div style={{ color: 'var(--ha-text-primary)' }}>
        Wide drawer for complex investigations.
      </div>
    ),
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => {},
    title: 'Hidden Drawer',
    children: <div>Not visible</div>,
  },
};
