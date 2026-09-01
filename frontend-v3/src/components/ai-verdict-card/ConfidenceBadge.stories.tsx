import type { Meta, StoryObj } from '@storybook/react';

import { ConfidenceBadge } from './ConfidenceBadge';

/** Lifecycle: **alpha**. AI-kit confidence pill in intelligence-violet (not severity). */
const meta = {
  title: 'HaUI/AI Kit/ConfidenceBadge',
  component: ConfidenceBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
  args: { value: 87 },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = { args: { value: 92 } };
export const Mid: Story = { args: { value: 64 } };
export const Low: Story = { args: { value: 0.31 } };
export const Medium: Story = { args: { value: 78, size: 'md' } };
