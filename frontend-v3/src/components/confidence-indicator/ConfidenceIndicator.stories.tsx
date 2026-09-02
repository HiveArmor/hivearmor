import type { Meta, StoryObj } from '@storybook/react';

import { ConfidenceIndicator } from './ConfidenceIndicator';

const meta = {
  title: 'HaUI/ConfidenceIndicator',
  component: ConfidenceIndicator,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ConfidenceIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Low: Story = {
  args: {
    score: 20,
  },
};

export const Medium: Story = {
  args: {
    score: 50,
  },
};

export const High: Story = {
  args: {
    score: 85,
  },
};

export const Full: Story = {
  args: {
    score: 100,
  },
};

export const SmallNoLabel: Story = {
  args: {
    score: 75,
    size: 'sm',
    showLabel: false,
  },
};
