import type { Meta, StoryObj } from '@storybook/react';

import { HaModal } from './HaModal';

const meta = {
  title: 'HiveArmor/HaModal',
  component: HaModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HaModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Confirm Action',
    children: (
      <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>
        Are you sure you want to perform this action? This cannot be undone.
      </div>
    ),
  },
};

export const Wide: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Alert Details',
    width: 800,
    children: (
      <div style={{ padding: '16px', color: 'var(--ha-text-primary)' }}>
        Wide modal content with more detailed information.
      </div>
    ),
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => {},
    title: 'Hidden Modal',
    children: <div>Not visible</div>,
  },
};
