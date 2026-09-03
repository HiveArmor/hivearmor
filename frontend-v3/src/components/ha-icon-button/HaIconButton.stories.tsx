import type { Meta, StoryObj } from '@storybook/react';
import { RefreshCw, X } from 'lucide-react';

import { HaIconButton } from './HaIconButton';

const meta = {
  title: 'HaUI/HaIconButton',
  component: HaIconButton,
  parameters: { lifecycle: 'beta' },
  tags: ['autodocs'],
} satisfies Meta<typeof HaIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Close: Story = { args: { icon: <X size={14} />, 'aria-label': 'Close' } };

export const Refresh: Story = { args: { icon: <RefreshCw size={14} />, 'aria-label': 'Refresh' } };

export const Sizes: Story = {
  args: { icon: <X size={14} />, 'aria-label': 'Close' },
  render: (args) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <HaIconButton {...args} size="sm" />
      <HaIconButton {...args} size="md" />
      <HaIconButton {...args} size="lg" />
    </div>
  ),
};

export const Active: Story = { args: { icon: <X size={14} />, 'aria-label': 'Filters', active: true, size: 'lg' } };

export const Disabled: Story = { args: { icon: <X size={14} />, 'aria-label': 'Close', disabled: true } };
